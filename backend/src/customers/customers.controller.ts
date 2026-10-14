import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CustomerQueryDto } from './dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('customers.read')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  async list(@CurrentUser() user: AuthContext, @Query() query: CustomerQueryDto) {
    return apiResponse(await this.service.list(user.tenantId, query));
  }

  @Get(':id')
  async getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getById(user.tenantId, id));
  }
}
