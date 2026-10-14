import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardSummary {
  todayOrders: number;
  todayRevenue: number;
  weeklyOrders: number;
  weeklyRevenue: number;
  monthlyOrders: number;
  monthlyRevenue: number;
  overallOrders: number;
  overallRevenue: number;
  pendingOrders: number;
  outForDelivery: number;
  delivered: number;
  returned: number;
  newCustomers: number;
  returningCustomers: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<Array<{
      today_orders: bigint;
      today_revenue: Prisma.Decimal;
      weekly_orders: bigint;
      weekly_revenue: Prisma.Decimal;
      monthly_orders: bigint;
      monthly_revenue: Prisma.Decimal;
      overall_orders: bigint;
      overall_revenue: Prisma.Decimal;
      pending_orders: bigint;
      out_for_delivery: bigint;
      delivered: bigint;
      returned: bigint;
      new_customers: bigint;
      returning_customers: bigint;
    }>>(Prisma.sql`
      WITH bounds AS (
        SELECT
          date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS today_start,
          date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS week_start,
          date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS month_start
      ),
      tenant_orders AS (
        SELECT "id", "customerId", "status", "totalAmount", "createdAt"
        FROM "Order"
        WHERE "tenantId" = ${tenantId} AND "isCourierGenerated" = false
      ),
      today_customers AS (
        SELECT DISTINCT "customerId"
        FROM tenant_orders, bounds
        WHERE "customerId" IS NOT NULL AND "createdAt" >= bounds.today_start
      ),
      customer_types AS (
        SELECT
          tc."customerId",
          EXISTS (
            SELECT 1 FROM tenant_orders previous
            WHERE previous."customerId" = tc."customerId"
              AND previous."createdAt" < (SELECT today_start FROM bounds)
          ) AS is_returning
        FROM today_customers tc
      )
      SELECT
        COUNT(*) FILTER (WHERE o."createdAt" >= b.today_start)::bigint AS today_orders,
        COALESCE(SUM(o."totalAmount") FILTER (WHERE o."createdAt" >= b.today_start), 0)::decimal AS today_revenue,
        COUNT(*) FILTER (WHERE o."createdAt" >= b.week_start)::bigint AS weekly_orders,
        COALESCE(SUM(o."totalAmount") FILTER (WHERE o."createdAt" >= b.week_start), 0)::decimal AS weekly_revenue,
        COUNT(*) FILTER (WHERE o."createdAt" >= b.month_start)::bigint AS monthly_orders,
        COALESCE(SUM(o."totalAmount") FILTER (WHERE o."createdAt" >= b.month_start), 0)::decimal AS monthly_revenue,
        COUNT(*)::bigint AS overall_orders,
        COALESCE(SUM(o."totalAmount"), 0)::decimal AS overall_revenue,
        COUNT(*) FILTER (WHERE o."status" = 'PENDING')::bigint AS pending_orders,
        COUNT(*) FILTER (WHERE o."status" = 'OUT_FOR_DELIVERY')::bigint AS out_for_delivery,
        COUNT(*) FILTER (WHERE o."status" = 'DELIVERED')::bigint AS delivered,
        COUNT(*) FILTER (WHERE o."status" = 'RETURNED')::bigint AS returned,
        (SELECT COUNT(*) FROM customer_types WHERE is_returning = false)::bigint AS new_customers,
        (SELECT COUNT(*) FROM customer_types WHERE is_returning = true)::bigint AS returning_customers
      FROM tenant_orders o
      CROSS JOIN bounds b
    `);

    return {
      todayOrders: Number(row?.today_orders ?? 0),
      todayRevenue: Number(row?.today_revenue ?? 0),
      weeklyOrders: Number(row?.weekly_orders ?? 0),
      weeklyRevenue: Number(row?.weekly_revenue ?? 0),
      monthlyOrders: Number(row?.monthly_orders ?? 0),
      monthlyRevenue: Number(row?.monthly_revenue ?? 0),
      overallOrders: Number(row?.overall_orders ?? 0),
      overallRevenue: Number(row?.overall_revenue ?? 0),
      pendingOrders: Number(row?.pending_orders ?? 0),
      outForDelivery: Number(row?.out_for_delivery ?? 0),
      delivered: Number(row?.delivered ?? 0),
      returned: Number(row?.returned ?? 0),
      newCustomers: Number(row?.new_customers ?? 0),
      returningCustomers: Number(row?.returning_customers ?? 0),
    } satisfies DashboardSummary;
  }
}
