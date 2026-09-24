import { Controller, Get, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { PaginationDto } from '../common/pagination.dto';
import { apiResponse } from '../common/api-response';
import { IntegrationsService } from './integrations.service';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateIntegrationDto, IntegrationCredentialsDto } from './dto';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Post()
  @RequirePermissions('integrations.manage')
  async create(@CurrentUser() user: AuthContext, @Body() dto: CreateIntegrationDto) {
    return apiResponse(await this.service.create(user.tenantId, dto));
  }

  @Get()
  @RequirePermissions('integrations.read')
  async list(@CurrentUser() user: AuthContext, @Query() pagination: PaginationDto) {
    return apiResponse(await this.service.list(user.tenantId, pagination));
  }

  @Get(':id')
  @RequirePermissions('integrations.read')
  async getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getById(user.tenantId, id));
  }

  @Post(':id/credentials')
  @RequirePermissions('integrations.manage')
  async saveCredentials(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: IntegrationCredentialsDto) {
    return apiResponse(await this.service.saveCredentials(user.tenantId, id, dto.credentials));
  }

  @Post(':id/test-connection')
  @RequirePermissions('integrations.manage')
  async testConnection(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.testConnection(user.tenantId, id));
  }

  @Post(':id/sync')
  @RequirePermissions('integrations.manage')
  async sync(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.startInitialSync(user.tenantId, id));
  }

  @Post(':id/reconcile')
  @RequirePermissions('integrations.manage')
  async reconcile(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.startReconciliation(user.tenantId, id));
  }

  @Get(':id/sync/:jobId')
  @RequirePermissions('integrations.read')
  async syncStatus(@CurrentUser() user: AuthContext, @Param('id') id: string, @Param('jobId') jobId: string) {
    return apiResponse(await this.service.getSyncJobStatus(user.tenantId, id, jobId));
  }

  @Get(':id/sync-logs')
  @RequirePermissions('integrations.read')
  async syncLogs(@CurrentUser() user: AuthContext, @Param('id') id: string, @Query() pagination: PaginationDto) {
    return apiResponse(await this.service.listSyncLogs(user.tenantId, id, pagination));
  }

}
