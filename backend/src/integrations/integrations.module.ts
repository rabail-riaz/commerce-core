import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationEncryptionService } from './integration-encryption.service';
import { IntegrationAdapterRegistry } from './integration-adapter.registry';
import { WooCommerceAdapter } from './woocommerce.adapter';
import { ShopifyAdapter } from './shopify.adapter';
import { WooCommerceWebhookController } from './woocommerce-webhook.controller';
import { AuthModule } from '../auth/auth.module';
import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';

@Module({ imports: [AuthModule], controllers: [IntegrationsController, WooCommerceWebhookController], providers: [IntegrationsService, IntegrationEncryptionService, IntegrationAdapterRegistry, WooCommerceAdapter, ShopifyAdapter, ReconciliationSchedulerService], exports: [IntegrationsService, IntegrationEncryptionService] })
export class IntegrationsModule {}
