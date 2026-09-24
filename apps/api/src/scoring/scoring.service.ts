import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeCustomerScore } from './scoring';

@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    const since = new Date(Date.now() - 90 * 86400000);
    const orders = await this.prisma.order.findMany({
      where: { tenantId, customerId },
      select: { status: true, createdAt: true },
    });
    const stats = {
      delivered: orders.filter((order) => order.status === 'DELIVERED').length,
      returned: orders.filter((order) => order.status === 'RETURNED' || order.status === 'RETURN_REQUESTED').length,
      cancelled: orders.filter((order) => order.status === 'CANCELLED').length,
      refused: orders.filter((order) => order.status === 'FAILED').length,
      totalOrders: orders.length,
      ordersLast90Days: orders.filter((order) => order.createdAt >= since).length,
    };
    const result = computeCustomerScore(stats);
    return this.prisma.customerScore.upsert({
      where: { tenantId_customerId: { tenantId, customerId } },
      update: { score: result.score, breakdown: result.breakdown as Prisma.InputJsonValue },
      create: { tenantId, customerId, score: result.score, breakdown: result.breakdown as Prisma.InputJsonValue },
    });
  }

  async override(tenantId: string, customerId: string, manualClassification: string) {
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customerScore.upsert({
      where: { tenantId_customerId: { tenantId, customerId } },
      update: { manualClassification },
      create: { tenantId, customerId, score: 0, manualClassification },
    });
  }
}
