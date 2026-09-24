import { ConfigService } from '@nestjs/config';
import { QueueFoundationService, queueJobDefaults } from './queue-foundation.service';

describe('QueueFoundationService', () => {
  it('creates all workload queues with retry defaults', async () => {
    const service = new QueueFoundationService({
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService);

    expect(service.connection).toEqual(expect.objectContaining({ host: 'localhost', port: 6379, maxRetriesPerRequest: null }));
    expect(service.defaultJobOptions).toEqual(queueJobDefaults);
    expect(service.integrationSync.name).toBe('integration-sync');
    expect(service.webhookProcessing.name).toBe('webhook-processing');
    expect(service.courierSync.name).toBe('courier-sync');

    await service.onModuleDestroy();
  });
});
