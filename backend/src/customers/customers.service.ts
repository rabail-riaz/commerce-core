import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerQueryDto } from './dto';

const customerSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { id: true, name: true } },
  score: { select: { score: true } },
  _count: { select: { orders: true } },
} satisfies Prisma.CustomerSelect;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: CustomerQueryDto) {
    const where = this.buildWhere(tenantId, query.search);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getById(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId, id },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        tags: { orderBy: { name: 'asc' } },
        score: true,
        notes: { orderBy: { createdAt: 'desc' } },
        tickets: { orderBy: { createdAt: 'desc' }, take: 20 },
        emailThreads: { orderBy: { lastMessageAt: 'desc' }, take: 20, select: { id: true, subject: true, lastMessageAt: true, unreadCount: true } },
        whatsappConversations: { orderBy: { lastMessageAt: 'desc' }, take: 20, select: { id: true, customerPhone: true, lastMessageAt: true, unreadCount: true } },
        orders: {
          where: { tenantId },
          select: {
            id: true,
            externalOrderId: true,
            sourceProvider: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
            shipments: { select: { id: true, trackingNumber: true, status: true, createdAt: true } },
            returns: { select: { id: true, status: true, reason: true, createdAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const spending = await this.prisma.order.aggregate({
      where: { tenantId, customerId: id },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });

    return {
      id: customer.id,
      profile: {
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      orders: customer.orders,
      spending: { orderCount: spending._count._all, total: spending._sum.totalAmount ?? 0, currency: customer.orders[0]?.currency ?? 'USD' },
      returns: customer.orders.flatMap((order) => order.returns ?? []),
      shipments: customer.orders.flatMap((order) => order.shipments ?? []),
      tickets: customer.tickets ?? [],
      whatsapp: customer.whatsappConversations ?? [],
      email: customer.emailThreads ?? [],
      tags: customer.tags,
      notes: customer.notes ?? [],
      score: customer.score,
      addresses: customer.addresses,
    };
  }

  private buildWhere(tenantId: string, search?: string): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { tenantId };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { orders: { some: { tenantId, externalOrderId: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    return where;
  }
}
