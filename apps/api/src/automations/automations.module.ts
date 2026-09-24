import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SaasModule } from '../saas/saas.module';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

@Module({ imports: [AuthModule, SaasModule], controllers: [AutomationsController], providers: [AutomationsService] })
export class AutomationsModule {}
