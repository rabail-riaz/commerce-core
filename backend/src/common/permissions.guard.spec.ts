import { ExecutionContext } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS } from './rbac';

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard({
    getAllAndOverride: () => [],
  } as never);

  function context(role: MembershipRole, permissions: string[], required: string): ExecutionContext {
    const reflector = guard as unknown as { reflector: { getAllAndOverride: () => string[] } };
    reflector.reflector.getAllAndOverride = () => [required];
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: { tenantId: 'tenant-1', role, permissions } }) }),
    } as unknown as ExecutionContext;
  }

  it.each(PERMISSIONS)('allows OWNER to use %s', (permission) => {
    expect(guard.canActivate(context('OWNER', [], permission))).toBe(true);
  });

  it.each(PERMISSIONS)('rejects VIEWER when it lacks %s', (permission) => {
    const viewerPermissions = ['orders.read', 'customers.read', 'shipping.read', 'communications.read', 'campaigns.read', 'integrations.read', 'tickets.read', 'reports.read'];
    if (viewerPermissions.includes(permission)) return;
    expect(() => guard.canActivate(context('VIEWER', [], permission))).toThrow('Insufficient permissions');
  });
});
