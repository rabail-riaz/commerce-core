import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({ imports: [AuthModule, EmailModule, WhatsAppModule], controllers: [InboxController], providers: [InboxService] })
export class InboxModule {}
