import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmailAdapterRegistry } from './email-adapter.registry';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { SmtpAdapter } from './smtp.adapter';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [EmailController],
  providers: [EmailAdapterRegistry, EmailService, SmtpAdapter, {
    provide: 'EMAIL_ADAPTER_REGISTRATION',
    inject: [EmailAdapterRegistry, SmtpAdapter],
    useFactory: (registry: EmailAdapterRegistry, smtp: SmtpAdapter) => registry.register(smtp),
  }],
  exports: [EmailService, EmailAdapterRegistry],
})
export class EmailModule {}
