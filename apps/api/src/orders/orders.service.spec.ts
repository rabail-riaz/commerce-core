import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService shipment booking', () => {
  const prisma = {
    order: { findFirst: jest.fn() },
    shipment: { findFirst: jest.fn() },
    courierAccount: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const couriers = { bookShipment: jest.fn() };
  const service = new OrdersService(prisma as never, couriers as never);

  beforeEach(() => jest.clearAllMocks());

  it('books and atomically persists shipment and order timeline', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      totalAmount: 125,
      shippingAddress: { firstName: 'Alex', addressLine1: '1 Main St', city: 'Lahore', country: 'PK' },
      customer: { firstName: null, lastName: null, email: 'alex@example.com', phone: '03000000000' },
      items: [{ id: 'item-1' }],
    });
    prisma.shipment.findFirst.mockResolvedValue(null);
    prisma.courierAccount.findFirst.mockResolvedValue({
      id: 'account-1',
      credentials: { token: 'secret' },
      courier: { code: 'POSTEX', name: 'PostEx' },
    });
    couriers.bookShipment.mockResolvedValue({ shipmentReference: 'EXT-1', trackingNumber: 'TRK-1', status: 'LABEL_CREATED' });
    const tx = {
      order: { update: jest.fn() },
      shipment: {
        create: jest.fn().mockResolvedValue({ id: 'shipment-1', trackingNumber: 'TRK-1', status: 'LABEL_CREATED', statusHistory: [], courierAccount: {} }),
      },
      shipmentStatusHistory: { create: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.bookShipment('tenant-1', 'order-1', { courierAccountId: 'account-1' });

    expect(couriers.bookShipment).toHaveBeenCalledWith('POSTEX', { token: 'secret' }, expect.objectContaining({
      orderId: 'order-1',
      recipient: expect.objectContaining({ name: 'Alex', city: 'Lahore' }),
    }));
    expect(tx.shipment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', externalShipmentId: 'EXT-1', trackingNumber: 'TRK-1' }),
    }));
    expect(tx.shipmentStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', shipmentId: 'shipment-1' }),
    }));
    expect(tx.orderStatusHistory.create).toHaveBeenCalled();
    expect(result.trackingNumber).toBe('TRK-1');
  });

  it('rejects missing shipping address before calling the adapter', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      shippingAddress: { city: 'Lahore' },
      customer: null,
      items: [],
    });
    prisma.shipment.findFirst.mockResolvedValue(null);
    prisma.courierAccount.findFirst.mockResolvedValue({ id: 'account-1', credentials: {}, courier: { code: 'POSTEX' } });

    await expect(service.bookShipment('tenant-1', 'order-1', { courierAccountId: 'account-1' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(couriers.bookShipment).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not persist when the courier booking fails', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      shippingAddress: { firstName: 'Alex', addressLine1: '1 Main St', city: 'Lahore', country: 'PK' },
      customer: null,
      items: [],
    });
    prisma.shipment.findFirst.mockResolvedValue(null);
    prisma.courierAccount.findFirst.mockResolvedValue({ id: 'account-1', credentials: {}, courier: { code: 'POSTEX' } });
    couriers.bookShipment.mockRejectedValue(new Error('provider unavailable'));

    await expect(service.bookShipment('tenant-1', 'order-1', { courierAccountId: 'account-1' })).rejects.toThrow('provider unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
