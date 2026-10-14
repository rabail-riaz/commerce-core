import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  async list(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.list(user.tenantId));
  }

  @Get('me')
  async getCurrent(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.getCurrent(user.userId, user.tenantId));
  }
}
