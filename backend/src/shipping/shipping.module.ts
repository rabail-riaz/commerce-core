import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouriersModule } from '../couriers/couriers.module';
import { ShippingController } from './shipping.controller';
import { CourierWebhookController } from './courier-webhook.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [AuthModule, CouriersModule],
  controllers: [ShippingController, CourierWebhookController],
  providers: [ShippingService],
})
export class ShippingModule {}
