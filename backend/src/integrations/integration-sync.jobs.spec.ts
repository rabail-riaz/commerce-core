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

    await expect(service.processInitialSyncJob(data, 0, 3)).resolves.toBeUndefined();

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
});
