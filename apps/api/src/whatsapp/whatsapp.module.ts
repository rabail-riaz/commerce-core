import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppAdapterRegistry } from './whatsapp-adapter.registry';
import { MetaWhatsAppAdapter } from './meta-whatsapp.adapter';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppAdapterRegistry,
    MetaWhatsAppAdapter,
    {
      provide: 'WHATSAPP_ADAPTER_REGISTRATION',
      inject: [WhatsAppAdapterRegistry, MetaWhatsAppAdapter],
      useFactory: (registry: WhatsAppAdapterRegistry, adapter: MetaWhatsAppAdapter) => registry.register(adapter),
    },
  ],
  exports: [WhatsAppService, WhatsAppAdapterRegistry],
})
export class WhatsAppModule {}
