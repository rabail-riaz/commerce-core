import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BookShipmentRequest, BookShipmentResult, CancelShipmentResult, CourierCredentials, ListShipmentsRange, ListedShipment, ShipmentLabel, ShipmentStatusResult, TrackShipmentResult } from './courier-adapter';
import { CourierAdapterRegistry } from './courier-adapter.registry';
import { findPakistanCourier, PAKISTAN_COURIERS } from './pakistan-couriers';

@Injectable()
export class CouriersService {
  constructor(
    private readonly adapters: CourierAdapterRegistry,
    private readonly prisma: PrismaService,
  ) {}

  listCatalog() {
    return PAKISTAN_COURIERS.map((courier) => ({
      code: courier.code,
      name: courier.name,
      description: courier.description,
      fields: courier.fields.map((field) => ({ key: field.key, label: field.label, type: field.type, required: Boolean(field.required), placeholder: field.placeholder })),
    }));
  }

  async listForTenant(tenantId: string) {
    const accounts = await this.prisma.courierAccount.findMany({
      where: { tenantId },
      select: { id: true, name: true, status: true, courierId: true, webhookToken: true, createdAt: true, updatedAt: true, courier: { select: { code: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    for (const account of accounts) {
      if (!account.webhookToken) {
        account.webhookToken = randomBytes(24).toString('hex');
        await this.prisma.courierAccount.update({ where: { tenantId_id: { tenantId, id: account.id } }, data: { webhookToken: account.webhookToken } });
      }
    }
    const byCode = new Map(accounts.map((account) => [account.courier.code, account]));
    return this.listCatalog().map((courier) => {
      const account = byCode.get(courier.code);
      return {
        ...courier,
        account: account ? { ...account, webhookPath: `/couriers/webhooks/${courier.code.toLowerCase()}/${account.id}/${account.webhookToken}` } : null,
      };
    });
  }

  async connect(tenantId: string, code: string, credentials: CourierCredentials, accountName?: string) {
    const definition = findPakistanCourier(code);
    if (!definition) throw new NotFoundException('Courier is not available');
    for (const field of definition.fields) {
      if (field.required && !(typeof credentials[field.key] === 'string' && String(credentials[field.key]).trim())) {
        throw new BadRequestException(`${field.label} is required`);
      }
    }
    const sanitized = Object.fromEntries(
      definition.fields
        .map((field) => [field.key, typeof credentials[field.key] === 'string' ? String(credentials[field.key]).trim() : ''])
        .filter(([, value]) => value),
    );
    if (this.hasAdapter(definition.code) && this.adapters.get(definition.code).validateCredentials) {
      const health = await this.adapters.get(definition.code).validateCredentials!(sanitized);
      if (!health.valid) throw new BadRequestException(health.message);
    }
    const courier = await this.prisma.courier.upsert({
      where: { tenantId_code: { tenantId, code: definition.code } },
      create: { tenantId, code: definition.code, name: definition.name, status: 'ACTIVE' },
      update: { name: definition.name, status: 'ACTIVE' },
    });
    const name = accountName?.trim() || 'Default';
    const existing = await this.prisma.courierAccount.findFirst({ where: { tenantId, courierId: courier.id, name } });
    const account = existing
      ? await this.prisma.courierAccount.update({
        where: { tenantId_id: { tenantId, id: existing.id } },
        data: { credentials: sanitized, status: 'ACTIVE', webhookToken: existing.webhookToken ?? randomBytes(24).toString('hex') },
        select: { id: true, name: true, status: true, webhookToken: true, courier: { select: { code: true, name: true } } },
      })
      : await this.prisma.courierAccount.create({
        data: { tenantId, courierId: courier.id, name, credentials: sanitized, status: 'ACTIVE', webhookToken: randomBytes(24).toString('hex') },
        select: { id: true, name: true, status: true, webhookToken: true, courier: { select: { code: true, name: true } } },
      });
    return { connected: true, account };
  }

  async disconnect(tenantId: string, code: string) {
    const courier = await this.prisma.courier.findFirst({ where: { tenantId, code: code.trim().toUpperCase() }, select: { id: true } });
    if (!courier) throw new NotFoundException('Courier is not configured');
    await this.prisma.courierAccount.updateMany({ where: { tenantId, courierId: courier.id }, data: { status: 'DISABLED', credentials: Prisma.JsonNull } });
    return { disconnected: true };
  }

  private hasAdapter(code: string) {
    try {
      this.adapters.get(code);
      return true;
    } catch {
      return false;
    }
  }

  async validateCredentials(code: string, credentials: CourierCredentials) {
    const adapter = this.adapters.get(code);
    if (!adapter.validateCredentials) throw new Error(`Credential validation is not supported for courier: ${code}`);
    return adapter.validateCredentials(credentials);
  }

  async bookShipment(code: string, credentials: CourierCredentials, request: BookShipmentRequest): Promise<BookShipmentResult> {
    return this.adapters.get(code).bookShipment(credentials, request);
  }

  async cancelShipment(code: string, credentials: CourierCredentials, shipmentReference: string): Promise<CancelShipmentResult> {
    return this.adapters.get(code).cancelShipment(credentials, shipmentReference);
  }

  async trackShipment(code: string, credentials: CourierCredentials, trackingNumber: string): Promise<TrackShipmentResult> {
    return this.adapters.get(code).trackShipment(credentials, trackingNumber);
  }

  async getLabel(code: string, credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentLabel> {
    return this.adapters.get(code).getLabel(credentials, shipmentReference);
  }

  async getStatus(code: string, credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentStatusResult> {
    return this.adapters.get(code).getStatus(credentials, shipmentReference);
  }

  canListShipments(code: string) {
    try {
      return Boolean(this.adapters.get(code).listShipments);
    } catch {
      return false;
    }
  }

  async listRemoteShipments(code: string, credentials: CourierCredentials, range?: ListShipmentsRange): Promise<ListedShipment[]> {
    const adapter = this.adapters.get(code);
    if (!adapter.listShipments) throw new Error(`Listing shipments is not supported for courier: ${code}`);
    return adapter.listShipments(credentials, range);
  }

  parseWebhookEvent(code: string, payload: Record<string, unknown>): ListedShipment | null {
    try {
      const adapter = this.adapters.get(code);
      return adapter.parseWebhookEvent ? adapter.parseWebhookEvent(payload) : null;
    } catch {
      return null;
    }
  }
}
