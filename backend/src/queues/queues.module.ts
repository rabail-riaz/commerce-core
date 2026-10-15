import { Global, Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ShippingModule } from '../shipping/shipping.module';
import { QueueFoundationService } from './queue-foundation.service';
import { QueueWorkerService } from './queue-worker.service';

@Global()
@Module({
  imports: [IntegrationsModule, ShippingModule],
  providers: [QueueFoundationService, QueueWorkerService],
  exports: [QueueFoundationService],
})
export class QueuesModule {}
