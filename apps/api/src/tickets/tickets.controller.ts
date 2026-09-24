import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CreateTicketDto, TicketMessageDto, TicketQueryDto, UpdateTicketDto } from './dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  @Get()
  @RequirePermissions('tickets.read')
  async list(@CurrentUser() user: AuthContext, @Query() query: TicketQueryDto) {
    return apiResponse(await this.service.list(user.tenantId, query));
  }

  @Get(':id')
  @RequirePermissions('tickets.read')
  async getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getById(user.tenantId, id));
  }

  @Post()
  @RequirePermissions('tickets.update')
  async create(@CurrentUser() user: AuthContext, @Body() dto: CreateTicketDto) {
    return apiResponse(await this.service.create(user.tenantId, user.userId, dto));
  }

  @Patch(':id')
  @RequirePermissions('tickets.update')
  async update(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return apiResponse(await this.service.update(user.tenantId, user.userId, id, dto));
  }

  @Post(':id/messages')
  @RequirePermissions('tickets.update')
  async addMessage(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: TicketMessageDto) {
    return apiResponse(await this.service.addMessage(user.tenantId, user.userId, id, dto));
  }
}
