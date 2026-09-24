import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { apiResponse } from '../common/api-response';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get('me')
  async getCurrent(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.getCurrent(user.tenantId));
  }

  @Patch('me')
  async updateCurrent(@CurrentUser() user: AuthContext, @Body() dto: UpdateTenantDto) {
    return apiResponse(await this.service.updateCurrent(user.tenantId, dto));
  }
}
