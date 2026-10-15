import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { IntegrationsService } from '../integrations/integrations.service';
import { ShippingService } from '../shipping/shipping.service';
import { COURIER_SYNC_QUEUE, INTEGRATION_SYNC_QUEUE, WEBHOOK_PROCESSING_QUEUE } from './queue.constants';
import { QueueFoundationService } from './queue-foundation.service';

type SyncJob = { tenantId: string; integrationId: string; provider: string; syncLogId: string };
type WebhookJob = { eventId: string; integrationId: string; eventType: string; rawBody: string; payload: Record<string, unknown> };

const COURIER_SYNC_INTERVAL_MS = 20 * 60 * 1000;

@Injectable()
export class QueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkerService.name);
  private workers: Worker[] = [];

  constructor(
    private readonly queues: QueueFoundationService,
    private readonly integrations: IntegrationsService,
    private readonly shipping: ShippingService,
  ) {}

  async onModuleInit() {
    const options = { connection: this.queues.connection, concurrency: 2 };
    this.workers = [
      new Worker<SyncJob>(INTEGRATION_SYNC_QUEUE, (job) => job.name === 'reconcile-store'
        ? this.integrations.reconcileStoreJob(job.data, job.attemptsMade, job.opts.attempts ?? 1)
        : this.integrations.processInitialSyncJob(job.data, job.attemptsMade, job.opts.attempts ?? 1), options),
      new Worker<WebhookJob>(WEBHOOK_PROCESSING_QUEUE, (job) => this.integrations.processWebhookJob(job.data), options),
      new Worker<unknown, unknown>(COURIER_SYNC_QUEUE, async (): Promise<unknown> => this.shipping.syncAllTenants(), options),
    ];
    for (const worker of this.workers) {
      worker.on('failed', (job, error) => {
        this.logger.error(`Queue job failed: ${job?.queueName ?? 'unknown'}/${job?.id ?? 'unknown'}: ${error.message}`);
      });
    }
    // Keeps every tenant's shipment/order statuses in line with the courier
    // on a timer, instead of relying on someone noticing and clicking "Sync".
    await this.queues.courierSync.add('sync-all-tenants', {}, { repeat: { every: COURIER_SYNC_INTERVAL_MS }, jobId: 'courier-sync-repeat' });
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
