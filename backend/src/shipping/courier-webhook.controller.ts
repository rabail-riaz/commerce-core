import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { apiResponse } from '../common/api-response';
import { ShippingService } from './shipping.service';

@ApiTags('courier-webhooks')
@Controller('couriers/webhooks')
export class CourierWebhookController {
  constructor(private readonly service: ShippingService) {}

  @Post(':courier/:accountId/:token')
  async receive(
    @Param('courier') courier: string,
    @Param('accountId') accountId: string,
    @Param('token') token: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return apiResponse(await this.service.receiveCourierWebhook(courier.trim().toUpperCase(), accountId, token, payload ?? {}));
  }
}
