import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthContext } from './auth.types';
import { permissionsForRole } from './rbac';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!required.length) return true;
    const user = context.switchToHttp().getRequest().user as AuthContext | undefined;
    if (!user?.tenantId || !user.role) throw new UnauthorizedException('Missing authorization context');
    const granted = new Set<string>([...permissionsForRole(user.role), ...user.permissions]);
    if (!required.every((permission) => granted.has('*') || granted.has(permission))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
