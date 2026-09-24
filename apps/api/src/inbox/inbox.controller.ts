import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { InboxService } from './inbox.service';

@ApiTags('inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inbox')
export class InboxController {
  constructor(private readonly service: InboxService) {}

  @Get()
  @RequirePermissions('communications.read')
  async list(@CurrentUser() user: AuthContext, @Query('channel') channel?: string, @Query('customerId') customerId?: string, @Query('orderId') orderId?: string) {
    return apiResponse(await this.service.list(user.tenantId, channel, customerId, orderId));
  }

  @Get(':channel/:id')
  @RequirePermissions('communications.read')
  async get(@CurrentUser() user: AuthContext, @Param('channel') channel: string, @Param('id') id: string) {
    return apiResponse(await this.service.get(user.tenantId, channel.toUpperCase(), id));
  }

  @Post(':channel/:id/read')
  @RequirePermissions('communications.read')
  async markRead(@CurrentUser() user: AuthContext, @Param('channel') channel: string, @Param('id') id: string) {
    return apiResponse(await this.service.markRead(user.tenantId, channel.toUpperCase(), id));
  }

  @Post(':channel/:id/reply')
  @RequirePermissions('communications.send')
  async reply(@CurrentUser() user: AuthContext, @Param('channel') channel: string, @Param('id') id: string, @Body() body: { body: string; senderAccountId?: string }) {
    return apiResponse(await this.service.reply(user.tenantId, user.userId, channel.toUpperCase(), id, body));
  }
}
