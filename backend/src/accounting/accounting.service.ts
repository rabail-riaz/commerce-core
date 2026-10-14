import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

const purchaseOrderInclude = {
  vendor: { select: { id: true, name: true, status: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
  expenses: { include: { category: true }, orderBy: { expenseDate: 'desc' as const } },
} satisfies Prisma.PurchaseOrderInclude;

const expenseInclude = {
  category: true,
  purchaseOrder: { include: { vendor: { select: { id: true, name: true } } } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // Vendors

  async listVendors(tenantId: string, query: VendorQueryDto) {
    const where: Prisma.VendorWhereInput = { tenantId, ...(query.status ? { status: query.status } : {}) };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: query.limit, include: { _count: { select: { purchaseOrders: true } } } }),
      this.prisma.vendor.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getVendor(tenantId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { tenantId, id }, include: { _count: { select: { purchaseOrders: true } } } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async createVendor(tenantId: string, dto: CreateVendorDto) {
    return this.prisma.vendor.create({ data: { tenantId, ...dto } });
  }

  async updateVendor(tenantId: string, id: string, dto: UpdateVendorDto) {
    await this.assertVendor(tenantId, id);
    return this.prisma.vendor.update({ where: { tenantId_id: { tenantId, id } }, data: { ...dto } });
  }

  async removeVendor(tenantId: string, id: string) {
    await this.assertVendor(tenantId, id);
    return this.prisma.vendor.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  // Purchase orders

  async listPurchaseOrders(tenantId: string, query: PurchaseOrderQueryDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({ where, include: purchaseOrderInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getPurchaseOrder(tenantId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({ where: { tenantId, id }, include: purchaseOrderInclude });
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  async createPurchaseOrder(tenantId: string, dto: CreatePurchaseOrderDto) {
    await this.assertVendor(tenantId, dto.vendorId);
    const items = this.buildItems(dto.items);
    const totalAmount = this.sumItems(items);
    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        vendorId: dto.vendorId,
        status: dto.status,
        currency: dto.currency ?? 'USD',
        note: dto.note,
        totalAmount,
        items: { create: items.map((item) => ({ tenantId, ...item })) },
      },
      include: purchaseOrderInclude,
    });
  }

  async updatePurchaseOrder(tenantId: string, id: string, dto: UpdatePurchaseOrderDto) {
    await this.assertPurchaseOrder(tenantId, id);
    if (dto.vendorId) await this.assertVendor(tenantId, dto.vendorId);
    const items = dto.items ? this.buildItems(dto.items) : undefined;
    return this.prisma.purchaseOrder.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        vendorId: dto.vendorId,
        status: dto.status,
        currency: dto.currency,
        note: dto.note,
        ...(items ? { totalAmount: this.sumItems(items), items: { deleteMany: {}, create: items.map((item) => ({ tenantId, ...item })) } } : {}),
      },
      include: purchaseOrderInclude,
    });
  }

  async removePurchaseOrder(tenantId: string, id: string) {
    await this.assertPurchaseOrder(tenantId, id);
    return this.prisma.purchaseOrder.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  // Expense categories

  async listExpenseCategories(tenantId: string) {
    return this.prisma.expenseCategory.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async createExpenseCategory(tenantId: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.upsert({
      where: { tenantId_name: { tenantId, name: dto.name.trim() } },
      update: {},
      create: { tenantId, name: dto.name.trim() },
    });
  }

  async removeExpenseCategory(tenantId: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { tenantId, id } });
    if (!category) throw new NotFoundException('Expense category not found');
    return this.prisma.expenseCategory.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  // Expenses

  async listExpenses(tenantId: string, query: ExpenseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      tenantId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total, totalAmount] = await this.prisma.$transaction([
      this.prisma.expense.findMany({ where, include: expenseInclude, orderBy: { expenseDate: 'desc' }, skip, take: query.limit }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit), totalAmount: totalAmount._sum.amount ?? 0 };
  }

  async getExpense(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { tenantId, id }, include: expenseInclude });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async createExpense(tenantId: string, dto: CreateExpenseDto) {
    await this.assertExpenseCategory(tenantId, dto.categoryId);
    if (dto.purchaseOrderId) await this.assertPurchaseOrder(tenantId, dto.purchaseOrderId);
    return this.prisma.expense.create({
      data: {
        tenantId,
        categoryId: dto.categoryId,
        purchaseOrderId: dto.purchaseOrderId,
        amount: dto.amount,
        currency: dto.currency ?? 'USD',
        description: dto.description,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
      },
      include: expenseInclude,
    });
  }

  async updateExpense(tenantId: string, id: string, dto: UpdateExpenseDto) {
    await this.assertExpense(tenantId, id);
    if (dto.categoryId) await this.assertExpenseCategory(tenantId, dto.categoryId);
    if (dto.purchaseOrderId) await this.assertPurchaseOrder(tenantId, dto.purchaseOrderId);
    return this.prisma.expense.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        categoryId: dto.categoryId,
        purchaseOrderId: dto.purchaseOrderId,
        amount: dto.amount,
        currency: dto.currency,
        description: dto.description,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
      },
      include: expenseInclude,
    });
  }

  async removeExpense(tenantId: string, id: string) {
    await this.assertExpense(tenantId, id);
    return this.prisma.expense.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  // Helpers

  private buildItems(items: CreatePurchaseOrderDto['items']) {
    return items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalAmount: (Number(item.unitPrice) * item.quantity).toFixed(2),
    }));
  }

  private sumItems(items: Array<{ totalAmount: string }>) {
    return items.reduce((sum, item) => sum + Number(item.totalAmount), 0).toFixed(2);
  }

  private async assertVendor(tenantId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  private async assertPurchaseOrder(tenantId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!order) throw new NotFoundException('Purchase order not found');
  }

  private async assertExpenseCategory(tenantId: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!category) throw new NotFoundException('Expense category not found');
  }

  private async assertExpense(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!expense) throw new NotFoundException('Expense not found');
  }
}
