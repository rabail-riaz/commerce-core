import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId, OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  markRead(tenantId: string, userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { tenantId, id, OR: [{ userId }, { userId: null }] }, data: { status: 'READ' } });
  }

  create(tenantId: string, type: string, title: string, body: string, userId?: string, entityType?: string, entityId?: string) {
    return this.prisma.notification.create({ data: { tenantId, userId, type, title, body, entityType, entityId } });
  }
}
