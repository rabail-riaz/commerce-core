import { BadRequestException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { ShippingService } from './shipping.service';

describe('ShippingService order shipment return flow', () => {
  const prisma = {
    shipment: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
    return: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    order: { findFirst: jest.fn(), create: jest.fn() },
    courierAccount: { findMany: jest.fn() },
    shipmentStatusHistory: { create: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    returnStatusHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const couriers = { trackShipment: jest.fn(), canListShipments: jest.fn(), listRemoteShipments: jest.fn() };
  const service = new ShippingService(prisma as never, couriers as never);

  beforeEach(() => jest.clearAllMocks());

  it('tracks a shipment and records provider-independent timeline events', async () => {
    prisma.shipment.findFirst.mockResolvedValue({
      id: 'shipment-1',
      trackingNumber: 'TRK-1',
      status: 'LABEL_CREATED',
      statusHistory: [],
      courierAccount: { credentials: { token: 'secret' }, courier: { code: 'POSTEX' } },
    });
    couriers.trackShipment.mockResolvedValue({
      trackingNumber: 'TRK-1',
      status: 'IN_TRANSIT',
      events: [{ status: 'PICKED_UP', note: 'Collected', occurredAt: new Date() }],
    });
    const tx = {
      shipment: { update: jest.fn().mockResolvedValue({ id: 'shipment-1', status: 'IN_TRANSIT' }) },
      shipmentStatusHistory: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.trackShipment('tenant-1', 'shipment-1');

    expect(couriers.trackShipment).toHaveBeenCalledWith('POSTEX', { token: 'secret' }, 'TRK-1');
    expect(tx.shipment.update).toHaveBeenCalled();
    expect(tx.shipmentStatusHistory.create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('IN_TRANSIT');
  });

  it('filters and paginates shipments by courier', async () => {
    prisma.shipment.findMany.mockResolvedValue([]);
    prisma.shipment.count.mockResolvedValue(0);
    prisma.courierAccount.findMany.mockResolvedValue([]);
    prisma.shipment.groupBy.mockResolvedValue([]);
    couriers.canListShipments.mockReturnValue(false);

    const result = await service.listShipments('tenant-1', { page: 1, limit: 25, courier: 'postex' });

    expect(prisma.shipment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        courierAccount: { is: { courier: { is: { code: 'POSTEX' } } } },
      }),
      skip: 0,
      take: 25,
    }));
    expect(result).toEqual(expect.objectContaining({ items: [], total: 0, page: 1 }));
  });

  it('creates a requested return and advances only through valid workflow transitions', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
    prisma.shipment.findFirst.mockResolvedValue({ id: 'shipment-1' });
    prisma.return.create.mockResolvedValue({ id: 'return-1', status: ReturnStatus.RETURN_REQUESTED });
    const created = await service.createReturn('tenant-1', { orderId: 'order-1', shipmentId: 'shipment-1', reason: 'Damaged' });

    expect(prisma.return.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', orderId: 'order-1', shipmentId: 'shipment-1', statusHistory: expect.any(Object) }),
    }));
    expect(created.status).toBe(ReturnStatus.RETURN_REQUESTED);

    prisma.return.findFirst.mockResolvedValue({ status: ReturnStatus.RETURN_REQUESTED });
    await expect(service.updateReturnStatus('tenant-1', 'return-1', { status: ReturnStatus.RECEIVED }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('completes a valid return transition atomically', async () => {
    prisma.return.findFirst.mockResolvedValue({ status: ReturnStatus.INSPECTION });
    const tx = {
      returnStatusHistory: { create: jest.fn() },
      return: { update: jest.fn().mockResolvedValue({ id: 'return-1', status: ReturnStatus.REFUND }) },
    };
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.updateReturnStatus('tenant-1', 'return-1', { status: ReturnStatus.REFUND, resolution: 'Refund issued' });

    expect(tx.returnStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', returnId: 'return-1', status: ReturnStatus.REFUND }),
    }));
    expect(result.status).toBe(ReturnStatus.REFUND);
  });
});
