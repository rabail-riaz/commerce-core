import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CourierAdapterRegistry } from './courier-adapter.registry';
import { CouriersController } from './couriers.controller';
import { CouriersService } from './couriers.service';
import { LeopardsAdapter } from './leopards.adapter';
import { PostExAdapter } from './postex.adapter';

@Module({
  imports: [AuthModule],
  controllers: [CouriersController],
  providers: [PostExAdapter, LeopardsAdapter, CourierAdapterRegistry, CouriersService],
  exports: [CourierAdapterRegistry, CouriersService],
})
export class CouriersModule {}
