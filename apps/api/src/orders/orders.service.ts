import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderQueryDto } from './dto';
import { BookOrderShipmentDto } from './shipment.dto';
import { BookShipmentRequest } from '../couriers/courier-adapter';
import { CouriersService } from '../couriers/couriers.service';

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
  customer: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couriers: CouriersService,
  ) {}

  async list(tenantId: string, query: OrderQueryDto) {
    const where = this.buildWhere(tenantId, query);
    const skip = (query.page - 1) * query.limit;
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.OrderOrderByWithRelationInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, select: orderListSelect, orderBy, skip, take: query.limit }),
      this.prisma.order.count({ where }),
    ]);
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
    return {
      id: order.id,
      tenantId: order.tenantId,
      store: order.store,
      sourceProvider: order.sourceProvider,
      externalOrderId: order.externalOrderId,
      customer: order.customer,
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
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
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

  private shippingAddress(value: Prisma.JsonValue | null): Record<string, string> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string')) as Record<string, string>
      : {};
  }

  private credentials(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private shipmentStatus(value: string): ShipmentStatus {
    return Object.values(ShipmentStatus).includes(value as ShipmentStatus) ? value as ShipmentStatus : ShipmentStatus.PENDING;
  }

  private buildWhere(tenantId: string, query: OrderQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { tenantId };
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
      where.shippingAddress = { path: ['city'], string_contains: query.city };
    }
    if (query.search) {
      where.OR = [
        { externalOrderId: { contains: query.search, mode: 'insensitive' } },
        { sourceProvider: { contains: query.search, mode: 'insensitive' } },
        { customer: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
        { customer: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { customer: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { items: { some: { name: { contains: query.search, mode: 'insensitive' } } } },
        { items: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }
    return where;
  }
}
