import { Module } from '@nestjs/common';
import { CourierAdapterRegistry } from './courier-adapter.registry';
import { CouriersService } from './couriers.service';
import { PostExAdapter } from './postex.adapter';

@Module({
  providers: [PostExAdapter, CourierAdapterRegistry, CouriersService],
  exports: [CourierAdapterRegistry, CouriersService],
})
export class CouriersModule {}
