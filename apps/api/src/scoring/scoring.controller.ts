import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { ScoringService } from './scoring.service';

class OverrideScoreDto {
  @IsString()
  manualClassification!: string;
}

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class ScoringController {
  constructor(private readonly service: ScoringService) {}

  @Post(':id/score')
  @RequirePermissions('customers.update')
  async recalculate(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.recalculate(user.tenantId, id));
  }

  @Post(':id/score/override')
  @RequirePermissions('customers.update')
  async override(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: OverrideScoreDto) {
    return apiResponse(await this.service.override(user.tenantId, id, dto.manualClassification));
  }
}
