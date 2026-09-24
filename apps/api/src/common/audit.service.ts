import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(tenantId: string, actorUserId: string | undefined, action: string, entityType: string, entityId?: string, requestId?: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: { tenantId, actorUserId, action, entityType, entityId, requestId, metadata },
    });
  }
}
