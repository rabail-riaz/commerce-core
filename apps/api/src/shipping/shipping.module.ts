import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouriersModule } from '../couriers/couriers.module';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [AuthModule, CouriersModule],
  controllers: [ShippingController],
  providers: [ShippingService],
})
export class ShippingModule {}
