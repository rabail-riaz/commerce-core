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
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const service = new CustomersService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
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
      tickets: [],
      emailThreads: [],
      whatsappConversations: [],
    });
    prisma.order.findMany.mockResolvedValue([{ id: 'order-a', totalAmount: 25, currency: 'USD', returns: [], shipments: [] }]);

    const result = await service.getById('tenant-a', 'customer-a');

    expect(prisma.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', id: 'customer-a' },
    }));
    // No phone on file, so order history falls back to the customerId relationship, still tenant-scoped.
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', customerId: 'customer-a' },
    }));
    expect(result.orders).toHaveLength(1);
    expect(result.spending.orderCount).toBe(1);
    expect(result.spending.total).toBe(25);
  });

  it('matches order history by phone number when the customer has one on file', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      id: 'customer-a',
      email: 'alex@example.com',
      firstName: 'Alex',
      lastName: 'Stone',
      phone: '0332-8205191',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      addresses: [],
      tags: [],
      score: null,
      tickets: [],
      emailThreads: [],
      whatsappConversations: [],
    });
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'order-a' }, { id: 'order-b' }]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'order-a', totalAmount: 25, currency: 'USD', returns: [], shipments: [] },
      { id: 'order-b', totalAmount: 10, currency: 'USD', returns: [], shipments: [] },
    ]);

    const result = await service.getById('tenant-a', 'customer-a');

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', id: { in: ['order-a', 'order-b'] } },
    }));
    expect(result.spending.orderCount).toBe(2);
    expect(result.spending.total).toBe(35);
  });

  it('does not reveal a customer from another tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.getById('tenant-a', 'customer-from-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
