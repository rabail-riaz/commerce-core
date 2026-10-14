import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CouriersService } from './couriers.service';

class ConnectCourierDto {
  @IsObject()
  credentials!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  name?: string;
}

@ApiTags('couriers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('couriers')
export class CouriersController {
  constructor(private readonly service: CouriersService) {}

  @Get()
  @RequirePermissions('integrations.read')
  async list(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listForTenant(user.tenantId));
  }

  @Post(':code/connect')
  @RequirePermissions('integrations.manage')
  async connect(@CurrentUser() user: AuthContext, @Param('code') code: string, @Body() dto: ConnectCourierDto) {
    return apiResponse(await this.service.connect(user.tenantId, code, dto.credentials, dto.name));
  }

  @Post(':code/disconnect')
  @RequirePermissions('integrations.manage')
  async disconnect(@CurrentUser() user: AuthContext, @Param('code') code: string) {
    return apiResponse(await this.service.disconnect(user.tenantId, code));
  }
}
