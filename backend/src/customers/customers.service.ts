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

const orderHistorySelect = {
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
} satisfies Prisma.OrderSelect;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: CustomerQueryDto) {
    const where = this.buildWhere(tenantId, query.search);
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const statsByPhone = await this.orderStatsByPhone(tenantId);
    const items = rows.map(({ _count, ...customer }) => {
      const phoneKey = this.phoneKey(customer.phone);
      const stats = phoneKey ? statsByPhone.get(phoneKey) : undefined;
      return { ...customer, _count: { orders: stats?.count ?? _count.orders } };
    });
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
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const phoneKey = this.phoneKey(customer.phone);
    const matchedOrderIds = phoneKey ? await this.orderIdsForPhone(tenantId, phoneKey) : [];
    const orders = await this.prisma.order.findMany({
      where: matchedOrderIds.length ? { tenantId, id: { in: matchedOrderIds } } : { tenantId, customerId: id },
      select: orderHistorySelect,
      orderBy: { createdAt: 'desc' },
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
      orders,
      spending: {
        orderCount: orders.length,
        total: orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
        currency: orders[0]?.currency ?? 'USD',
      },
      returns: orders.flatMap((order) => order.returns ?? []),
      shipments: orders.flatMap((order) => order.shipments ?? []),
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

  private phoneKey(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
  }

  private async orderIdsForPhone(tenantId: string, phoneKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT o.id FROM "Order" o
      LEFT JOIN "Customer" c ON c.id = o."customerId" AND c."tenantId" = o."tenantId"
      WHERE o."tenantId" = ${tenantId} AND o."isCourierGenerated" = false
        AND RIGHT(regexp_replace(COALESCE(NULLIF(o."shippingAddress"->>'phone', ''), c.phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneKey}
    `);
    return rows.map((row) => row.id);
  }

  private async orderStatsByPhone(tenantId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ phoneKey: string; count: bigint }>>(Prisma.sql`
      SELECT
        RIGHT(regexp_replace(COALESCE(NULLIF(o."shippingAddress"->>'phone', ''), c.phone, ''), '[^0-9]', '', 'g'), 10) AS "phoneKey",
        COUNT(*)::bigint AS count
      FROM "Order" o
      LEFT JOIN "Customer" c ON c.id = o."customerId" AND c."tenantId" = o."tenantId"
      WHERE o."tenantId" = ${tenantId} AND o."isCourierGenerated" = false
      GROUP BY 1
    `);
    const map = new Map<string, { count: number }>();
    for (const row of rows) {
      if (!row.phoneKey) continue;
      map.set(row.phoneKey, { count: Number(row.count) });
    }
    return map;
  }
}
