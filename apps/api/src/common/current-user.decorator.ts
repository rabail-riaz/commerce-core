import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from './auth.types';
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => ctx.switchToHttp().getRequest().user);
