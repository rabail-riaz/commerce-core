import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { SaasService } from './saas.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

class PlatformFlagDto {
  @IsString() key!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() planId?: string;
}

@ApiTags('saas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SaasController {
  constructor(private readonly service: SaasService, private readonly prisma: PrismaService) {}

  @Get('billing/subscription')
  async subscription(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.current(user.tenantId));
  }

  @Get('feature-flags')
  async flags(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.flags(user.tenantId));
  }

  @Get('billing/usage')
  async usage(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.usage(user.tenantId));
  }

  @Get('platform/overview')
  async platform(@CurrentUser() user: AuthContext) {
    const account = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { isPlatformAdmin: true } });
    if (!account?.isPlatformAdmin) throw new ForbiddenException('Platform admin access required');
    return apiResponse(await this.service.platformOverview(true));
  }

  @Get('platform/health')
  async platformHealth(@CurrentUser() user: AuthContext) {
    const account = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { isPlatformAdmin: true } });
    return apiResponse(await this.service.platformHealth(Boolean(account?.isPlatformAdmin)));
  }

  @Patch('platform/feature-flags')
  async updatePlatformFlag(@CurrentUser() user: AuthContext, @Body() dto: PlatformFlagDto) {
    const account = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { isPlatformAdmin: true } });
    return apiResponse(await this.service.updatePlatformFlag(Boolean(account?.isPlatformAdmin), user.tenantId, user.userId, dto.key, dto.enabled, dto.tenantId, dto.planId));
  }
}
