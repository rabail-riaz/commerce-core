import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @RequirePermissions('products.read')
  async list(@CurrentUser() user: AuthContext, @Query() query: ProductQueryDto) {
    return apiResponse(await this.service.list(user.tenantId, query));
  }

  @Get(':id')
  @RequirePermissions('products.read')
  async getById(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getById(user.tenantId, id));
  }

  @Post()
  @RequirePermissions('products.create')
  async create(@CurrentUser() user: AuthContext, @Body() dto: CreateProductDto) {
    return apiResponse(await this.service.create(user.tenantId, dto));
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  async update(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return apiResponse(await this.service.update(user.tenantId, id, dto));
  }

  @Delete(':id')
  @RequirePermissions('products.delete')
  async remove(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.remove(user.tenantId, id));
  }
}
