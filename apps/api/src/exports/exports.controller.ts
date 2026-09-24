import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { ExportsService } from './exports.service';

class ExportQueryDto {
  @IsIn(['orders', 'customers', 'shipments', 'returns', 'reports'])
  type!: 'orders' | 'customers' | 'shipments' | 'returns' | 'reports';
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() storeId?: string;
}

@ApiTags('exports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Get()
  @RequirePermissions('exports.create')
  async csv(@CurrentUser() user: AuthContext, @Query() query: ExportQueryDto, @Res() response: Response) {
    const csv = await this.service.csv(user.tenantId, query.type, query);
    response.setHeader('content-type', 'text/csv');
    response.setHeader('content-disposition', `attachment; filename="${query.type}.csv"`);
    response.send(csv);
  }
}
