import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { OrderQueryDto } from './dto';
import { OrdersService } from './orders.service';
import { BookOrderShipmentDto } from './shipment.dto';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('orders.read')
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  async list(@CurrentUser() user: AuthContext, @Query() query: OrderQueryDto) {
    return apiResponse(await this.service.list(user.tenantId, query));
  }

  @Get(':id')
  async getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getById(user.tenantId, id));
  }

  @Post(':id/shipment')
  @RequirePermissions('shipping.book')
  async bookShipment(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: BookOrderShipmentDto) {
    return apiResponse(await this.service.bookShipment(user.tenantId, id, dto));
  }
}
