import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { PaginationDto } from '../common/pagination.dto';
import { apiResponse } from '../common/api-response';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  async list(@CurrentUser() user: AuthContext, @Query() pagination: PaginationDto) {
    return apiResponse(await this.service.list(user.tenantId, pagination));
  }
}
