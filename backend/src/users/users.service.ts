import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      select: {
        id: true,
        role: true,
        permissions: true,
        createdAt: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCurrent(userId: string, tenantId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, tenantId, tenant: { status: 'ACTIVE' } },
      select: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, isEmailVerified: true, isActive: true, createdAt: true, updatedAt: true } },
      },
    });
    if (!membership) throw new NotFoundException('User not found in tenant');
    return membership.user;
  }
}
