import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ScoringController } from '../scoring/scoring.controller';
import { ScoringService } from '../scoring/scoring.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomersController, ScoringController],
  providers: [CustomersService, ScoringService],
})
export class CustomersModule {}
