import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { SaveWhatsAppAccountDto, WhatsAppReplyDto, WhatsAppService } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly service: WhatsAppService) {}

  @Get('webhook')
  async verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    return this.service.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  async ingest(@Body() body: { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: Array<{ from?: string; id?: string; text?: { body?: string }; image?: { id?: string }; audio?: { id?: string }; video?: { id?: string }; document?: { id?: string } }>; statuses?: Array<{ id?: string; status?: string }> } }> }> }) {
    const results: unknown[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const message of value?.messages ?? []) {
          const media = message.image ?? message.audio ?? message.video ?? message.document;
          results.push(await this.service.ingest({
            phoneNumberId: value?.metadata?.phone_number_id,
            from: message.from,
            body: message.text?.body,
            mediaType: media ? Object.keys(message).find((key) => ['image', 'audio', 'video', 'document'].includes(key)) : undefined,
            mediaReference: media?.id,
            providerMessageId: message.id,
          }));
        }
        for (const status of value?.statuses ?? []) {
          results.push(await this.service.ingest({ phoneNumberId: value?.metadata?.phone_number_id, providerMessageId: status.id, status: status.status }));
        }
      }
    }
    return apiResponse(results.length ? results : { ignored: true });
  }

  @Get('accounts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('integrations.read')
  async accounts(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listAccounts(user.tenantId));
  }

  @Post('accounts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('integrations.manage')
  async saveAccount(@CurrentUser() user: AuthContext, @Body() dto: SaveWhatsAppAccountDto) {
    return apiResponse(await this.service.saveAccount(user.tenantId, dto));
  }

  @Get('conversations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('communications.read')
  async conversations(@CurrentUser() user: AuthContext, @Query('customerId') customerId?: string, @Query('orderId') orderId?: string) {
    return apiResponse(await this.service.listConversations(user.tenantId, customerId, orderId));
  }

  @Get('conversations/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('communications.read')
  async conversation(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getConversation(user.tenantId, id));
  }

  @Post('conversations/:id/reply')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('communications.send')
  async reply(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: WhatsAppReplyDto) {
    return apiResponse(await this.service.reply(user.tenantId, user.userId, id, dto));
  }

  @Post('conversations/:id/read')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('communications.read')
  async markRead(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.markRead(user.tenantId, id));
  }
}
