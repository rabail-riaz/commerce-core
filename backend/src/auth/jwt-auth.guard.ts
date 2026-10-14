import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenClaims } from '../common/auth.types';
import { TenantContextService } from '../common/tenant-context.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(value.slice(7), { secret: process.env.JWT_ACCESS_SECRET });
      request.user = await this.tenantContext.resolveAccessContext(claims);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
