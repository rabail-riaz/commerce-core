import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReturnStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouriersService } from '../couriers/couriers.service';
import { CreateReturnDto, ShipmentQueryDto, UpdateReturnStatusDto } from './dto';

const shipmentInclude = {
  courierAccount: { include: { courier: true } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  order: { select: { id: true, externalOrderId: true, status: true, customer: { select: { firstName: true, lastName: true, email: true } } } },
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
    const where: Prisma.ShipmentWhereInput = { tenantId };
    if (query.status && Object.values(ShipmentStatus).includes(query.status as ShipmentStatus)) where.status = query.status as ShipmentStatus;
    if (query.trackingNumber) where.trackingNumber = { contains: query.trackingNumber, mode: 'insensitive' };
    if (query.search) {
      where.OR = [
        { trackingNumber: { contains: query.search, mode: 'insensitive' } },
        { externalShipmentId: { contains: query.search, mode: 'insensitive' } },
        { order: { is: { externalOrderId: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }
    return this.prisma.shipment.findMany({ where, include: shipmentInclude, orderBy: { createdAt: 'desc' } });
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

  private credentials(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private shipmentStatus(value: string): ShipmentStatus {
    return Object.values(ShipmentStatus).includes(value as ShipmentStatus) ? value as ShipmentStatus : ShipmentStatus.PENDING;
  }
}
