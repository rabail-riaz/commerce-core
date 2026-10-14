import { MembershipRole, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// Idempotent platform super-admin seed. All values come from backend/.env; the password is never logged.
// Existing user keeps their current password unless SUPER_ADMIN_RESET_PASSWORD=true.

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in backend/.env to run the seed`);
  return value;
}

async function main() {
  const email = requireEnv('SUPER_ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('SUPER_ADMIN_PASSWORD');
  const tenantName = requireEnv('SUPER_ADMIN_TENANT_NAME');
  const tenantSlug = requireEnv('SUPER_ADMIN_TENANT_SLUG').toLowerCase();
  const resetPassword = process.env.SUPER_ADMIN_RESET_PASSWORD === 'true';

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) throw new Error('SUPER_ADMIN_TENANT_SLUG must be lowercase letters, digits and hyphens');
  if (password.length < 12) console.warn('Warning: SUPER_ADMIN_PASSWORD is shorter than 12 characters. Use it for local development only.');

  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({ where: { slug: tenantSlug }, update: {}, create: { name: tenantName, slug: tenantSlug } });
      const store = await tx.store.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: tenantName } },
        update: {},
        create: { tenantId: tenant.id, name: tenantName },
      });

      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
      const passwordHash = !existing || resetPassword ? await argon2.hash(password, { type: argon2.argon2id }) : undefined;
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { isActive: true, isPlatformAdmin: true, ...(passwordHash && { passwordHash }) } })
        : await tx.user.create({
            data: { email, passwordHash: passwordHash!, firstName: 'Super', lastName: 'Admin', isEmailVerified: true, isPlatformAdmin: true },
          });

      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: { role: MembershipRole.OWNER },
        create: { tenantId: tenant.id, userId: user.id, role: MembershipRole.OWNER },
      });

      const plan = await tx.plan.upsert({ where: { name: 'Trial' }, update: {}, create: { id: 'plan_trial', name: 'Trial' } });
      await tx.tenantSubscription.upsert({
        where: { tenantId: tenant.id },
        update: {},
        create: { tenantId: tenant.id, planId: plan.id, status: 'TRIAL', trialEndsAt: new Date(Date.now() + 15 * 86400000) },
      });

      if (!existing) {
        await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId: user.id, action: 'SEED_SUPER_ADMIN_CREATED', entityType: 'User', entityId: user.id } });
      }
      return { tenant, store, created: !existing, passwordUpdated: Boolean(passwordHash) };
    });

    console.log(
      `Seed complete: tenant "${result.tenant.name}" (${result.tenant.slug}), super admin ${email} ` +
        `${result.created ? 'created' : 'already existed'}${!result.created && result.passwordUpdated ? ' (password reset)' : ''}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
