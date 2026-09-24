import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns an ok liveness response', () => {
    const controller = new HealthController({} as never);

    expect(controller.health()).toEqual(expect.objectContaining({ status: 'ok' }));
  });

  it('reports database availability', async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never);

    await expect(controller.database()).resolves.toEqual({ status: 'ok' });
  });

  it('reports an unavailable database', async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockRejectedValue(new Error('offline')) } as never);

    await expect(controller.database()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
