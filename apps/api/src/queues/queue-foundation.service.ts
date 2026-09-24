import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, RedisOptions } from 'bullmq';
import { COURIER_SYNC_QUEUE, INTEGRATION_SYNC_QUEUE, WEBHOOK_PROCESSING_QUEUE } from './queue.constants';

export const queueJobDefaults = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800, count: 5_000 },
};

@Injectable()
export class QueueFoundationService implements OnModuleDestroy {
  readonly connection: RedisOptions;
  readonly defaultJobOptions = queueJobDefaults;
  readonly integrationSync: Queue;
  readonly webhookProcessing: Queue;
  readonly courierSync: Queue;

  constructor(config: ConfigService) {
    const redisUrl = new URL(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
    this.connection = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      maxRetriesPerRequest: null,
    };
    this.integrationSync = new Queue(INTEGRATION_SYNC_QUEUE, { connection: this.connection, defaultJobOptions: queueJobDefaults });
    this.webhookProcessing = new Queue(WEBHOOK_PROCESSING_QUEUE, { connection: this.connection, defaultJobOptions: queueJobDefaults });
    this.courierSync = new Queue(COURIER_SYNC_QUEUE, { connection: this.connection, defaultJobOptions: queueJobDefaults });
  }

  async onModuleDestroy() {
    await Promise.all([this.integrationSync.close(), this.webhookProcessing.close(), this.courierSync.close()]);
  }
}
