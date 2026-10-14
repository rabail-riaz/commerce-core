import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('maps tenant-scoped PostgreSQL aggregates to dashboard metrics', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{
        today_orders: BigInt(3),
        today_revenue: new Prisma.Decimal('149.50'),
        weekly_orders: BigInt(8),
        weekly_revenue: new Prisma.Decimal('399.50'),
        monthly_orders: BigInt(21),
        monthly_revenue: new Prisma.Decimal('999.50'),
        overall_orders: BigInt(34),
        overall_revenue: new Prisma.Decimal('1499.50'),
        pending_orders: BigInt(2),
        out_for_delivery: BigInt(1),
        delivered: BigInt(10),
        returned: BigInt(2),
        new_customers: BigInt(2),
        returning_customers: BigInt(1),
      }]),
    };
    const service = new DashboardService(prisma as never);

    await expect(service.summary('tenant-a')).resolves.toEqual({
      todayOrders: 3,
      todayRevenue: 149.5,
      weeklyOrders: 8,
      weeklyRevenue: 399.5,
      monthlyOrders: 21,
      monthlyRevenue: 999.5,
      overallOrders: 34,
      overallRevenue: 1499.5,
      pendingOrders: 2,
      outForDelivery: 1,
      delivered: 10,
      returned: 2,
      newCustomers: 2,
      returningCustomers: 1,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [query] = prisma.$queryRaw.mock.calls[0];
    expect(query.values).toContain('tenant-a');
    expect(query.strings.join('')).toContain('FROM "Order"');
    expect(query.strings.join('')).toContain('WHERE "tenantId" =');
  });

  it('returns zero metrics when PostgreSQL returns no aggregate row', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new DashboardService(prisma as never);

    await expect(service.summary('tenant-empty')).resolves.toEqual({
      todayOrders: 0,
      todayRevenue: 0,
      weeklyOrders: 0,
      weeklyRevenue: 0,
      monthlyOrders: 0,
      monthlyRevenue: 0,
      overallOrders: 0,
      overallRevenue: 0,
      pendingOrders: 0,
      outForDelivery: 0,
      delivered: 0,
      returned: 0,
      newCustomers: 0,
      returningCustomers: 0,
    });
  });
});
