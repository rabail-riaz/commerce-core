import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole, Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

type AccessTokenPayload = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: MembershipRole;
  permissions: string[];
};

type RefreshTokenPayload = {
  sub: string;
  jti: string;
  tenantId: string;
  membershipId: string;
};

export type SafeUser = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'isEmailVerified' | 'isActive' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const slug = dto.tenantSlug.trim().toLowerCase();
    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.tenant.findUnique({ where: { slug } }),
    ]);
    if (existingUser) throw new ConflictException('Email already registered');
    if (existingTenant) throw new ConflictException('Tenant slug already in use');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: dto.tenantName.trim(), slug } });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
        },
      });
      const membership = await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: MembershipRole.OWNER },
      });
      const plan = await tx.plan.upsert({ where: { name: 'Trial' }, update: {}, create: { id: 'plan_trial', name: 'Trial' } });
      await tx.tenantSubscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'TRIAL', trialEndsAt: new Date(Date.now() + 15 * 86400000) },
      });
      await tx.auditLog.create({
        data: { tenantId: tenant.id, actorUserId: user.id, action: 'TENANT_CREATED', entityType: 'Tenant', entityId: tenant.id },
      });
      return { tenant, user, membership };
    });

    return this.createSession(result.user, result.tenant.id, result.membership.id, result.membership.role, result.membership.permissions);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = user.memberships.find(
      (candidate) => candidate.tenant.status === 'ACTIVE' && (!dto.tenantSlug || candidate.tenant.slug === dto.tenantSlug.trim().toLowerCase()),
    );
    if (!membership) throw new UnauthorizedException('No active tenant membership found');
    return this.createSession(user, membership.tenantId, membership.id, membership.role, membership.permissions);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (!payload) throw new UnauthorizedException('Invalid or expired refresh token');
    const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!record || record.userId !== payload.sub || record.revokedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!(await argon2.verify(record.tokenHash, refreshToken))) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user?.isActive) throw new UnauthorizedException('User account is inactive');
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: payload.membershipId,
        userId: user.id,
        tenantId: payload.tenantId,
        tenant: { status: 'ACTIVE' },
      },
    });
    if (!membership) throw new UnauthorizedException('No active tenant membership found');

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Refresh token has already been used');
      return this.createSession(user, membership.tenantId, membership.id, membership.role, membership.permissions, tx);
    });
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken, false);
    if (payload) {
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async getCurrentUser(userId: string, tenantId: string): Promise<SafeUser> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, tenantId, tenant: { status: 'ACTIVE' } },
      select: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, isEmailVerified: true, isActive: true, createdAt: true, updatedAt: true } },
      },
    });
    if (!membership) throw new UnauthorizedException('User account is not authorized for tenant');
    return membership.user;
  }

  private async verifyRefreshToken(token: string, required = true): Promise<RefreshTokenPayload | null> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      if (required) throw new UnauthorizedException('Invalid or expired refresh token');
      return null;
    }
  }

  private async createSession(
    user: User,
    tenantId: string,
    membershipId: string,
    role: MembershipRole,
    permissions: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const accessToken = await this.jwt.signAsync(
      { userId: user.id, tenantId, membershipId, role, permissions } satisfies AccessTokenPayload,
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
    const refreshRecord = await tx.refreshToken.create({
      data: { userId: user.id, tokenHash: await argon2.hash(randomUUID(), { type: argon2.argon2id }), expiresAt: new Date(Date.now() + 30 * 86400000) },
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: refreshRecord.id, tenantId, membershipId } satisfies RefreshTokenPayload,
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );
    await tx.refreshToken.update({
      where: { id: refreshRecord.id },
      data: { tokenHash: await argon2.hash(refreshToken, { type: argon2.argon2id }) },
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900, tenantId };
  }
}
