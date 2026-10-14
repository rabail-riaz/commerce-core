import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';

describe('ReconciliationSchedulerService', () => {
  afterEach(() => jest.useRealTimers());

  it('runs active integration reconciliation on the configured interval', async () => {
    jest.useFakeTimers();
    const reconcileActiveIntegrations = jest.fn().mockResolvedValue([]);
    const service = new ReconciliationSchedulerService(
      { get: jest.fn().mockReturnValue(1000) } as never,
      { reconcileActiveIntegrations } as never,
    );

    service.onModuleInit();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(reconcileActiveIntegrations).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
