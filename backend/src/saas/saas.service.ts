import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

const PLATFORM_FLAGS = ['AI_ASSISTANT', 'SHOPIFY_INTEGRATION', 'CAMPAIGNS', 'AUTOMATIONS', 'ADVANCED_REPORTS'] as const;

@Injectable()
export class SaasService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async ensureTrial(tenantId: string) {
    const existing = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    if (existing) return existing;
    const plan = await this.prisma.plan.upsert({
      where: { name: 'Trial' },
      update: {},
      create: { id: 'plan_trial', name: 'Trial' },
    });
    return this.prisma.tenantSubscription.create({
      data: { tenantId, planId: plan.id, status: 'TRIAL', trialEndsAt: new Date(Date.now() + 15 * 86400000) },
    });
  }

  async current(tenantId: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!subscription) return this.ensureTrial(tenantId).then((item) => this.prisma.tenantSubscription.findUniqueOrThrow({ where: { id: item.id }, include: { plan: true } }));
    const expired = subscription.status === 'TRIAL' && subscription.trialEndsAt <= new Date();
    if (expired && subscription.status !== 'EXPIRED') {
      return this.prisma.tenantSubscription.update({ where: { id: subscription.id }, data: { status: 'EXPIRED' }, include: { plan: true } });
    }
    return subscription;
  }

  async flags(tenantId: string) {
    const subscription = await this.current(tenantId);
    const rows = await this.prisma.featureFlag.findMany({ where: { OR: [{ tenantId }, { tenantId: null, planId: subscription.planId }, { tenantId: null, planId: null }] }, orderBy: [{ tenantId: 'desc' }, { planId: 'desc' }] });
    const resolved = Object.fromEntries(PLATFORM_FLAGS.map((key) => [key, key !== 'AI_ASSISTANT'])) as Record<string, boolean>;
    const seen = new Set<string>();
    for (const row of rows) if (row.key !== 'AI_ASSISTANT' && !seen.has(row.key)) {
      resolved[row.key] = row.enabled;
      seen.add(row.key);
    }
    resolved.AI_ASSISTANT = false;
    return resolved;
  }

  async assertFeature(tenantId: string, key: typeof PLATFORM_FLAGS[number]) {
    const flags = await this.flags(tenantId);
    if (!flags[key]) throw new ForbiddenException(`${key} feature is not enabled`);
  }

  async assertLimit(tenantId: string, metric: 'stores' | 'users' | 'orders' | 'customers' | 'whatsappMessages' | 'emailVolume' | 'couriers' | 'automations' | 'reports') {
    const subscription = await this.current(tenantId);
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const counts = {
      stores: await this.prisma.store.count({ where: { tenantId } }),
      users: await this.prisma.membership.count({ where: { tenantId } }),
      orders: await this.prisma.order.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      customers: await this.prisma.customer.count({ where: { tenantId } }),
      whatsappMessages: await this.prisma.whatsAppMessage.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      emailVolume: await this.prisma.emailMessage.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      automations: await this.prisma.automation.count({ where: { tenantId } }),
      couriers: await this.prisma.courier.count({ where: { tenantId } }),
      reports: await this.prisma.featureFlag.count({ where: { tenantId, key: 'REPORT_USAGE' } }),
    };
    const limits = {
      stores: subscription.plan.maxStores, users: subscription.plan.maxUsers, orders: subscription.plan.maxOrdersPerMonth,
      customers: subscription.plan.maxCustomers, whatsappMessages: subscription.plan.maxWhatsAppMessages,
      emailVolume: subscription.plan.maxEmailVolume, couriers: subscription.plan.maxCouriers,
      automations: subscription.plan.maxAutomations, reports: subscription.plan.maxReports,
    };
    if (counts[metric] >= limits[metric]) throw new ForbiddenException(`${metric} plan limit reached`);
  }

  async usage(tenantId: string) {
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    return {
      stores: await this.prisma.store.count({ where: { tenantId } }),
      users: await this.prisma.membership.count({ where: { tenantId } }),
      orders: await this.prisma.order.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      customers: await this.prisma.customer.count({ where: { tenantId } }),
      whatsappMessages: await this.prisma.whatsAppMessage.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      emailVolume: await this.prisma.emailMessage.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      automations: await this.prisma.automation.count({ where: { tenantId } }),
      couriers: await this.prisma.courier.count({ where: { tenantId } }),
    };
  }

  async platformOverview(isPlatformAdmin: boolean) {
    if (!isPlatformAdmin) throw new ForbiddenException('Platform admin access required');
    const [tenants, subscriptions, flags] = await Promise.all([
      this.prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.tenantSubscription.findMany({ include: { plan: true, tenant: { select: { name: true, slug: true } } } }),
      this.prisma.featureFlag.findMany(),
    ]);
    const plans = await this.prisma.plan.findMany({ orderBy: { createdAt: 'asc' } });
    return { tenants, subscriptions, plans, flags };
  }

  async updatePlatformFlag(isPlatformAdmin: boolean, auditTenantId: string, actorUserId: string, key: string, enabled: boolean, tenantId?: string, planId?: string) {
    if (!isPlatformAdmin) throw new ForbiddenException('Platform admin access required');
    if (!PLATFORM_FLAGS.includes(key as typeof PLATFORM_FLAGS[number])) throw new BadRequestException('Unsupported feature flag');
    if (key === 'AI_ASSISTANT' && enabled) throw new BadRequestException('AI assistant is disabled');
    const existing = await this.prisma.featureFlag.findFirst({ where: { key, tenantId: tenantId ?? null, planId: planId ?? null } });
    const data = { enabled: key === 'AI_ASSISTANT' ? false : enabled };
    const result = existing
      ? this.prisma.featureFlag.update({ where: { id: existing.id }, data })
      : this.prisma.featureFlag.create({ data: { key, tenantId, planId, ...data } });
    const flag = await result;
    await this.audit.record(auditTenantId, actorUserId, 'PLATFORM_FEATURE_FLAG_UPDATED', 'FeatureFlag', flag.id, undefined, { key, enabled: data.enabled, tenantId, planId });
    return flag;
  }

  async platformHealth(isPlatformAdmin: boolean) {
    if (!isPlatformAdmin) throw new ForbiddenException('Platform admin access required');
    await this.prisma.$queryRaw`SELECT 1`;
    return { database: 'ok', checkedAt: new Date().toISOString() };
  }
}
