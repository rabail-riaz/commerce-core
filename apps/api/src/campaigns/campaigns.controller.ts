import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CreateCampaignDto, CreateTemplateDto, RenderTemplateDto, UpdateCampaignDto, UpdateTemplateDto } from './dto';
import { CampaignsService } from './campaigns.service';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get('templates')
  @RequirePermissions('campaigns.read')
  async templates(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listTemplates(user.tenantId));
  }

  @Post('templates')
  @RequirePermissions('campaigns.create')
  async createTemplate(@CurrentUser() user: AuthContext, @Body() dto: CreateTemplateDto) {
    return apiResponse(await this.service.createTemplate(user.tenantId, dto));
  }

  @Patch('templates/:id')
  @RequirePermissions('campaigns.create')
  async updateTemplate(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return apiResponse(await this.service.updateTemplate(user.tenantId, id, dto));
  }

  @Post('templates/:id/preview')
  @RequirePermissions('campaigns.read')
  async previewTemplate(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: RenderTemplateDto) {
    return apiResponse(await this.service.renderTemplate(user.tenantId, id, dto));
  }

  @Post('templates/:id/deactivate')
  @RequirePermissions('campaigns.create')
  async deactivateTemplate(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.deactivateTemplate(user.tenantId, id));
  }

  @Get('campaigns')
  @RequirePermissions('campaigns.read')
  async list(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listCampaigns(user.tenantId));
  }

  @Post('campaigns')
  @RequirePermissions('campaigns.create')
  async create(@CurrentUser() user: AuthContext, @Body() dto: CreateCampaignDto) {
    return apiResponse(await this.service.createCampaign(user.tenantId, user.userId, dto));
  }

  @Patch('campaigns/:id')
  @RequirePermissions('campaigns.create')
  async update(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return apiResponse(await this.service.updateCampaign(user.tenantId, id, dto));
  }

  @Post('campaigns/:id/execute')
  @RequirePermissions('campaigns.send')
  async execute(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.execute(user.tenantId, user.userId, id));
  }
}
