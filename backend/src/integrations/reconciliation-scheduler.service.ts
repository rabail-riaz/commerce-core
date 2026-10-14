import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from './integrations.service';

const DEFAULT_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1_000;

@Injectable()
export class ReconciliationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ConfigService,
    private readonly integrations: IntegrationsService,
  ) {}

  onModuleInit() {
    const configured = this.config.get<string | number>('RECONCILIATION_INTERVAL_MS');
    const interval = Number(configured ?? DEFAULT_RECONCILIATION_INTERVAL_MS);
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error('RECONCILIATION_INTERVAL_MS must be a positive number');
    }
    this.timer = setInterval(() => {
      void this.run();
    }, interval);
  }

  async run() {
    try {
      return await this.integrations.reconcileActiveIntegrations();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Scheduled reconciliation failed');
      return [];
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
