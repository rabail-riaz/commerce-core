import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const prisma = {
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    order: {
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new CustomersService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes customer searches and counts to the active tenant', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));

    await service.list('tenant-a', { page: 1, limit: 25, search: 'alex' });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        OR: expect.arrayContaining([
          expect.objectContaining({ orders: { some: expect.objectContaining({ tenantId: 'tenant-a' }) } }),
        ]),
      }),
    }));
    expect(prisma.customer.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }));
  });

  it('loads order history and spending only for the active tenant relationship', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      id: 'customer-a',
      email: 'alex@example.com',
      firstName: 'Alex',
      lastName: 'Stone',
      phone: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      addresses: [],
      tags: [],
      score: null,
      orders: [{ id: 'order-a', totalAmount: 25, currency: 'USD' }],
    });
    prisma.order.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { totalAmount: 25 } });

    const result = await service.getById('tenant-a', 'customer-a');

    expect(prisma.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', id: 'customer-a' },
      include: expect.objectContaining({
        orders: expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
      }),
    }));
    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', customerId: 'customer-a' },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    expect(result.orders).toHaveLength(1);
    expect(result.spending.orderCount).toBe(1);
  });

  it('does not reveal a customer from another tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.getById('tenant-a', 'customer-from-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.aggregate).not.toHaveBeenCalled();
  });
});
