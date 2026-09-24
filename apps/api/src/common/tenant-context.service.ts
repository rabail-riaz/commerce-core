import { Injectable, UnauthorizedException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenClaims, AuthContext } from './auth.types';

@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAccessContext(claims: Partial<AccessTokenClaims>): Promise<AuthContext> {
    if (!claims.userId || !claims.tenantId || !claims.membershipId) {
      throw new UnauthorizedException('Missing tenant context');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: claims.membershipId },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        role: true,
        permissions: true,
        assignedRole: {
          select: {
            permissions: {
              where: { permission: { isActive: true } },
              select: { permission: { select: { key: true } } },
            },
          },
        },
        user: { select: { isActive: true } },
        tenant: { select: { status: true } },
      },
    });

    if (
      !membership ||
      membership.userId !== claims.userId ||
      membership.tenantId !== claims.tenantId ||
      !membership.user.isActive ||
      membership.tenant.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid tenant membership');
    }

    return {
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role as MembershipRole,
      permissions: [
        ...new Set([
          ...membership.permissions,
          ...(membership.assignedRole?.permissions.map((item) => item.permission.key) ?? []),
        ]),
      ],
    };
  }

  requireTenant(context: Pick<AuthContext, 'tenantId'>): string {
    if (!context.tenantId) throw new UnauthorizedException('Missing tenant context');
    return context.tenantId;
  }
}
