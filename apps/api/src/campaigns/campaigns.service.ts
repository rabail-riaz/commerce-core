import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateCampaignDto, CreateTemplateDto, RenderTemplateDto, UpdateCampaignDto, UpdateTemplateDto } from './dto';

export function renderTemplate(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => variables[key] ?? '');
}

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  listTemplates(tenantId: string) {
    return this.prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  createTemplate(tenantId: string, dto: CreateTemplateDto) {
    const variables = dto.variables ?? [...dto.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]);
    if (dto.channel === 'WHATSAPP' && !dto.provider) throw new BadRequestException('WhatsApp templates require a provider');
    return this.prisma.messageTemplate.create({ data: { tenantId, ...dto, variables: [...new Set(variables)] } });
  }

  async updateTemplate(tenantId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.messageTemplate.findFirst({ where: { tenantId, id } });
    if (!template) throw new NotFoundException('Template not found');
    const body = dto.body ?? template.body;
    const detected = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]);
    if (dto.variables && detected.some((variable) => !dto.variables?.includes(variable))) throw new BadRequestException('Template variables do not cover all placeholders');
    return this.prisma.messageTemplate.update({ where: { tenantId_id: { tenantId, id } }, data: { ...dto, variables: dto.variables ?? [...new Set(detected)] } });
  }

  async renderTemplate(tenantId: string, id: string, dto: RenderTemplateDto) {
    const template = await this.prisma.messageTemplate.findFirst({ where: { tenantId, id } });
    if (!template) throw new NotFoundException('Template not found');
    const missing = template.variables.filter((variable) => dto.variables?.[variable] === undefined);
    if (missing.length) throw new BadRequestException(`Missing template variables: ${missing.join(', ')}`);
    return { subject: template.subject ? renderTemplate(template.subject, dto.variables) : undefined, body: renderTemplate(template.body, dto.variables) };
  }

  async deactivateTemplate(tenantId: string, id: string) {
    await this.updateTemplate(tenantId, id, { isActive: false });
    return { id, isActive: false };
  }

  listCampaigns(tenantId: string) {
    return this.prisma.campaign.findMany({ where: { tenantId }, include: { template: true, executions: { orderBy: { createdAt: 'desc' }, take: 3 } }, orderBy: { createdAt: 'desc' } });
  }

  async createCampaign(tenantId: string, userId: string, dto: CreateCampaignDto) {
    if (dto.templateId && !(await this.prisma.messageTemplate.findFirst({ where: { tenantId, id: dto.templateId } }))) {
      throw new NotFoundException('Template not found');
    }
    const campaign = await this.prisma.campaign.create({
      data: { tenantId, name: dto.name, channel: dto.channel, templateId: dto.templateId, audience: dto.audience as Prisma.InputJsonValue | undefined, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined, status: dto.scheduledAt ? 'SCHEDULED' : 'DRAFT' },
    });
    await this.audit.record(tenantId, userId, 'CAMPAIGN_CREATED', 'Campaign', campaign.id);
    return campaign;
  }

  async updateCampaign(tenantId: string, id: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.campaign.findFirst({ where: { tenantId, id }, select: { id: true, status: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (dto.status && !this.validCampaignTransition(campaign.status, dto.status)) throw new BadRequestException(`Invalid campaign transition from ${campaign.status} to ${dto.status}`);
    return this.prisma.campaign.update({
      where: { tenantId_id: { tenantId, id } },
      data: { ...(dto.status ? { status: dto.status } : {}), ...(dto.scheduledAt ? { scheduledAt: new Date(dto.scheduledAt) } : {}) },
    });
  }

  private validCampaignTransition(current: CampaignStatus, next: CampaignStatus) {
    const transitions: Record<CampaignStatus, CampaignStatus[]> = {
      DRAFT: [CampaignStatus.SCHEDULED, CampaignStatus.RUNNING, CampaignStatus.CANCELLED],
      SCHEDULED: [CampaignStatus.RUNNING, CampaignStatus.CANCELLED, CampaignStatus.FAILED],
      RUNNING: [CampaignStatus.COMPLETED, CampaignStatus.FAILED, CampaignStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
      FAILED: [CampaignStatus.SCHEDULED],
    };
    return transitions[current].includes(next);
  }

  async execute(tenantId: string, userId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { tenantId, id }, include: { template: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.template) throw new BadRequestException('Campaign has no template');
    const audienceFilter = (campaign.audience ?? {}) as { tag?: string };
    const customers = await this.prisma.customer.findMany({
      where: { tenantId, ...(audienceFilter.tag ? { tags: { some: { tenantId, name: audienceFilter.tag } } } : {}) },
      select: { id: true, firstName: true, email: true },
    });
    await this.prisma.campaign.update({ where: { tenantId_id: { tenantId, id } }, data: { status: CampaignStatus.RUNNING, startedAt: new Date() } });
    const sentCount = customers.length;
    await this.prisma.campaignExecution.create({ data: { tenantId, campaignId: id, status: CampaignStatus.COMPLETED, sentCount } });
    const result = { sentCount, preview: customers.slice(0, 5).map((customer) => ({ customerId: customer.id, body: renderTemplate(campaign.template!.body, { firstName: customer.firstName ?? 'there' }) })) };
    await this.prisma.campaign.update({ where: { tenantId_id: { tenantId, id } }, data: { status: CampaignStatus.COMPLETED, completedAt: new Date(), result } });
    await this.audit.record(tenantId, userId, 'CAMPAIGN_EXECUTED', 'Campaign', id, undefined, { sentCount });
    return { ...campaign, status: CampaignStatus.COMPLETED, result };
  }

  private async assertCampaign(tenantId: string, id: string) {
    if (!(await this.prisma.campaign.findFirst({ where: { tenantId, id }, select: { id: true } }))) throw new NotFoundException('Campaign not found');
  }
}
