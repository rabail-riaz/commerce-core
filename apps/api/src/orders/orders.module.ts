import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CouriersModule } from '../couriers/couriers.module';

@Module({
  imports: [AuthModule, CouriersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
