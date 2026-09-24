import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { AutomationsService, CreateAutomationDto } from './automations.service';

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('automations')
export class AutomationsController {
  constructor(private readonly service: AutomationsService) {}

  @Get()
  @RequirePermissions('automations.read')
  async list(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.list(user.tenantId));
  }

  @Post()
  @RequirePermissions('automations.manage')
  async create(@CurrentUser() user: AuthContext, @Body() dto: CreateAutomationDto) {
    return apiResponse(await this.service.create(user.tenantId, user.userId, dto));
  }

  @Post(':id/execute')
  @RequirePermissions('automations.manage')
  async execute(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.execute(user.tenantId, id));
  }

  @Post('trigger/:trigger/:entityId')
  @RequirePermissions('automations.manage')
  async trigger(@CurrentUser() user: AuthContext, @Param('trigger') trigger: string, @Param('entityId') entityId: string) {
    return apiResponse(await this.service.trigger(user.tenantId, trigger, entityId));
  }

  @Post('executions/:id/retry')
  @RequirePermissions('automations.manage')
  async retry(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.retry(user.tenantId, id));
  }
}
