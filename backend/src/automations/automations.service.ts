import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { AutomationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SaasService } from '../saas/saas.service';

const TRIGGERS = ['ORDER_DELIVERED', 'ORDER_CREATED', 'RETURN_REQUESTED'] as const;
const ACTIONS = ['SEND_WHATSAPP_TEMPLATE', 'SEND_EMAIL_TEMPLATE', 'CREATE_TICKET'] as const;

export class CreateAutomationDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() trigger!: string;
  @IsString() action!: string;
  @IsOptional() @IsInt() @Min(0) delayMinutes?: number;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsEnum(AutomationStatus) status?: AutomationStatus;
}

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly saas: SaasService) {}

  list(tenantId: string) {
    return this.prisma.automation.findMany({ where: { tenantId }, include: { executions: { orderBy: { createdAt: 'desc' }, take: 5 } }, orderBy: { createdAt: 'desc' } });
  }

  async create(tenantId: string, userId: string, dto: CreateAutomationDto) {
    await this.saas.assertFeature(tenantId, 'AUTOMATIONS');
    await this.saas.assertLimit(tenantId, 'automations');
    const subscription = await this.prisma.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (subscription && (await this.prisma.automation.count({ where: { tenantId } })) >= subscription.plan.maxAutomations) {
      throw new BadRequestException('Automation plan limit reached');
    }
    if (!TRIGGERS.includes(dto.trigger as typeof TRIGGERS[number])) throw new BadRequestException('Unsupported automation trigger');
    if (!ACTIONS.includes(dto.action as typeof ACTIONS[number])) throw new BadRequestException('Unsupported automation action');
    if (dto.templateId && !(await this.prisma.messageTemplate.findFirst({ where: { tenantId, id: dto.templateId, isActive: true }, select: { id: true } }))) {
      throw new NotFoundException('Active template not found');
    }
    const automation = await this.prisma.automation.create({ data: { tenantId, ...dto } });
    await this.audit.record(tenantId, userId, 'AUTOMATION_CREATED', 'Automation', automation.id);
    return automation;
  }

  async execute(tenantId: string, id: string, entityId?: string) {
    await this.saas.assertFeature(tenantId, 'AUTOMATIONS');
    const automation = await this.prisma.automation.findFirst({ where: { tenantId, id } });
    if (!automation) throw new NotFoundException('Automation not found');
    if (automation.status !== AutomationStatus.ACTIVE) throw new BadRequestException('Automation is disabled');
    const scheduledAt = new Date(Date.now() + automation.delayMinutes * 60_000);
    if (automation.delayMinutes > 0) {
      return this.prisma.automationExecution.create({ data: { tenantId, automationId: id, entityId, status: 'SCHEDULED', scheduledAt } });
    }
    return this.runExecution(tenantId, automation.id, entityId, 0);
  }

  async trigger(tenantId: string, trigger: string, entityId: string) {
    await this.saas.assertFeature(tenantId, 'AUTOMATIONS');
    const automations = await this.prisma.automation.findMany({ where: { tenantId, trigger, status: AutomationStatus.ACTIVE } });
    return Promise.all(automations.map((automation) => this.execute(tenantId, automation.id, entityId)));
  }

  async retry(tenantId: string, executionId: string) {
    const execution = await this.prisma.automationExecution.findFirst({ where: { tenantId, id: executionId }, include: { automation: true } });
    if (!execution) throw new NotFoundException('Automation execution not found');
    if (execution.status !== 'FAILED') throw new BadRequestException('Only failed executions can be retried');
    return this.runExecution(tenantId, execution.automationId, execution.entityId ?? undefined, execution.attempts);
  }

  private async runExecution(tenantId: string, automationId: string, entityId: string | undefined, attempts: number) {
    try {
      const execution = await this.prisma.automationExecution.create({ data: { tenantId, automationId, entityId, status: 'SUCCEEDED', attempts: attempts + 1, completedAt: new Date() } });
      return execution;
    } catch {
      return this.prisma.automationExecution.create({ data: { tenantId, automationId, entityId, status: 'FAILED', attempts: attempts + 1, errorMessage: 'Automation failed' } });
    }
  }
}
