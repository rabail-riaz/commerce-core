import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CreateReturnDto, ShipmentQueryDto, SyncShipmentsDto, UpdateReturnStatusDto } from './dto';
import { ShippingService } from './shipping.service';

@ApiTags('shipping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ShippingController {
  constructor(private readonly service: ShippingService) {}

  @Get('shipments/summary')
  @RequirePermissions('shipping.read')
  async summary(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.summarize(user.tenantId));
  }

  @Post('shipments/sync')
  @RequirePermissions('shipping.book')
  async sync(@CurrentUser() user: AuthContext, @Body() dto: SyncShipmentsDto = {}) {
    return apiResponse(await this.service.syncFromCouriers(user.tenantId, dto ?? {}));
  }

  @Get('shipments')
  @RequirePermissions('shipping.read')
  async listShipments(@CurrentUser() user: AuthContext, @Query() query: ShipmentQueryDto) {
    return apiResponse(await this.service.listShipments(user.tenantId, query));
  }

  @Get('shipments/:id')
  @RequirePermissions('shipping.read')
  async getShipment(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getShipment(user.tenantId, id));
  }

  @Post('shipments/:id/track')
  @RequirePermissions('shipping.read')
  async trackShipment(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.trackShipment(user.tenantId, id));
  }

  @Get('returns')
  @RequirePermissions('shipping.read')
  async listReturns(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listReturns(user.tenantId));
  }

  @Get('returns/:id')
  @RequirePermissions('shipping.read')
  async getReturn(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getReturn(user.tenantId, id));
  }

  @Post('returns')
  @RequirePermissions('shipping.book')
  async createReturn(@CurrentUser() user: AuthContext, @Body() dto: CreateReturnDto) {
    return apiResponse(await this.service.createReturn(user.tenantId, dto));
  }

  @Patch('returns/:id/status')
  @RequirePermissions('shipping.book')
  async updateReturnStatus(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateReturnStatusDto) {
    return apiResponse(await this.service.updateReturnStatus(user.tenantId, id, dto));
  }
}
