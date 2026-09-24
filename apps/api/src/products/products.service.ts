import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto';

const productInclude = {
  store: { select: { id: true, name: true, status: true } },
  variants: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { variants: true, orderItems: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ProductQueryDto) {
    const where = this.buildWhere(tenantId, query.search);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      this.prisma.product.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getById(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { tenantId, id }, include: productInclude });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto) {
    await this.assertStore(tenantId, dto.storeId);
    return this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        status: dto.status,
        storeId: dto.storeId,
        variants: dto.variants?.length ? { create: dto.variants.map((variant) => ({ tenantId, sku: variant.sku, name: variant.name, price: variant.price, currency: variant.currency ?? 'USD' })) } : undefined,
      },
      include: productInclude,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.assertProduct(tenantId, id);
    await this.assertStore(tenantId, dto.storeId);
    return this.prisma.product.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        storeId: dto.storeId,
        ...(dto.variants ? { variants: { deleteMany: {}, create: dto.variants.map((variant) => ({ tenantId, sku: variant.sku, name: variant.name, price: variant.price, currency: variant.currency ?? 'USD' })) } } : {}),
      },
      include: productInclude,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.assertProduct(tenantId, id);
    return this.prisma.product.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  private buildWhere(tenantId: string, search?: string): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { store: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
        { variants: { some: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    return where;
  }

  private async assertStore(tenantId: string, storeId?: string) {
    if (!storeId) return;
    const store = await this.prisma.store.findFirst({ where: { tenantId, id: storeId }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');
  }

  private async assertProduct(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
  }
}
