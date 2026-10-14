import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthContext } from '../common/auth.types';
import { apiResponse } from '../common/api-response';
import { AccountingService } from './accounting.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreatePurchaseOrderDto,
  CreateVendorDto,
  ExpenseQueryDto,
  PurchaseOrderQueryDto,
  UpdateExpenseDto,
  UpdatePurchaseOrderDto,
  UpdateVendorDto,
  VendorQueryDto,
} from './dto';

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('vendors')
  @RequirePermissions('accounting.read')
  async listVendors(@CurrentUser() user: AuthContext, @Query() query: VendorQueryDto) {
    return apiResponse(await this.service.listVendors(user.tenantId, query));
  }

  @Get('vendors/:id')
  @RequirePermissions('accounting.read')
  async getVendor(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getVendor(user.tenantId, id));
  }

  @Post('vendors')
  @RequirePermissions('accounting.create')
  async createVendor(@CurrentUser() user: AuthContext, @Body() dto: CreateVendorDto) {
    return apiResponse(await this.service.createVendor(user.tenantId, dto));
  }

  @Patch('vendors/:id')
  @RequirePermissions('accounting.update')
  async updateVendor(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return apiResponse(await this.service.updateVendor(user.tenantId, id, dto));
  }

  @Delete('vendors/:id')
  @RequirePermissions('accounting.delete')
  async removeVendor(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.removeVendor(user.tenantId, id));
  }

  @Get('purchase-orders')
  @RequirePermissions('accounting.read')
  async listPurchaseOrders(@CurrentUser() user: AuthContext, @Query() query: PurchaseOrderQueryDto) {
    return apiResponse(await this.service.listPurchaseOrders(user.tenantId, query));
  }

  @Get('purchase-orders/:id')
  @RequirePermissions('accounting.read')
  async getPurchaseOrder(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getPurchaseOrder(user.tenantId, id));
  }

  @Post('purchase-orders')
  @RequirePermissions('accounting.create')
  async createPurchaseOrder(@CurrentUser() user: AuthContext, @Body() dto: CreatePurchaseOrderDto) {
    return apiResponse(await this.service.createPurchaseOrder(user.tenantId, dto));
  }

  @Patch('purchase-orders/:id')
  @RequirePermissions('accounting.update')
  async updatePurchaseOrder(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return apiResponse(await this.service.updatePurchaseOrder(user.tenantId, id, dto));
  }

  @Delete('purchase-orders/:id')
  @RequirePermissions('accounting.delete')
  async removePurchaseOrder(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.removePurchaseOrder(user.tenantId, id));
  }

  @Get('expense-categories')
  @RequirePermissions('accounting.read')
  async listExpenseCategories(@CurrentUser() user: AuthContext) {
    return apiResponse(await this.service.listExpenseCategories(user.tenantId));
  }

  @Post('expense-categories')
  @RequirePermissions('accounting.create')
  async createExpenseCategory(@CurrentUser() user: AuthContext, @Body() dto: CreateExpenseCategoryDto) {
    return apiResponse(await this.service.createExpenseCategory(user.tenantId, dto));
  }

  @Delete('expense-categories/:id')
  @RequirePermissions('accounting.delete')
  async removeExpenseCategory(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.removeExpenseCategory(user.tenantId, id));
  }

  @Get('expenses')
  @RequirePermissions('accounting.read')
  async listExpenses(@CurrentUser() user: AuthContext, @Query() query: ExpenseQueryDto) {
    return apiResponse(await this.service.listExpenses(user.tenantId, query));
  }

  @Get('expenses/:id')
  @RequirePermissions('accounting.read')
  async getExpense(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.getExpense(user.tenantId, id));
  }

  @Post('expenses')
  @RequirePermissions('accounting.create')
  async createExpense(@CurrentUser() user: AuthContext, @Body() dto: CreateExpenseDto) {
    return apiResponse(await this.service.createExpense(user.tenantId, dto));
  }

  @Patch('expenses/:id')
  @RequirePermissions('accounting.update')
  async updateExpense(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return apiResponse(await this.service.updateExpense(user.tenantId, id, dto));
  }

  @Delete('expenses/:id')
  @RequirePermissions('accounting.delete')
  async removeExpense(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return apiResponse(await this.service.removeExpense(user.tenantId, id));
  }
}
