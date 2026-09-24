import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class ReportQueryDto {
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() storeId?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string, query: ReportQueryDto) {
    const createdAt = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
    const orderWhere: Prisma.OrderWhereInput = { tenantId, ...(query.storeId ? { storeId: query.storeId } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) };

    const [ordersByStatus, ordersByStore, ordersByCity, revenue, customers, tickets, shipments, ordersByDay, productRevenue, courierMetrics, deliveryMetrics, ticketMetrics, agentPerformance] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.order.groupBy({ by: ['storeId'], where: orderWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.$queryRaw<Array<{ city: string; count: bigint; revenue: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE("shippingAddress"->>'city', 'Unknown') AS city, COUNT(*)::bigint AS count, COALESCE(SUM("totalAmount"), 0)::decimal AS revenue
        FROM "Order" WHERE "tenantId" = ${tenantId}
        ${query.storeId ? Prisma.sql`AND "storeId" = ${query.storeId}` : Prisma.empty}
        ${query.dateFrom ? Prisma.sql`AND "createdAt" >= ${new Date(query.dateFrom)}` : Prisma.empty}
        ${query.dateTo ? Prisma.sql`AND "createdAt" <= ${new Date(query.dateTo)}` : Prisma.empty}
        GROUP BY 1 ORDER BY count DESC LIMIT 20
      `),
      this.prisma.order.aggregate({ where: orderWhere, _count: { _all: true }, _avg: { totalAmount: true }, _sum: { totalAmount: true } }),
      this.prisma.customer.count({ where: { tenantId, ...(query.dateFrom || query.dateTo ? { createdAt } : {}) } }),
      this.prisma.supportTicket.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.shipment.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint; revenue: Prisma.Decimal }>>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count, COALESCE(SUM("totalAmount"), 0)::decimal AS revenue
        FROM "Order" WHERE "tenantId" = ${tenantId}
        ${query.storeId ? Prisma.sql`AND "storeId" = ${query.storeId}` : Prisma.empty}
        ${query.dateFrom ? Prisma.sql`AND "createdAt" >= ${new Date(query.dateFrom)}` : Prisma.empty}
        ${query.dateTo ? Prisma.sql`AND "createdAt" <= ${new Date(query.dateTo)}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<Array<{ productId: string; productName: string; revenue: Prisma.Decimal; quantity: bigint }>>(Prisma.sql`
        SELECT oi."productId", COALESCE(p."name", 'Unknown') AS "productName",
          COALESCE(SUM(oi."totalAmount"), 0)::decimal AS revenue,
          COALESCE(SUM(oi."quantity"), 0)::bigint AS quantity
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId" AND o."tenantId" = oi."tenantId"
        LEFT JOIN "Product" p ON p."id" = oi."productId" AND p."tenantId" = oi."tenantId"
        WHERE oi."tenantId" = ${tenantId}
        ${query.storeId ? Prisma.sql`AND o."storeId" = ${query.storeId}` : Prisma.empty}
        ${query.dateFrom ? Prisma.sql`AND o."createdAt" >= ${new Date(query.dateFrom)}` : Prisma.empty}
        ${query.dateTo ? Prisma.sql`AND o."createdAt" <= ${new Date(query.dateTo)}` : Prisma.empty}
        GROUP BY oi."productId", p."name" ORDER BY revenue DESC LIMIT 100
      `),
      this.prisma.$queryRaw<Array<{ courier: string; total: bigint; delivered: bigint; returned: bigint }>>(Prisma.sql`
        SELECT c."name" AS courier, COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE s."status" = 'DELIVERED')::bigint AS delivered,
          COUNT(*) FILTER (WHERE s."status" = 'RETURNED')::bigint AS returned
        FROM "Shipment" s JOIN "CourierAccount" ca ON ca."id" = s."courierAccountId" AND ca."tenantId" = s."tenantId"
        JOIN "Courier" c ON c."id" = ca."courierId" AND c."tenantId" = s."tenantId"
        WHERE s."tenantId" = ${tenantId}
        GROUP BY c."name" ORDER BY total DESC
      `),
      this.prisma.$queryRaw<Array<{ averageHours: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (sh."createdAt" - s."createdAt")) / 3600)::float AS "averageHours"
        FROM "Shipment" s JOIN "ShipmentStatusHistory" sh ON sh."shipmentId" = s."id" AND sh."tenantId" = s."tenantId"
        WHERE s."tenantId" = ${tenantId} AND sh."status" = 'DELIVERED'
      `),
      this.prisma.$queryRaw<Array<{ averageHours: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 3600)::float AS "averageHours"
        FROM "SupportTicket" t WHERE t."tenantId" = ${tenantId} AND t."status" IN ('RESOLVED', 'CLOSED')
      `),
      this.prisma.$queryRaw<Array<{ userId: string | null; ticketCount: bigint; resolvedCount: bigint }>>(Prisma.sql`
        SELECT t."assigneeId" AS "userId", COUNT(*)::bigint AS "ticketCount",
          COUNT(*) FILTER (WHERE t."status" IN ('RESOLVED', 'CLOSED'))::bigint AS "resolvedCount"
        FROM "SupportTicket" t WHERE t."tenantId" = ${tenantId}
        GROUP BY t."assigneeId" ORDER BY "ticketCount" DESC
      `),
    ]);

    const highRisk = await this.prisma.customerScore.findMany({
      where: { tenantId, score: { lte: 40 } },
      include: { customer: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { score: 'asc' },
      take: 20,
    });

    return {
      ordersByStatus: ordersByStatus.map((row) => ({ status: row.status, count: row._count._all, revenue: row._sum.totalAmount ?? 0 })),
      ordersByStore: ordersByStore.map((row) => ({ storeId: row.storeId, count: row._count._all, revenue: row._sum.totalAmount ?? 0 })),
      ordersByCity: ordersByCity.map((row) => ({ city: row.city, count: Number(row.count), revenue: Number(row.revenue) })),
      revenue: revenue._sum.totalAmount ?? 0,
      averageOrderValue: revenue._avg.totalAmount ?? 0,
      orderCount: revenue._count._all,
      newCustomers: customers,
      highRiskCustomers: highRisk,
      ticketsByStatus: tickets,
      shipmentsByStatus: shipments,
      ordersByDay: ordersByDay.map((row) => ({ day: row.day, count: Number(row.count), revenue: Number(row.revenue) })),
      productRevenue: productRevenue.map((row) => ({ ...row, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
      returningCustomers: await this.returningCustomers(tenantId, query),
      courierSuccessRate: courierMetrics.map((row) => ({ courier: row.courier, total: Number(row.total), delivered: Number(row.delivered), returned: Number(row.returned), successRate: Number(row.total) ? Number(row.delivered) / Number(row.total) : 0, returnRate: Number(row.total) ? Number(row.returned) / Number(row.total) : 0 })),
      deliveryTimeHours: deliveryMetrics[0]?.averageHours ?? null,
      ticketResolutionTimeHours: ticketMetrics[0]?.averageHours ?? null,
      agentPerformance: agentPerformance.map((row) => ({ ...row, ticketCount: Number(row.ticketCount), resolvedCount: Number(row.resolvedCount) })),
    };
  }

  private async returningCustomers(tenantId: string, query: ReportQueryDto) {
    const createdAt = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
    const rows = await this.prisma.customer.findMany({
      where: { tenantId, ...(Object.keys(createdAt).length ? { createdAt } : {}) },
      select: { id: true, _count: { select: { orders: true } } },
    });
    return rows.filter((row) => row._count.orders > 1).length;
  }
}
