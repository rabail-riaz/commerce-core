import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { apiResponse } from '../common/api-response';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class WooCommerceWebhookController {
  constructor(private readonly service: IntegrationsService) {}

  @Post(':id/webhook')
  async receive(
    @Param('id') id: string,
    @Headers('x-wc-webhook-topic') topic: string,
    @Headers('x-wc-webhook-id') webhookId: string | undefined,
    @Headers('x-wc-webhook-signature') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() payload: Record<string, unknown>,
  ) {
    return apiResponse(await this.service.receiveWooCommerceWebhook(
      id,
      topic,
      webhookId,
      signature,
      request.rawBody ?? Buffer.from(JSON.stringify(payload)),
      payload,
    ));
  }
}
