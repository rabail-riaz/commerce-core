import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextService } from './tenant-context.service';
import { PermissionsGuard } from './permissions.guard';
import { AuditService } from './audit.service';

@Global()
@Module({ imports: [PrismaModule], providers: [TenantContextService, PermissionsGuard, AuditService], exports: [TenantContextService, PermissionsGuard, AuditService] })
export class CommonModule {}
