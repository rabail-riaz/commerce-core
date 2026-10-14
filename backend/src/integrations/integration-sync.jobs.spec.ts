import { Prisma } from '@prisma/client';
import { IntegrationsService } from './integrations.service';

describe('integration synchronization jobs', () => {
  const data = { tenantId: 'tenant-a', integrationId: 'integration-a', provider: 'WOOCOMMERCE', syncLogId: 'sync-a' };

  function setup(fetchCollection: jest.Mock) {
    const prisma = {
      integrationCredential: { findFirst: jest.fn().mockResolvedValue({ ciphertext: 'encrypted' }) },
      integration: { findFirst: jest.fn().mockResolvedValue({ storeId: null }), update: jest.fn() },
      integrationSyncLog: { update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new IntegrationsService(
      prisma as never,
      { decrypt: jest.fn().mockReturnValue('{}') } as never,
      { get: jest.fn().mockReturnValue({ fetchCollection }) } as never,
    );
    return { service, prisma };
  }

  it('completes a successful job', async () => {
    const { service, prisma } = setup(jest.fn().mockResolvedValue({ items: [], hasMore: false }));

    await expect(service.processInitialSyncJob(data, 0, 3)).resolves.toEqual(expect.objectContaining({ recordsSynced: 0 }));

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not mark a retryable failure as final', async () => {
    const { service, prisma } = setup(jest.fn().mockRejectedValue(new Error('temporary upstream failure')));

    await expect(service.processInitialSyncJob(data, 0, 3)).rejects.toThrow('temporary upstream failure');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a failed job on its final attempt', async () => {
    const { service, prisma } = setup(jest.fn().mockRejectedValue(new Error('permanent upstream failure')));

    await expect(service.processInitialSyncJob(data, 2, 3)).rejects.toThrow('permanent upstream failure');

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('is idempotent when a manual sync is requested while one is running', async () => {
    const queue = { integrationSync: { add: jest.fn() } };
    const prisma = {
      integration: { findFirst: jest.fn().mockResolvedValue({ id: 'integration-a', provider: 'WOOCOMMERCE' }) },
      integrationSyncLog: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-log', status: 'RUNNING', startedAt: new Date() }),
        create: jest.fn(),
      },
    };
    const service = new IntegrationsService(
      prisma as never,
      {} as never,
      {} as never,
      queue as never,
    );

    await expect(service.startInitialSync('tenant-a', 'integration-a')).resolves.toEqual(expect.objectContaining({
      started: false,
      syncLogId: 'existing-log',
      status: 'RUNNING',
    }));
    expect(prisma.integrationSyncLog.create).not.toHaveBeenCalled();
    expect(queue.integrationSync.add).not.toHaveBeenCalled();
  });

  it('counts numeric upstream IDs as missing during reconciliation', async () => {
    const prisma = {
      integrationCredential: { findFirst: jest.fn().mockResolvedValue({ ciphertext: 'encrypted' }) },
      integration: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ storeId: null })
          .mockResolvedValueOnce({ storeId: null }),
        update: jest.fn(),
      },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      integrationSyncLog: { update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new IntegrationsService(
      prisma as never,
      { decrypt: jest.fn().mockReturnValue('{}') } as never,
      {
        get: jest.fn().mockReturnValue({
          fetchCollection: jest.fn()
            .mockResolvedValueOnce({ items: [{ id: 17 }], hasMore: false })
            .mockResolvedValueOnce({ items: [{ id: 23 }], hasMore: false })
            .mockResolvedValueOnce({ items: [{ id: 31 }], hasMore: false }),
        }),
      } as never,
    );

    await expect(service.reconcileStoreJob(data, 0, 1)).resolves.toEqual(expect.objectContaining({
      recordsSynced: 3,
      recordsMissing: 3,
      recordsDiverged: 0,
    }));
    expect(prisma.integrationSyncLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ recordsMissing: 3 }),
    }));
  });

  it('runs initial sync inline when queues are unavailable', async () => {
    const prisma = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'integration-a', provider: 'WOOCOMMERCE', storeId: 'store-a' }),
        update: jest.fn(),
      },
      integrationSyncLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sync-a', status: 'RUNNING', startedAt: new Date() }),
        update: jest.fn(),
      },
      integrationCredential: { findFirst: jest.fn().mockResolvedValue({ ciphertext: 'encrypted' }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new IntegrationsService(
      prisma as never,
      { decrypt: jest.fn().mockReturnValue('{}') } as never,
      { get: jest.fn().mockReturnValue({ fetchCollection: jest.fn().mockResolvedValue({ items: [], hasMore: false }) }) } as never,
    );

    await expect(service.startInitialSync('tenant-a', 'integration-a')).resolves.toEqual(expect.objectContaining({
      started: true,
      queued: false,
      completed: true,
      recordsSynced: 0,
    }));
    expect(prisma.integrationSyncLog.create).toHaveBeenCalled();
  });

  it('imports WooCommerce orders with line items, guest customers, and addresses', async () => {
    const wooOrder = {
      id: 101,
      status: 'processing',
      total: '50.00',
      total_tax: '0',
      shipping_total: '0',
      discount_total: '0',
      currency: 'PKR',
      customer_id: 0,
      payment_method_title: 'Cash on delivery',
      date_created: '2026-01-15T10:00:00',
      billing: { first_name: 'Ali', last_name: 'Khan', email: 'ali@example.com', phone: '0300', address_1: 'Street 1', city: 'Lahore', country: 'PK' },
      shipping: { first_name: 'Ali', last_name: 'Khan', address_1: 'Street 1', city: 'Lahore', country: 'PK' },
      line_items: [{ id: 1, name: 'Shirt', quantity: 2, price: '25', total: '50', sku: 'SHIRT', product_id: 9, variation_id: 0 }],
    };
    const prisma = {
      integrationCredential: { findFirst: jest.fn().mockResolvedValue({ ciphertext: 'encrypted' }) },
      integration: { findFirst: jest.fn().mockResolvedValue({ storeId: 'store-a' }), update: jest.fn() },
      integrationSyncLog: { update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
      customer: {
        upsert: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'customer-a' }),
      },
      product: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      productVariant: { findUnique: jest.fn().mockResolvedValue(null) },
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'order-a' }),
      },
      orderItem: { deleteMany: jest.fn(), create: jest.fn() },
      orderStatusHistory: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    };
    const service = new IntegrationsService(
      prisma as never,
      { decrypt: jest.fn().mockReturnValue('{}') } as never,
      {
        get: jest.fn().mockReturnValue({
          fetchCollection: jest.fn()
            .mockResolvedValueOnce({ items: [], hasMore: false })
            .mockResolvedValueOnce({ items: [], hasMore: false })
            .mockResolvedValueOnce({ items: [wooOrder], hasMore: false }),
        }),
      } as never,
    );

    await expect(service.processInitialSyncJob(data, 0, 1)).resolves.toEqual(expect.objectContaining({
      recordsSynced: 1,
      recordsCreated: 1,
    }));
    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'ali@example.com', firstName: 'Ali', lastName: 'Khan' }),
    }));
    expect(prisma.order.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_sourceProvider_externalOrderId: { tenantId: 'tenant-a', sourceProvider: 'WOOCOMMERCE', externalOrderId: '101' } },
      create: expect.objectContaining({
        customerId: 'customer-a',
        currency: 'PKR',
        totalAmount: 50,
        shippingAddress: expect.objectContaining({ city: 'Lahore', addressLine1: 'Street 1' }),
      }),
    }));
    expect(prisma.orderItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Shirt', quantity: 2, sku: 'SHIRT', orderId: 'order-a' }),
    }));
  });

  it('imports WooCommerce variants that share a SKU', async () => {
    const prisma = {
      integrationCredential: { findFirst: jest.fn().mockResolvedValue({ ciphertext: 'encrypted' }) },
      integration: { findFirst: jest.fn().mockResolvedValue({ storeId: 'store-a' }), update: jest.fn() },
      integrationSyncLog: { update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
      customer: { upsert: jest.fn() },
      product: { upsert: jest.fn().mockResolvedValue({ id: 'product-a' }) },
      productVariant: {
        upsert: jest.fn()
          .mockRejectedValueOnce(Object.assign(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.2.1' }), { code: 'P2002' }))
          .mockResolvedValue({ id: 'variant-a' }),
      },
      order: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    };
    const service = new IntegrationsService(
      prisma as never,
      { decrypt: jest.fn().mockReturnValue('{}') } as never,
      {
        get: jest.fn().mockReturnValue({
          fetchCollection: jest.fn()
            .mockResolvedValueOnce({ items: [], hasMore: false })
            .mockResolvedValueOnce({
              items: [{
                id: 9,
                name: 'Shirt',
                variations: [
                  { id: 21, sku: 'SHIRT', name: 'Small', price: '25' },
                  { id: 22, sku: 'SHIRT', name: 'Large', price: '30' },
                ],
              }],
              hasMore: false,
            })
            .mockResolvedValueOnce({ items: [], hasMore: false }),
        }),
      } as never,
    );

    await expect(service.processInitialSyncJob(data, 0, 1)).resolves.toEqual(expect.objectContaining({ recordsSynced: 3 }));
    expect(prisma.productVariant.upsert).toHaveBeenCalled();
    expect(prisma.productVariant.upsert.mock.calls.some((call) => call[0].create?.sku === 'SHIRT-21' || call[0].create?.sku === 'SHIRT-22')).toBe(true);
  });
});
