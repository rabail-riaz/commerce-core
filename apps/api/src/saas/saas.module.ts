import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SaasController } from './saas.controller';
import { SaasService } from './saas.service';

@Module({ imports: [AuthModule], controllers: [SaasController], providers: [SaasService], exports: [SaasService] })
export class SaasModule {}
