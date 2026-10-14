import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderQueryDto } from './dto';
import { BookOrderShipmentDto } from './shipment.dto';
import { BookShipmentRequest } from '../couriers/courier-adapter';
import { CouriersService } from '../couriers/couriers.service';
import { computeCustomerScore } from '../scoring/scoring';

const orderListSelect = {
  id: true,
  sourceProvider: true,
  externalOrderId: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  store: { select: { id: true, name: true } },
  customer: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  shippingAddress: true,
  shipments: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: { trackingNumber: true, status: true, courierAccount: { select: { courier: { select: { name: true } } } } },
  },
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couriers: CouriersService,
  ) {}

  async list(tenantId: string, query: OrderQueryDto) {
    const where = await this.buildWhere(tenantId, query);
    const skip = (query.page - 1) * query.limit;
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.OrderOrderByWithRelationInput;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, select: orderListSelect, orderBy, skip, take: query.limit }),
      this.prisma.order.count({ where }),
    ]);
    const byPhone = await this.ordersByPhone(tenantId);
    const items = rows.map(({ shipments, customer, shippingAddress, ...order }) => {
      const phone = this.shippingAddress(shippingAddress).phone || customer?.phone?.trim() || null;
      const phoneKey = this.phoneKey(phone);
      const history = phoneKey ? byPhone.get(phoneKey) : undefined;
      return {
        ...order,
        customer,
        customerPhone: phone,
        shipment: shipments[0] ?? null,
        customerInsights: history ? this.computeInsightsFromOrders(history, order.id) : null,
      };
    });
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getById(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { tenantId, id },
      include: {
        customer: { include: { addresses: true, tags: true, score: true } },
        store: { select: { id: true, name: true, status: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, sku: true, name: true, price: true, currency: true } },
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        shipments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { courierAccount: { include: { courier: true } }, statusHistory: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const courierAccounts = await this.prisma.courierAccount.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, courier: { select: { code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    const orderPhone = this.shippingAddress(order.shippingAddress).phone || order.customer?.phone?.trim() || null;
    const phoneKey = this.phoneKey(orderPhone);
    const customerInsights = phoneKey ? this.computeInsightsFromOrders(await this.ordersForPhone(tenantId, phoneKey), order.id) : null;
    return {
      id: order.id,
      tenantId: order.tenantId,
      store: order.store,
      sourceProvider: order.sourceProvider,
      externalOrderId: order.externalOrderId,
      customer: order.customer,
      customerPhone: orderPhone,
      products: order.items,
      amount: {
        subtotal: order.subtotalAmount,
        tax: order.taxAmount,
        shipping: order.shippingAmount,
        discount: order.discountAmount,
        total: order.totalAmount,
        currency: order.currency,
      },
      payment: {
        status: order.paymentStatus,
        method: order.paymentMethod,
        reference: order.paymentReference,
      },
      address: {
        shipping: order.shippingAddress,
        billing: order.billingAddress,
      },
      status: order.status,
      timeline: order.statusHistory,
      shipment: order.shipments[0] ?? null,
      tracking: order.shipments[0]?.trackingNumber ?? null,
      shipments: order.shipments,
      courierAccounts,
      communicationHistory: [],
      customerInsights,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private phoneKey(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
  }

  private async ordersForPhone(tenantId: string, phoneKey: string) {
    return this.prisma.$queryRaw<Array<{ id: string; status: OrderStatus; createdAt: Date }>>(Prisma.sql`
      SELECT o.id, o.status, o."createdAt"
      FROM "Order" o
      LEFT JOIN "Customer" c ON c.id = o."customerId" AND c."tenantId" = o."tenantId"
      WHERE o."tenantId" = ${tenantId} AND o."isCourierGenerated" = false
        AND RIGHT(regexp_replace(COALESCE(NULLIF(o."shippingAddress"->>'phone', ''), c.phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneKey}
      ORDER BY o."createdAt" ASC
    `);
  }

  private async ordersByPhone(tenantId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: OrderStatus; createdAt: Date; phoneKey: string }>>(Prisma.sql`
      SELECT o.id, o.status, o."createdAt",
        RIGHT(regexp_replace(COALESCE(NULLIF(o."shippingAddress"->>'phone', ''), c.phone, ''), '[^0-9]', '', 'g'), 10) AS "phoneKey"
      FROM "Order" o
      LEFT JOIN "Customer" c ON c.id = o."customerId" AND c."tenantId" = o."tenantId"
      WHERE o."tenantId" = ${tenantId} AND o."isCourierGenerated" = false
      ORDER BY o."createdAt" ASC
    `);
    const byPhone = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.phoneKey) continue;
      const list = byPhone.get(row.phoneKey) ?? [];
      list.push(row);
      byPhone.set(row.phoneKey, list);
    }
    return byPhone;
  }

  private computeInsightsFromOrders(orders: Array<{ id: string; status: OrderStatus; createdAt: Date }>, currentOrderId: string) {
    const index = orders.findIndex((order) => order.id === currentOrderId);
    const isReturn = (status: OrderStatus) => status === OrderStatus.RETURNED || status === OrderStatus.RETURN_REQUESTED;
    const since = new Date(Date.now() - 90 * 86400000);
    const { score, classification } = computeCustomerScore({
      delivered: orders.filter((order) => order.status === OrderStatus.DELIVERED).length,
      returned: orders.filter((order) => isReturn(order.status)).length,
      cancelled: orders.filter((order) => order.status === OrderStatus.CANCELLED).length,
      refused: orders.filter((order) => order.status === OrderStatus.FAILED).length,
      totalOrders: orders.length,
      ordersLast90Days: orders.filter((order) => order.createdAt >= since).length,
    });
    return {
      orderNumber: index >= 0 ? index + 1 : orders.length,
      totalOrders: orders.length,
      priorReturns: orders.slice(0, index >= 0 ? index : orders.length).filter((order) => isReturn(order.status)).length,
      score,
      classification,
    };
  }

  async bookShipment(tenantId: string, orderId: string, dto: BookOrderShipmentDto) {
    const order = await this.prisma.order.findFirst({
      where: { tenantId, id: orderId },
      include: { customer: true, items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const existing = await this.prisma.shipment.findFirst({
      where: { tenantId, orderId, status: { notIn: ['CANCELLED', 'FAILED', 'RETURNED'] } },
      select: { id: true, trackingNumber: true, externalShipmentId: true, status: true },
    });
    if (existing) return existing;

    const account = await this.prisma.courierAccount.findFirst({
      where: { tenantId, id: dto.courierAccountId, status: 'ACTIVE' },
      include: { courier: true },
    });
    if (!account) throw new NotFoundException('Active courier account not found');

    const address = this.shippingAddress(order.shippingAddress);
    const recipientName = [address.firstName, address.lastName].filter(Boolean).join(' ') || [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ');
    if (!recipientName || !address.addressLine1 || !address.city || !address.country) {
      throw new BadRequestException('Order shipping address is missing required name, address, city, or country');
    }

    const request: BookShipmentRequest = {
      orderId: order.id,
      recipient: {
        name: recipientName,
        phone: address.phone ?? order.customer?.phone ?? undefined,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
      },
      package: { weight: 1, weightUnit: 'kg' },
      metadata: {
        orderAmount: Number(order.totalAmount),
        customerEmail: order.customer?.email,
        items: order.items?.length ?? undefined,
      },
    };

    const booked = await this.couriers.bookShipment(account.courier.code, this.credentials(account.credentials), request);
    const status = this.shipmentStatus(booked.status);
    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          tenantId,
          orderId,
          courierAccountId: account.id,
          externalShipmentId: booked.shipmentReference,
          trackingNumber: booked.trackingNumber,
          status,
          metadata: booked.raw as Prisma.InputJsonValue | undefined,
          shippedAt: status === ShipmentStatus.PENDING ? undefined : new Date(),
        },
        include: { statusHistory: true, courierAccount: { include: { courier: true } } },
      });
      await tx.shipmentStatusHistory.create({
        data: { tenantId, shipmentId: created.id, status, note: 'Shipment booked' },
      });
      await tx.orderStatusHistory.create({
        data: { tenantId, orderId, status: OrderStatus.SHIPPED, note: `Shipment booked${booked.trackingNumber ? `: ${booked.trackingNumber}` : ''}` },
      });
      await tx.order.update({
        where: { tenantId_id: { tenantId, id: orderId } },
        data: { status: OrderStatus.SHIPPED },
      });
      return created;
    });
    return { shipment, trackingNumber: shipment.trackingNumber };
  }

  async updateStatus(tenantId: string, id: string, status: OrderStatus, note?: string) {
    const order = await this.prisma.order.findFirst({ where: { tenantId, id }, select: { id: true, status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== status) {
      await this.prisma.$transaction([
        this.prisma.order.update({ where: { tenantId_id: { tenantId, id } }, data: { status } }),
        this.prisma.orderStatusHistory.create({
          data: { tenantId, orderId: id, status, note: note?.trim() || 'Status updated' },
        }),
      ]);
    }
    return this.getById(tenantId, id);
  }

  private shippingAddress(value: Prisma.JsonValue | null): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const item = record[key];
        if (typeof item === 'string' && item.trim()) return item;
      }
      return undefined;
    };
    return Object.fromEntries(Object.entries({
      firstName: pick('firstName', 'first_name'),
      lastName: pick('lastName', 'last_name'),
      phone: pick('phone'),
      addressLine1: pick('addressLine1', 'address_1'),
      addressLine2: pick('addressLine2', 'address_2'),
      city: pick('city'),
      state: pick('state'),
      postalCode: pick('postalCode', 'postcode'),
      country: pick('country') ?? 'PK',
    }).filter(([, item]) => Boolean(item))) as Record<string, string>;
  }

  private credentials(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private shipmentStatus(value: string): ShipmentStatus {
    return Object.values(ShipmentStatus).includes(value as ShipmentStatus) ? value as ShipmentStatus : ShipmentStatus.PENDING;
  }

  private async buildWhere(tenantId: string, query: OrderQueryDto): Promise<Prisma.OrderWhereInput> {
    const where: Prisma.OrderWhereInput = { tenantId, isCourierGenerated: false };
    if (query.status) where.status = query.status;
    if (query.storeId) where.storeId = query.storeId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    if (query.city) {
      const cityMatches = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "Order" WHERE "tenantId" = ${tenantId} AND LOWER("shippingAddress"->>'city') LIKE ${'%' + query.city.trim().toLowerCase() + '%'}
      `);
      where.id = { in: cityMatches.map((match) => match.id) };
    }
    if (query.search) {
      const searchOr: Prisma.OrderWhereInput[] = [
        { externalOrderId: { contains: query.search, mode: 'insensitive' } },
        { sourceProvider: { contains: query.search, mode: 'insensitive' } },
        { customer: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
        { customer: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { customer: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { shippingAddress: { path: ['phone'], string_contains: query.search } },
        { items: { some: { name: { contains: query.search, mode: 'insensitive' } } } },
        { items: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
      ];
      const digits = query.search.replace(/\D/g, '');
      if (digits.length >= 4) {
        const phoneKey = digits.slice(-10);
        const matches = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT o.id FROM "Order" o
          LEFT JOIN "Customer" c ON c.id = o."customerId" AND c."tenantId" = o."tenantId"
          WHERE o."tenantId" = ${tenantId}
            AND RIGHT(regexp_replace(COALESCE(NULLIF(o."shippingAddress"->>'phone', ''), c.phone, ''), '[^0-9]', '', 'g'), 10) LIKE ${'%' + phoneKey}
        `);
        if (matches.length) searchOr.push({ id: { in: matches.map((match) => match.id) } });
      }
      where.OR = searchOr;
    }
    return where;
  }
}
