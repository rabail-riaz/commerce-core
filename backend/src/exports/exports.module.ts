import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({ imports: [AuthModule, ReportsModule], controllers: [ExportsController], providers: [ExportsService] })
export class ExportsModule {}
