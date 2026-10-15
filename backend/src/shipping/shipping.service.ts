import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ReturnStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouriersService } from '../couriers/couriers.service';
import { CreateReturnDto, ShipmentQueryDto, SyncShipmentsDto, UpdateReturnStatusDto } from './dto';

const shipmentInclude = {
  courierAccount: { include: { courier: true } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  order: { select: { id: true, externalOrderId: true, sourceProvider: true, status: true, totalAmount: true, currency: true, shippingAddress: true, customer: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
  return: { include: { statusHistory: { orderBy: { createdAt: 'asc' as const } } } },
} satisfies Prisma.ShipmentInclude;

const returnInclude = {
  order: { select: { id: true, externalOrderId: true, status: true } },
  shipment: { include: { courierAccount: { include: { courier: true } } } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ReturnInclude;

const returnTransitions: Record<ReturnStatus, readonly ReturnStatus[]> = {
  RETURN_REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PICKUP', 'REJECTED'],
  PICKUP: ['SHIPMENT', 'REJECTED'],
  SHIPMENT: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['INSPECTION', 'REJECTED'],
  INSPECTION: ['REFUND', 'REPLACEMENT', 'REJECTED'],
  REFUND: [],
  REPLACEMENT: [],
  REJECTED: [],
};

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couriers: CouriersService,
  ) {}

  async listShipments(tenantId: string, query: ShipmentQueryDto) {
    const where = await this.shipmentWhere(tenantId, query);
    const skip = (query.page - 1) * query.limit;
    const [items, total, summary] = await Promise.all([
      this.prisma.shipment.findMany({ where, include: shipmentInclude, orderBy: { createdAt: 'desc' }, skip, take: query.limit }),
      this.prisma.shipment.count({ where }),
      this.summarize(tenantId),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit), summary };
  }

  async summarize(tenantId: string) {
    const [accounts, grouped] = await Promise.all([
      this.prisma.courierAccount.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { id: true, name: true, courier: { select: { code: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.shipment.groupBy({
        by: ['courierAccountId', 'status'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map<string, { total: number; byStatus: Record<string, number> }>();
    for (const row of grouped) {
      const key = row.courierAccountId ?? 'unassigned';
      const current = counts.get(key) ?? { total: 0, byStatus: {} };
      current.total += row._count._all;
      current.byStatus[row.status] = (current.byStatus[row.status] ?? 0) + row._count._all;
      counts.set(key, current);
    }
    const couriers = accounts.map((account) => ({
      accountId: account.id,
      code: account.courier.code,
      name: account.courier.name,
      accountName: account.name,
      canImport: this.couriers.canListShipments(account.courier.code),
      ...(counts.get(account.id) ?? { total: 0, byStatus: {} }),
    }));
    const unassigned = counts.get('unassigned');
    return {
      total: [...counts.values()].reduce((sum, item) => sum + item.total, 0),
      couriers,
      ...(unassigned ? { unassigned } : {}),
    };
  }

  async receiveCourierWebhook(courierCode: string, accountId: string, token: string, payload: Record<string, unknown>) {
    const account = await this.prisma.courierAccount.findFirst({
      where: { id: accountId, webhookToken: token, status: 'ACTIVE', courier: { is: { code: courierCode } } },
      select: { id: true, tenantId: true, courier: { select: { code: true } } },
    });
    if (!account) throw new NotFoundException('Courier webhook not found');
    const listing = this.couriers.parseWebhookEvent(account.courier.code, payload);
    if (!listing) return { accepted: false, reason: 'Unrecognized payload shape' };
    await this.upsertListedShipment(account.tenantId, account.id, account.courier.code, listing);
    return { accepted: true };
  }

  async syncFromCouriers(tenantId: string, dto: SyncShipmentsDto = {}) {
    const code = dto.courier?.trim().toUpperCase();
    const to = dto.dateTo ? new Date(dto.dateTo) : new Date();
    const from = dto.dateFrom ? new Date(dto.dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const accounts = await this.prisma.courierAccount.findMany({
      where: { tenantId, status: 'ACTIVE', ...(code ? { courier: { is: { code } } } : {}) },
      include: { courier: true },
    });
    const result = { imported: 0, updated: 0, skipped: 0, failed: 0, errors: [] as Array<{ courier: string; message: string }> };
    if (!accounts.length) throw new BadRequestException(code ? 'That courier is not connected' : 'Connect a courier in Integrations first');
    for (const account of accounts) {
      if (!this.couriers.canListShipments(account.courier.code)) {
        result.skipped += 1;
        continue;
      }
      try {
        const listings = await this.couriers.listRemoteShipments(
          account.courier.code,
          this.credentials(account.credentials),
          { from, to },
        );
        for (const listing of listings) {
          const created = await this.upsertListedShipment(tenantId, account.id, account.courier.code, listing);
          if (created) result.imported += 1;
          else result.updated += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Courier listing failed';
        if (message.includes('does not expose a shipment list API')) {
          result.skipped += 1;
        } else {
          result.failed += 1;
          result.errors.push({ courier: account.courier.name, message });
        }
      }
    }
    return result;
  }

  async syncAllTenants() {
    const accounts = await this.prisma.courierAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    const results: Array<{ tenantId: string; imported?: number; updated?: number; skipped?: number; failed?: number; error?: string }> = [];
    for (const { tenantId } of accounts) {
      try {
        const result = await this.syncFromCouriers(tenantId, {});
        results.push({ tenantId, ...result });
      } catch (error) {
        results.push({ tenantId, error: error instanceof Error ? error.message : 'Courier sync failed' });
      }
    }
    return results;
  }

  async getShipment(tenantId: string, id: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { tenantId, id }, include: shipmentInclude });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async trackShipment(tenantId: string, id: string) {
    const shipment = await this.getShipment(tenantId, id);
    if (!shipment.trackingNumber) throw new BadRequestException('Shipment has no tracking number');
    if (!shipment.courierAccount?.courier) throw new BadRequestException('Shipment has no courier account');

    let tracked;
    try {
      tracked = await this.couriers.trackShipment(
        shipment.courierAccount.courier.code,
        this.credentials(shipment.courierAccount.credentials),
        shipment.trackingNumber,
      );
    } catch {
      throw new BadGatewayException('Courier tracking is temporarily unavailable');
    }

    const status = this.shipmentStatus(tracked.status);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({
        where: { tenantId_id: { tenantId, id } },
        data: {
          status,
          deliveredAt: status === ShipmentStatus.DELIVERED ? new Date() : undefined,
          metadata: tracked.raw as Prisma.InputJsonValue | undefined,
        },
        include: shipmentInclude,
      });
      const knownEvents = new Set(shipment.statusHistory.map((event) => `${event.status}|${event.note ?? ''}`));
      for (const event of tracked.events ?? []) {
        const eventStatus = this.shipmentStatus(event.status);
        const key = `${eventStatus}|${event.note ?? ''}`;
        if (!knownEvents.has(key)) {
          await tx.shipmentStatusHistory.create({
            data: { tenantId, shipmentId: id, status: eventStatus, note: event.note, createdAt: event.occurredAt },
          });
        }
      }
      if (!knownEvents.has(`${status}|Courier tracking update`)) {
        await tx.shipmentStatusHistory.create({ data: { tenantId, shipmentId: id, status, note: 'Courier tracking update' } });
      }
      await this.syncOrderFromShipmentStatus(tx, tenantId, updated.orderId, id, status, shipment.courierAccount!.courier.code);
      return updated;
    });
    return result;
  }

  async listReturns(tenantId: string) {
    return this.prisma.return.findMany({ where: { tenantId }, include: returnInclude, orderBy: { createdAt: 'desc' } });
  }

  async getReturn(tenantId: string, id: string) {
    const item = await this.prisma.return.findFirst({ where: { tenantId, id }, include: returnInclude });
    if (!item) throw new NotFoundException('Return not found');
    return item;
  }

  async createReturn(tenantId: string, dto: CreateReturnDto) {
    const order = await this.prisma.order.findFirst({ where: { tenantId, id: dto.orderId }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');

    let shipmentId = dto.shipmentId;
    if (shipmentId) {
      const shipment = await this.prisma.shipment.findFirst({ where: { tenantId, id: shipmentId, orderId: dto.orderId }, select: { id: true } });
      if (!shipment) throw new NotFoundException('Shipment not found for order');
    } else {
      const shipment = await this.prisma.shipment.findFirst({ where: { tenantId, orderId: dto.orderId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      shipmentId = shipment?.id;
    }
    const created = await this.prisma.return.create({
      data: {
        tenantId,
        orderId: dto.orderId,
        shipmentId,
        reason: dto.reason,
        statusHistory: { create: { status: ReturnStatus.RETURN_REQUESTED, note: dto.reason } },
      },
      include: returnInclude,
    });
    return created;
  }

  async updateReturnStatus(tenantId: string, id: string, dto: UpdateReturnStatusDto) {
    const current = await this.prisma.return.findFirst({ where: { tenantId, id }, select: { status: true } });
    if (!current) throw new NotFoundException('Return not found');
    if (!returnTransitions[current.status].includes(dto.status)) {
      throw new BadRequestException(`Invalid return transition from ${current.status} to ${dto.status}`);
    }
    const completed = [ReturnStatus.REFUND, ReturnStatus.REPLACEMENT, ReturnStatus.REJECTED].includes(dto.status as 'REFUND' | 'REPLACEMENT' | 'REJECTED');
    return this.prisma.$transaction(async (tx) => {
      await tx.returnStatusHistory.create({
        data: { tenantId, returnId: id, status: dto.status, note: dto.resolution },
      });
      return tx.return.update({
        where: { tenantId_id: { tenantId, id } },
        data: { status: dto.status, resolution: dto.resolution, completedAt: completed ? new Date() : undefined },
        include: returnInclude,
      });
    });
  }

  private async shipmentWhere(tenantId: string, query: ShipmentQueryDto): Promise<Prisma.ShipmentWhereInput> {
    const where: Prisma.ShipmentWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.trackingNumber) where.trackingNumber = { contains: query.trackingNumber, mode: 'insensitive' };
    if (query.courier) {
      where.courierAccount = { is: { courier: { is: { code: query.courier.trim().toUpperCase() } } } };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    const orderFilter: Prisma.OrderWhereInput = {};
    if (query.city) {
      const cityMatches = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "Order" WHERE "tenantId" = ${tenantId} AND LOWER("shippingAddress"->>'city') LIKE ${'%' + query.city.trim().toLowerCase() + '%'}
      `);
      orderFilter.id = { in: cityMatches.map((match) => match.id) };
    }
    if (query.search) {
      where.OR = [
        { trackingNumber: { contains: query.search, mode: 'insensitive' } },
        { externalShipmentId: { contains: query.search, mode: 'insensitive' } },
        { order: { is: { externalOrderId: { contains: query.search, mode: 'insensitive' } } } },
        { order: { is: { customer: { is: { OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ] } } } } },
      ];
    }
    if (Object.keys(orderFilter).length) {
      where.order = { is: { ...(typeof where.order === 'object' && where.order && 'is' in where.order ? where.order.is : {}), ...orderFilter } };
    }
    return where;
  }

  private async upsertListedShipment(
    tenantId: string,
    courierAccountId: string,
    courierCode: string,
    listing: { trackingNumber: string; shipmentReference?: string; orderReference?: string; status: string; customerName?: string; customerPhone?: string; city?: string; address?: string; bookedAt?: Date; deliveredAt?: Date; raw?: Record<string, unknown> },
  ) {
    const status = this.shipmentStatus(listing.status);
    const existing = await this.prisma.shipment.findFirst({
      where: { tenantId, trackingNumber: listing.trackingNumber },
      select: { id: true, orderId: true },
    });
    // Reuse the already-linked order when we know it; only resolve-or-create
    // via the courier's order reference for a shipment we've never seen before.
    const orderId = existing?.orderId ?? await this.matchOrCreateOrder(tenantId, courierCode, listing);
    const data = {
      courierAccountId,
      externalShipmentId: listing.shipmentReference ?? listing.trackingNumber,
      trackingNumber: listing.trackingNumber,
      status,
      metadata: listing.raw as Prisma.InputJsonValue | undefined,
      shippedAt: listing.bookedAt,
      deliveredAt: status === ShipmentStatus.DELIVERED ? listing.deliveredAt ?? new Date() : listing.deliveredAt,
    };
    return this.prisma.$transaction(async (tx) => {
      let shipmentId: string;
      let created: boolean;
      if (existing) {
        await tx.shipment.update({ where: { tenantId_id: { tenantId, id: existing.id } }, data });
        shipmentId = existing.id;
        created = false;
      } else {
        const newShipment = await tx.shipment.create({ data: { tenantId, orderId, ...data } });
        await tx.shipmentStatusHistory.create({
          data: { tenantId, shipmentId: newShipment.id, status, note: `${courierCode} import` },
        });
        shipmentId = newShipment.id;
        created = true;
      }
      // The order's status now follows the courier's view of the shipment; a
      // brand-new order was just created with this same status, so this is a
      // no-op there and only matters for an order that already existed.
      await this.syncOrderFromShipmentStatus(tx, tenantId, orderId, shipmentId, status, courierCode);
      return created;
    });
  }

  private async matchOrCreateOrder(
    tenantId: string,
    courierCode: string,
    listing: { trackingNumber: string; orderReference?: string; customerName?: string; customerPhone?: string; city?: string; address?: string; status: string },
  ) {
    const reference = listing.orderReference?.trim() || listing.trackingNumber;
    const existing = await this.prisma.order.findFirst({
      where: { tenantId, OR: [{ id: reference }, { externalOrderId: reference }] },
      select: { id: true },
    });
    if (existing) return existing.id;
    const names = (listing.customerName ?? '').trim().split(/\s+/).filter(Boolean);
    const [firstName, ...rest] = names;
    const orderStatus = this.orderStatusFromShipment(listing.status);
    const created = await this.prisma.order.create({
      data: {
        tenantId,
        sourceProvider: courierCode,
        externalOrderId: reference,
        subtotalAmount: 0,
        totalAmount: 0,
        currency: 'PKR',
        status: orderStatus,
        isCourierGenerated: true,
        shippingAddress: {
          firstName: firstName || undefined,
          lastName: rest.join(' ') || undefined,
          phone: listing.customerPhone,
          addressLine1: listing.address,
          city: listing.city,
          country: 'PK',
        },
      },
      select: { id: true },
    });
    await this.prisma.orderStatusHistory.create({
      data: { tenantId, orderId: created.id, status: orderStatus, note: `${courierCode} shipment import` },
    });
    return created.id;
  }

  /**
   * Keeps the order's status in lockstep with the courier's view of the shipment:
   * once a courier status exists, it wins over whatever WooCommerce/the storefront
   * last reported. If the courier marks a shipment RETURNED, a Return record is
   * raised automatically (idempotent -- a shipment can only have one).
   */
  private async syncOrderFromShipmentStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
    shipmentId: string,
    status: ShipmentStatus,
    courierCode: string,
  ) {
    const orderStatus = this.orderStatusFromShipment(status);
    const order = await tx.order.findFirst({ where: { tenantId, id: orderId }, select: { status: true } });
    if (order && order.status !== orderStatus) {
      await tx.order.update({ where: { tenantId_id: { tenantId, id: orderId } }, data: { status: orderStatus } });
      await tx.orderStatusHistory.create({
        data: { tenantId, orderId, status: orderStatus, note: `${courierCode} status sync` },
      });
    }
    if (status === ShipmentStatus.RETURNED) {
      await tx.return.upsert({
        where: { tenantId_shipmentId: { tenantId, shipmentId } },
        update: {},
        create: {
          tenantId,
          orderId,
          shipmentId,
          reason: `${courierCode} reported this shipment as returned`,
          statusHistory: { create: { status: ReturnStatus.RETURN_REQUESTED, note: `${courierCode} status sync` } },
        },
      });
    }
  }

  private orderStatusFromShipment(status: string): OrderStatus {
    const mapped = this.shipmentStatus(status);
    if (mapped === ShipmentStatus.DELIVERED) return OrderStatus.DELIVERED;
    if (mapped === ShipmentStatus.OUT_FOR_DELIVERY) return OrderStatus.OUT_FOR_DELIVERY;
    if (mapped === ShipmentStatus.CANCELLED) return OrderStatus.CANCELLED;
    if (mapped === ShipmentStatus.RETURNED) return OrderStatus.RETURNED;
    if (mapped === ShipmentStatus.FAILED) return OrderStatus.FAILED;
    if (mapped === ShipmentStatus.PENDING) return OrderStatus.PROCESSING;
    return OrderStatus.SHIPPED;
  }

  private credentials(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private shipmentStatus(value: string): ShipmentStatus {
    return Object.values(ShipmentStatus).includes(value as ShipmentStatus) ? value as ShipmentStatus : ShipmentStatus.PENDING;
  }
}
