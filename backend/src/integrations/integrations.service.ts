import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, OrderStatus, PaymentStatus, ProductStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/pagination.dto';
import { IntegrationEncryptionService } from './integration-encryption.service';
import { IntegrationAdapterRegistry } from './integration-adapter.registry';
import { IntegrationAdapter, IntegrationCredentials } from './integration-adapter';
import { CreateIntegrationDto } from './dto';
import { QueueFoundationService } from '../queues/queue-foundation.service';
import { PAKISTAN_COURIERS } from '../couriers/pakistan-couriers';

type SyncCounts = {
  recordsSynced: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsMissing: number;
  recordsDiverged: number;
};

type OrderSyncFields = {
  customerId?: string;
  subtotalAmount?: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  shippingAddress?: Prisma.InputJsonValue;
  billingAddress?: Prisma.InputJsonValue;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: IntegrationEncryptionService,
    private readonly adapters: IntegrationAdapterRegistry,
    private readonly queues?: QueueFoundationService,
  ) {}

  async create(tenantId: string, dto: CreateIntegrationDto) {
    const storeId = dto.storeId
      ? (await this.prisma.store.findFirst({ where: { tenantId, id: dto.storeId }, select: { id: true } }))?.id
      : (await this.prisma.store.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    if (dto.storeId && !storeId) throw new BadRequestException('Store not found');
    return this.prisma.integration.create({
      data: { tenantId, provider: dto.provider, storeId },
      select: { id: true, provider: true, status: true, storeId: true, settings: true, lastSyncedAt: true, lastError: true, createdAt: true, updatedAt: true },
    });
  }

  async list(tenantId: string, pagination: PaginationDto) {
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.integration.findMany({ where: { tenantId }, select: { id: true, provider: true, status: true, storeId: true, settings: true, lastSyncedAt: true, lastError: true, createdAt: true, updatedAt: true, store: { select: { id: true, name: true, status: true } } }, orderBy: { createdAt: 'desc' }, skip, take: pagination.limit }),
      this.prisma.integration.count({ where: { tenantId } }),
    ]);
    return { items, page: pagination.page, limit: pagination.limit, total };
  }

  async overview(tenantId: string) {
    const [sites, courierAccounts, emailConnected, whatsappConnected] = await Promise.all([
      this.prisma.integration.findMany({
        where: { tenantId },
        select: { id: true, provider: true, status: true, lastSyncedAt: true, lastError: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.courierAccount.findMany({
        where: { tenantId },
        select: { id: true, status: true, courier: { select: { code: true, name: true } } },
      }),
      this.prisma.emailAccount.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.whatsAppAccount.count({ where: { tenantId, status: 'ACTIVE' } }),
    ]);
    return {
      website: {
        connected: sites.filter((item) => item.status === 'ACTIVE').length,
        items: sites,
      },
      courier: {
        connected: courierAccounts.filter((item) => item.status === 'ACTIVE').length,
        total: PAKISTAN_COURIERS.length,
        items: courierAccounts,
      },
      email: { connected: emailConnected },
      whatsapp: { connected: whatsappConnected },
    };
  }

  async getById(tenantId: string, id: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id },
      select: {
        id: true, provider: true, status: true, storeId: true, settings: true, lastSyncedAt: true, lastError: true, createdAt: true, updatedAt: true,
        store: { select: { id: true, name: true, status: true } },
        syncLogs: { orderBy: { startedAt: 'desc' }, take: 20 },
      },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  async listSyncLogs(tenantId: string, integrationId: string, pagination: PaginationDto) {
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, id: integrationId }, select: { id: true } });
    if (!integration) throw new NotFoundException('Integration not found');
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.integrationSyncLog.findMany({ where: { tenantId, integrationId }, orderBy: { startedAt: 'desc' }, skip, take: pagination.limit }),
      this.prisma.integrationSyncLog.count({ where: { tenantId, integrationId } }),
    ]);
    return { items, page: pagination.page, limit: pagination.limit, total };
  }

  async saveCredentials(tenantId: string, integrationId: string, credentials: Record<string, unknown>) {
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, id: integrationId }, select: { id: true, provider: true } });
    if (!integration) throw new NotFoundException('Integration not found');
    const health = await this.checkHealth(integration.provider, credentials);
    if (!health.healthy) {
      await this.prisma.integration.update({ where: { id: integration.id }, data: { status: 'ERROR', lastError: health.message } });
      throw new BadRequestException(health.message);
    }
    const ciphertext = this.encryption.encrypt(JSON.stringify(credentials));
    await this.prisma.integrationCredential.upsert({
      where: { tenantId_integrationId: { tenantId, integrationId } },
      create: { tenantId, integrationId, ciphertext, keyVersion: 1 },
      update: { ciphertext, keyVersion: 1 },
    });
    await this.prisma.integration.update({ where: { id: integration.id }, data: { status: 'ACTIVE', lastError: null } });
    return { saved: true, health: { healthy: true, message: health.message, checkedAt: health.checkedAt } };
  }

  async testConnection(tenantId: string, integrationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id: integrationId },
      select: { id: true, provider: true, credential: { select: { ciphertext: true } } },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    if (!integration.credential) throw new BadRequestException('Integration credentials have not been configured');

    let credentials: IntegrationCredentials;
    try {
      credentials = JSON.parse(this.encryption.decrypt(integration.credential.ciphertext)) as IntegrationCredentials;
    } catch {
      await this.prisma.integration.update({ where: { id: integration.id }, data: { status: 'ERROR', lastError: 'Stored integration credentials could not be read' } });
      throw new BadRequestException('Stored integration credentials could not be read');
    }
    const health = await this.checkHealth(integration.provider, credentials);
    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { status: health.healthy ? 'ACTIVE' : 'ERROR', lastError: health.healthy ? null : health.message },
    });
    return { provider: integration.provider, ...health };
  }

  async receiveWooCommerceWebhook(
    integrationId: string,
    eventType: string,
    externalEventId: string | undefined,
    signature: string | undefined,
    rawBody: Buffer,
    payload: Record<string, unknown>,
  ) {
    const integration = await this.prisma.integration.findFirst({
      where: { id: integrationId, provider: 'WOOCOMMERCE' },
      select: { id: true, tenantId: true, provider: true, credential: { select: { ciphertext: true } } },
    });
    if (!integration || !integration.credential) throw new NotFoundException('Integration webhook not found');

    let credentials: IntegrationCredentials;
    try {
      credentials = JSON.parse(this.encryption.decrypt(integration.credential.ciphertext)) as IntegrationCredentials;
    } catch {
      throw new BadRequestException('Integration webhook is not configured');
    }
    const adapter = this.adapters.get(integration.provider);
    const webhookSecret = typeof credentials.webhookSecret === 'string' ? credentials.webhookSecret : credentials.secret;
    if (!signature || !adapter.verifyWebhookSignature || typeof webhookSecret !== 'string' || !adapter.verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const eventId = externalEventId || this.webhookEventId(rawBody, eventType);
    let event = await this.prisma.webhookEvent.findFirst({
      where: { tenantId: integration.tenantId, provider: integration.provider, externalId: eventId },
    });
    let duplicate = Boolean(event);
    if (!event) {
      try {
        event = await this.prisma.webhookEvent.create({
          data: {
            tenantId: integration.tenantId,
            integrationId: integration.id,
            provider: integration.provider,
            externalId: eventId,
            eventType,
            payload: payload as Prisma.InputJsonValue,
          },
        });
        duplicate = false;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        event = await this.prisma.webhookEvent.findFirstOrThrow({
          where: { tenantId: integration.tenantId, provider: integration.provider, externalId: eventId },
        });
        duplicate = true;
      }
    }
    if (event.processedAt) return { accepted: true, duplicate: true, processed: true, eventId: event.id };
    if (!this.queues) {
      try {
        await this.processWooCommerceEvent(integration.tenantId, integration.id, eventType, payload);
        await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), errorMessage: null } });
        return { accepted: true, duplicate, processed: true, eventId: event.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook processing failed';
        await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { errorMessage: message } });
        throw new BadRequestException('Webhook processing failed');
      }
    }
    const job = await this.queues.webhookProcessing.add('process-webhook', {
      eventId: event.id,
      integrationId: integration.id,
      eventType,
      rawBody: rawBody.toString('base64'),
      payload,
    }, { jobId: event.id });
    return { accepted: true, duplicate, processed: false, queued: true, eventId: event.id, jobId: job.id };
  }

  async processWebhookJob(data: { eventId: string; integrationId: string; eventType: string; rawBody: string; payload: Record<string, unknown> }) {
    const integration = await this.prisma.integration.findFirst({
      where: { id: data.integrationId, provider: 'WOOCOMMERCE' },
      select: { id: true, tenantId: true },
    });
    if (!integration) throw new Error('Integration webhook not found');
    try {
      await this.processWooCommerceEvent(integration.tenantId, integration.id, data.eventType, data.payload);
      await this.prisma.webhookEvent.update({ where: { id: data.eventId }, data: { processedAt: new Date(), errorMessage: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      await this.prisma.webhookEvent.update({ where: { id: data.eventId }, data: { errorMessage: message } });
      throw error;
    }
  }

  async getSyncJobStatus(tenantId: string, integrationId: string, jobId: string) {
    if (!this.queues) throw new Error('Queue foundation is not available');
    const log = await this.prisma.integrationSyncLog.findFirst({
      where: { tenantId, integrationId, id: jobId },
      select: { id: true, status: true, errorMessage: true },
    });
    if (!log) throw new NotFoundException('Sync job not found');
    const job = await this.queues.integrationSync.getJob(jobId);
    if (!job) return { jobId, status: log.status === 'SUCCEEDED' ? 'completed' : log.status.toLowerCase(), attemptsMade: null, failedReason: log.errorMessage ?? null };
    return {
      jobId,
      status: await job.getState(),
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failedReason: job.failedReason ?? log.errorMessage ?? null,
    };
  }

  private async processWooCommerceEvent(tenantId: string, integrationId: string, eventType: string, payload: Record<string, unknown>) {
    const resource = eventType.split('.')[0]?.toLowerCase();
    if (resource === 'customer') {
      await this.upsertWebhookCustomer(tenantId, payload);
      return;
    }
    if (resource === 'product') {
      await this.upsertWebhookProduct(tenantId, integrationId, payload);
      return;
    }
    if (resource === 'order') {
      await this.upsertWebhookOrder(tenantId, integrationId, payload);
      return;
    }
    throw new Error(`Unsupported WooCommerce webhook event: ${eventType}`);
  }

  private async upsertWebhookCustomer(tenantId: string, customer: Record<string, unknown>) {
    const externalCustomerId = this.numberId(customer.id);
    if (!externalCustomerId) throw new Error('Webhook customer is missing an external ID');
    const billing = this.objectValue(customer.billing);
    await this.prisma.customer.upsert({
      where: { tenantId_externalCustomerId: { tenantId, externalCustomerId } },
      create: { tenantId, externalCustomerId, email: this.stringValue(customer.email), firstName: this.stringValue(customer.first_name), lastName: this.stringValue(customer.last_name), phone: this.stringValue(billing?.phone) },
      update: { email: this.stringValue(customer.email), firstName: this.stringValue(customer.first_name), lastName: this.stringValue(customer.last_name), phone: this.stringValue(billing?.phone) },
    });
  }

  private async syncProductCatalog(
    tenantId: string,
    provider: string,
    adapter: IntegrationAdapter,
    credentials: IntegrationCredentials,
    storeId: string | undefined,
  ): Promise<number> {
    let synced = 0;
    const products = (await this.fetchAll(adapter, credentials, 'products')).map((item) => this.asProduct(provider, item));
    for (const product of products) {
      const externalProductId = this.numberId(product.id);
      if (!externalProductId) continue;
      const saved = await this.prisma.product.upsert({
        where: { tenantId_externalProductId: { tenantId, externalProductId } },
        create: {
          tenantId,
          storeId,
          externalProductId,
          name: this.stringValue(product.name) ?? `Product ${externalProductId}`,
          description: this.stringValue(product.description) ?? this.stringValue(product.short_description),
          ...this.productFields(product),
          ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}),
        },
        update: {
          name: this.stringValue(product.name) ?? `Product ${externalProductId}`,
          description: this.stringValue(product.description) ?? this.stringValue(product.short_description),
          ...this.productFields(product),
          ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}),
        },
        select: { id: true },
      });
      synced++;

      const rawVariations = Array.isArray(product.variations) ? product.variations : [];
      const embeddedVariations = rawVariations.filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);
      const variations = embeddedVariations.length === rawVariations.length && rawVariations.length > 0
        ? embeddedVariations
        : await this.fetchAll(adapter, credentials, `products/${externalProductId}/variations`);
      for (const variation of variations) {
        if (await this.upsertWooVariant(tenantId, saved.id, variation)) synced++;
      }
    }
    return synced;
  }

  async syncProductsNow(tenantId: string, integrationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id: integrationId },
      select: { id: true, provider: true, storeId: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    const credential = await this.prisma.integrationCredential.findFirst({
      where: { tenantId, integrationId },
      select: { ciphertext: true },
    });
    if (!credential) throw new BadRequestException('Integration credentials have not been configured');
    const credentials = JSON.parse(this.encryption.decrypt(credential.ciphertext)) as IntegrationCredentials;
    const adapter = this.adapters.get(integration.provider);
    if (!adapter.fetchCollection) throw new BadRequestException(`Product sync is not supported for ${integration.provider}`);
    const storeId = await this.integrationStoreId(tenantId, integrationId);
    const synced = await this.syncProductCatalog(tenantId, integration.provider, adapter, credentials, storeId);
    return { synced };
  }

  private async upsertWebhookProduct(tenantId: string, integrationId: string, product: Record<string, unknown>) {
    const externalProductId = this.numberId(product.id);
    if (!externalProductId) throw new Error('Webhook product is missing an external ID');
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, id: integrationId }, select: { storeId: true } });
    const saved = await this.prisma.product.upsert({
      where: { tenantId_externalProductId: { tenantId, externalProductId } },
      create: { tenantId, storeId: integration?.storeId, externalProductId, name: this.stringValue(product.name) ?? `Product ${externalProductId}`, description: this.stringValue(product.description), ...this.productFields(product), ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}) },
      update: { name: this.stringValue(product.name) ?? `Product ${externalProductId}`, description: this.stringValue(product.description), ...this.productFields(product), ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}) },
      select: { id: true },
    });
    const variations = Array.isArray(product.variations) ? product.variations : [];
    for (const value of variations) {
      if (typeof value !== 'object' || value === null) continue;
      const variation = value as Record<string, unknown>;
      const externalVariantId = this.numberId(variation.id);
      if (!externalVariantId) continue;
      await this.upsertWooVariant(tenantId, saved.id, variation);
    }
  }

  private async upsertWebhookOrder(tenantId: string, integrationId: string, order: Record<string, unknown>) {
    await this.upsertCommerceOrder(tenantId, integrationId, 'WOOCOMMERCE', order);
  }

  private webhookEventId(rawBody: Buffer, eventType: string) {
    return createHash('sha256').update(eventType).update(':').update(rawBody).digest('hex');
  }

  async startInitialSync(tenantId: string, integrationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id: integrationId },
      select: { id: true, provider: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    const running = await this.prisma.integrationSyncLog.findFirst({
      where: { tenantId, integrationId, status: 'RUNNING' },
      select: { id: true, status: true, startedAt: true },
    });
    if (running) return { started: false, queued: false, completed: false, syncLogId: running.id, status: running.status, startedAt: running.startedAt };

    const log = await this.prisma.integrationSyncLog.create({
      data: { tenantId, integrationId, status: 'RUNNING', syncType: 'MANUAL' },
      select: { id: true, status: true, startedAt: true },
    });
    if (this.queues) {
      const job = await this.queues.integrationSync.add('initial-sync', { tenantId, integrationId, provider: integration.provider, syncLogId: log.id }, { jobId: log.id });
      return { started: true, queued: true, completed: false, syncLogId: log.id, jobId: job.id, status: log.status, startedAt: log.startedAt };
    }
    try {
      const counts = await this.executeInitialSync(tenantId, integrationId, integration.provider, log.id, true);
      return { started: true, queued: false, completed: true, syncLogId: log.id, status: 'SUCCEEDED', startedAt: log.startedAt, ...counts };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Initial synchronization failed');
    }
  }

  async processInitialSyncJob(data: { tenantId: string; integrationId: string; provider: string; syncLogId: string }, attemptsMade = 0, maxAttempts = 1) {
    return this.executeInitialSync(data.tenantId, data.integrationId, data.provider, data.syncLogId, attemptsMade + 1 >= maxAttempts);
  }

  private async executeInitialSync(tenantId: string, integrationId: string, provider: string, syncLogId: string, finalAttempt: boolean) {
    const counts: SyncCounts = { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0, recordsMissing: 0, recordsDiverged: 0 };
    try {
      const credential = await this.prisma.integrationCredential.findFirst({
        where: { tenantId, integrationId },
        select: { ciphertext: true },
      });
      if (!credential) throw new Error('Integration credentials have not been configured');

      const credentials = JSON.parse(this.encryption.decrypt(credential.ciphertext)) as IntegrationCredentials;
      const adapter = this.adapters.get(provider);
      if (!adapter.fetchCollection) throw new Error(`Initial synchronization is not supported for ${provider}`);
      const storeId = await this.integrationStoreId(tenantId, integrationId);

      const customers = (await this.fetchAll(adapter, credentials, 'customers')).map((item) => this.asCustomer(provider, item));
      const customerIds = new Map<string, string>();
      for (const customer of customers) {
        const externalCustomerId = this.numberId(customer.id);
        if (!externalCustomerId) continue;
        const saved = await this.prisma.customer.upsert({
          where: { tenantId_externalCustomerId: { tenantId, externalCustomerId } },
          create: {
            tenantId,
            externalCustomerId,
            email: this.stringValue(customer.email),
            firstName: this.stringValue(customer.first_name),
            lastName: this.stringValue(customer.last_name),
            phone: this.stringValue(customer.billing && typeof customer.billing === 'object' ? (customer.billing as Record<string, unknown>).phone : undefined),
          },
          update: {
            email: this.stringValue(customer.email),
            firstName: this.stringValue(customer.first_name),
            lastName: this.stringValue(customer.last_name),
            phone: this.stringValue(customer.billing && typeof customer.billing === 'object' ? (customer.billing as Record<string, unknown>).phone : undefined),
          },
          select: { id: true },
        });
        customerIds.set(externalCustomerId, saved.id);
        counts.recordsSynced++;
      }

      counts.recordsSynced += await this.syncProductCatalog(tenantId, provider, adapter, credentials, storeId);

      const orders = (await this.fetchAll(adapter, credentials, 'orders')).map((item) => this.asOrder(provider, item));
      for (const order of orders) {
        const externalOrderId = this.numberId(order.id);
        if (!externalOrderId) continue;
        const existing = await this.prisma.order.findUnique({
          where: { tenantId_sourceProvider_externalOrderId: { tenantId, sourceProvider: provider.toUpperCase(), externalOrderId } },
          select: { id: true },
        });
        await this.upsertCommerceOrder(tenantId, integrationId, provider, order, customerIds);
        counts.recordsSynced++;
        if (existing) counts.recordsUpdated++;
        else counts.recordsCreated++;
      }

      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.integrationSyncLog.update({ where: { id: syncLogId }, data: { status: 'SUCCEEDED', completedAt, ...counts } }),
        this.prisma.integration.update({ where: { id: integrationId }, data: { status: 'ACTIVE', lastSyncedAt: completedAt, lastError: null } }),
      ]);
      return counts;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Initial synchronization failed';
      if (finalAttempt) {
        await this.prisma.$transaction([
          this.prisma.integrationSyncLog.update({ where: { id: syncLogId }, data: { status: 'FAILED', completedAt: new Date(), ...counts, errorMessage: message } }),
          this.prisma.integration.update({ where: { id: integrationId }, data: { status: 'ERROR', lastError: message } }),
        ]);
      }
      throw error;
    }
  }

  async startReconciliation(tenantId: string, integrationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id: integrationId },
      select: { id: true, provider: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    const running = await this.prisma.integrationSyncLog.findFirst({
      where: { tenantId, integrationId, status: 'RUNNING' },
      select: { id: true, status: true, startedAt: true },
    });
    if (running) return { started: false, queued: false, completed: false, syncLogId: running.id, status: running.status, startedAt: running.startedAt, syncType: 'RECONCILIATION' };
    const log = await this.prisma.integrationSyncLog.create({
      data: { tenantId, integrationId, status: 'RUNNING', syncType: 'RECONCILIATION' },
      select: { id: true, status: true, startedAt: true },
    });
    if (this.queues) {
      const job = await this.queues.integrationSync.add('reconcile-store', {
        tenantId, integrationId, provider: integration.provider, syncLogId: log.id,
      }, { jobId: log.id });
      return { started: true, queued: true, completed: false, syncLogId: log.id, jobId: job.id, status: log.status, startedAt: log.startedAt, syncType: 'RECONCILIATION' };
    }
    try {
      const counts = await this.reconcileStoreJob({ tenantId, integrationId, provider: integration.provider, syncLogId: log.id }, 0, 1);
      return { started: true, queued: false, completed: true, syncLogId: log.id, status: 'SUCCEEDED', startedAt: log.startedAt, syncType: 'RECONCILIATION', ...counts };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Reconciliation failed');
    }
  }

  async reconcileStoreJob(data: { tenantId: string; integrationId: string; provider: string; syncLogId: string }, attemptsMade = 0, maxAttempts = 1) {
    const finalAttempt = attemptsMade + 1 >= maxAttempts;
    const counts: SyncCounts = { recordsSynced: 0, recordsCreated: 0, recordsUpdated: 0, recordsMissing: 0, recordsDiverged: 0 };
    try {
      const credential = await this.prisma.integrationCredential.findFirst({ where: { tenantId: data.tenantId, integrationId: data.integrationId }, select: { ciphertext: true } });
      if (!credential) throw new Error('Integration credentials have not been configured');
      const credentials = JSON.parse(this.encryption.decrypt(credential.ciphertext)) as IntegrationCredentials;
      const adapter = this.adapters.get(data.provider);
      if (!adapter.fetchCollection) throw new Error(`Reconciliation is not supported for ${data.provider}`);
      const storeId = await this.integrationStoreId(data.tenantId, data.integrationId);
      const [customers, products, orders] = await Promise.all([
        this.fetchAll(adapter, credentials, 'customers'),
        this.fetchAll(adapter, credentials, 'products'),
        this.fetchAll(adapter, credentials, 'orders'),
      ]);
      const [localCustomers, localProducts, localOrders] = await Promise.all([
        this.prisma.customer.findMany({ where: { tenantId: data.tenantId }, select: { externalCustomerId: true, email: true, firstName: true, lastName: true, phone: true } }),
        this.prisma.product.findMany({ where: { tenantId: data.tenantId, ...(storeId ? { storeId } : {}) }, select: { externalProductId: true, name: true, description: true, status: true } }),
        this.prisma.order.findMany({ where: { tenantId: data.tenantId, sourceProvider: data.provider, ...(storeId ? { storeId } : {}) }, select: { externalOrderId: true, totalAmount: true, currency: true, status: true } }),
      ]);
      counts.recordsMissing += this.countMissing(customers, localCustomers, 'id', 'externalCustomerId');
      counts.recordsMissing += this.countMissing(products, localProducts, 'id', 'externalProductId');
      counts.recordsMissing += this.countMissing(orders, localOrders, 'id', 'externalOrderId');
      counts.recordsDiverged += this.countCustomerDivergence(customers, localCustomers);
      counts.recordsDiverged += this.countProductDivergence(products, localProducts);
      counts.recordsDiverged += this.countOrderDivergence(orders, localOrders);
      counts.recordsSynced = customers.length + products.length + orders.length;
      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.integrationSyncLog.update({ where: { id: data.syncLogId }, data: { status: 'SUCCEEDED', completedAt, ...counts } }),
        this.prisma.integration.update({ where: { id: data.integrationId }, data: { lastSyncedAt: completedAt, lastError: null } }),
      ]);
      return counts;
    } catch (error) {
      if (finalAttempt) {
        const message = error instanceof Error ? error.message : 'Reconciliation failed';
        await this.prisma.$transaction([
          this.prisma.integrationSyncLog.update({ where: { id: data.syncLogId }, data: { status: 'FAILED', completedAt: new Date(), ...counts, errorMessage: message } }),
          this.prisma.integration.update({ where: { id: data.integrationId }, data: { status: 'ERROR', lastError: message } }),
        ]);
      }
      throw error;
    }
  }

  async reconcileActiveIntegrations() {
    const integrations = await this.prisma.integration.findMany({ where: { status: 'ACTIVE' }, select: { tenantId: true, id: true } });
    return Promise.all(integrations.map(({ tenantId, id }) => this.startReconciliation(tenantId, id)));
  }

  private countMissing(remote: Record<string, unknown>[], local: Array<Record<string, unknown>>, remoteId: string, localId: string) {
    const localIds = new Set(local
      .map((record) => this.numberId(record[localId]))
      .filter((id): id is string => Boolean(id)));
    return remote.filter((record) => {
      const remoteRecordId = this.numberId(record[remoteId]);
      return Boolean(remoteRecordId) && !localIds.has(remoteRecordId as string);
    }).length;
  }

  private countCustomerDivergence(remote: Record<string, unknown>[], local: Array<Record<string, unknown>>) {
    const byId = new Map(local.map((record) => [record.externalCustomerId, record]));
    return remote.filter((record) => {
      const saved = byId.get(this.numberId(record.id));
      return saved && (saved.email !== this.stringValue(record.email) || saved.firstName !== this.stringValue(record.first_name) || saved.lastName !== this.stringValue(record.last_name));
    }).length;
  }

  private countProductDivergence(remote: Record<string, unknown>[], local: Array<Record<string, unknown>>) {
    const byId = new Map(local.map((record) => [record.externalProductId, record]));
    return remote.filter((record) => {
      const saved = byId.get(this.numberId(record.id));
      return saved && (saved.name !== this.stringValue(record.name) || saved.description !== this.stringValue(record.description));
    }).length;
  }

  private countOrderDivergence(remote: Record<string, unknown>[], local: Array<Record<string, unknown>>) {
    const byId = new Map(local.map((record) => [record.externalOrderId, record]));
    return remote.filter((record) => {
      const saved = byId.get(this.numberId(record.id));
      return saved && (String(saved.totalAmount) !== String(this.decimalValue(record.total)) || saved.currency !== this.stringValue(record.currency));
    }).length;
  }

  private async fetchAll(adapter: IntegrationAdapter, credentials: IntegrationCredentials, resource: string) {
    if (!adapter.fetchCollection) throw new Error(`Initial synchronization is not supported for ${adapter.provider}`);
    const items: Record<string, unknown>[] = [];
    let page = 1;
    do {
      const result = await adapter.fetchCollection(credentials, resource, page, 100);
      items.push(...result.items);
      page++;
      if (!result.hasMore) break;
      if (page > 10_000) throw new Error(`WooCommerce pagination limit exceeded while fetching ${resource}`);
    } while (true);
    return items;
  }

  private async integrationStoreId(tenantId: string, integrationId: string) {
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, id: integrationId }, select: { storeId: true } });
    return integration?.storeId ?? undefined;
  }

  private numberId(value: unknown) {
    if (value === 0 || value === '0') return undefined;
    return typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;
  }

  private asCustomer(provider: string, customer: Record<string, unknown>) {
    if (provider.toUpperCase() !== 'SHOPIFY') return customer;
    return {
      ...customer,
      first_name: customer.first_name,
      last_name: customer.last_name,
      billing: { phone: this.stringValue(customer.phone) },
    };
  }

  private asProduct(provider: string, product: Record<string, unknown>) {
    if (provider.toUpperCase() !== 'SHOPIFY') return product;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const embeddedVariants = variants.filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);
    const firstVariant = embeddedVariants[0];
    const image = this.objectValue(product.image);
    return {
      ...product,
      name: this.stringValue(product.title) ?? this.stringValue(product.name),
      description: this.stringValue(product.body_html) ?? this.stringValue(product.description),
      status: product.status === 'active' ? 'publish' : product.status,
      image_src: this.stringValue(image?.src),
      sku: firstVariant?.sku,
      price: firstVariant?.price,
      stock_quantity: firstVariant?.inventory_quantity,
      stock_status: typeof firstVariant?.inventory_quantity === 'number' ? (firstVariant.inventory_quantity > 0 ? 'instock' : 'outofstock') : undefined,
      variations: embeddedVariants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.title,
        price: variant.price,
        currency: this.stringValue(product.currency) ?? 'USD',
      })),
    };
  }

  private asOrder(provider: string, order: Record<string, unknown>): Record<string, unknown> {
    if (provider.toUpperCase() !== 'SHOPIFY') return order;
    const customer = this.objectValue(order.customer);
    const shippingLines = Array.isArray(order.shipping_lines) ? order.shipping_lines : [];
    const shippingTotal = shippingLines.reduce((sum, line) => {
      const record = typeof line === 'object' && line !== null ? line as Record<string, unknown> : {};
      return sum + this.decimalValue(record.price);
    }, 0);
    const billing = this.objectValue(order.billing_address) ?? this.objectValue(order.billing);
    const shipping = this.objectValue(order.shipping_address) ?? this.objectValue(order.shipping);
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const gateways = Array.isArray(order.payment_gateway_names) ? order.payment_gateway_names : [];
    return {
      ...order,
      customer_id: customer?.id ?? order.customer_id,
      email: this.stringValue(order.email) ?? this.stringValue(customer?.email),
      status: this.shopifyOrderStatus(order),
      total: order.total_price ?? order.total,
      total_tax: order.total_tax,
      shipping_total: shippingTotal || order.shipping_total,
      discount_total: order.total_discounts ?? order.discount_total,
      payment_method_title: typeof gateways[0] === 'string' ? gateways[0] : order.payment_method_title,
      date_created: order.created_at ?? order.date_created,
      date_paid: this.stringValue(order.financial_status) === 'paid' ? (order.processed_at ?? order.created_at) : order.date_paid,
      billing,
      shipping,
      line_items: lineItems.filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
        .map((item) => {
          const quantity = this.decimalValue(item.quantity) || 1;
          const price = this.decimalValue(item.price);
          return { ...item, total: item.total ?? price * quantity, variation_id: item.variant_id ?? item.variation_id };
        }),
    };
  }

  private shopifyOrderStatus(order: Record<string, unknown>) {
    if (order.cancelled_at) return 'cancelled';
    const fulfillment = this.stringValue(order.fulfillment_status);
    if (fulfillment === 'fulfilled') return 'completed';
    if (fulfillment === 'partial') return 'processing';
    const financial = this.stringValue(order.financial_status);
    if (financial === 'refunded') return 'refunded';
    if (financial === 'voided' || financial === 'expired') return 'cancelled';
    if (financial === 'paid' || financial === 'partially_paid') return 'processing';
    return 'pending';
  }

  private skuValue(value: unknown) {
    if (typeof value !== 'string') return undefined;
    const sku = value.trim();
    return sku.length > 0 ? sku : undefined;
  }

  private async upsertWooVariant(tenantId: string, productId: string, variation: Record<string, unknown>) {
    const externalVariantId = this.numberId(variation.id);
    if (!externalVariantId) return false;
    const sku = this.skuValue(variation.sku);
    const data = {
      productId,
      sku,
      name: this.stringValue(variation.name) ?? sku ?? `Variant ${externalVariantId}`,
      price: this.decimalValue(variation.price ?? variation.regular_price),
      currency: this.stringValue(variation.currency) ?? 'USD',
    };
    try {
      await this.prisma.productVariant.upsert({
        where: { tenantId_externalVariantId: { tenantId, externalVariantId } },
        create: { tenantId, externalVariantId, ...data },
        update: data,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      await this.prisma.productVariant.upsert({
        where: { tenantId_externalVariantId: { tenantId, externalVariantId } },
        create: { tenantId, externalVariantId, ...data, sku: sku ? `${sku}-${externalVariantId}` : undefined },
        update: { ...data, sku: sku ? `${sku}-${externalVariantId}` : undefined },
      });
    }
    return true;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private productStatus(product: Record<string, unknown>): ProductStatus | undefined {
    if (product.status === 'publish') return ProductStatus.ACTIVE;
    if (typeof product.status === 'string' && product.status.length > 0) return ProductStatus.INACTIVE;
    return undefined;
  }

  private productImageUrl(product: Record<string, unknown>): string | undefined {
    const normalized = this.stringValue(product.image_src);
    if (normalized) return normalized;
    const images = Array.isArray(product.images) ? product.images : [];
    const first = images.find((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);
    return this.stringValue(first?.src);
  }

  private productStockQuantity(value: unknown): number | undefined {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
  }

  private productFields(product: Record<string, unknown>) {
    return {
      imageUrl: this.productImageUrl(product),
      sku: this.skuValue(product.sku),
      price: this.optionalDecimalValue(product.price ?? product.regular_price),
      stockQuantity: this.productStockQuantity(product.stock_quantity),
      stockStatus: this.stringValue(product.stock_status),
    };
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  }

  private decimalValue(value: unknown) {
    const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private optionalDecimalValue(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private orderStatus(value: string | undefined): OrderStatus {
    const mapped: Record<string, OrderStatus> = {
      pending: OrderStatus.PENDING,
      processing: OrderStatus.PROCESSING,
      'on-hold': OrderStatus.PENDING,
      completed: OrderStatus.DELIVERED,
      cancelled: OrderStatus.CANCELLED,
      refunded: OrderStatus.RETURNED,
      failed: OrderStatus.FAILED,
    };
    return mapped[value ?? ''] ?? OrderStatus.PENDING;
  }

  private orderFields(
    order: Record<string, unknown>,
    customerId: string | undefined,
    shipping: Record<string, unknown> | undefined,
    billing: Record<string, unknown> | undefined,
  ): OrderSyncFields {
    const status = this.stringValue(order.status);
    const totals = this.orderTotals(order);
    const paymentMethod = this.stringValue(order.payment_method_title) ?? this.stringValue(order.payment_method);
    const paymentStatus = this.paymentStatusFromWoo(order);
    return {
      ...(customerId ? { customerId } : {}),
      ...(totals.subtotal !== undefined ? { subtotalAmount: totals.subtotal } : {}),
      ...(totals.total !== undefined ? { totalAmount: totals.total } : {}),
      ...(totals.tax !== undefined ? { taxAmount: totals.tax } : {}),
      ...(totals.shipping !== undefined ? { shippingAmount: totals.shipping } : {}),
      ...(totals.discount !== undefined ? { discountAmount: totals.discount } : {}),
      ...(this.stringValue(order.currency) ? { currency: this.stringValue(order.currency) } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(this.stringValue(order.transaction_id) ? { paymentReference: this.stringValue(order.transaction_id) } : {}),
      ...(shipping ? { shippingAddress: shipping as Prisma.InputJsonValue } : {}),
      ...(billing ? { billingAddress: billing as Prisma.InputJsonValue } : {}),
      ...(status ? { status: this.orderStatus(status) } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    };
  }

  private async upsertCommerceOrder(tenantId: string, integrationId: string, provider: string, order: Record<string, unknown>, customerIds?: Map<string, string>) {
    const sourceProvider = provider.toUpperCase();
    const externalOrderId = this.numberId(order.id);
    if (!externalOrderId) throw new Error(`${sourceProvider} order is missing an external ID`);
    const storeId = await this.integrationStoreId(tenantId, integrationId);
    const billing = this.normalizeAddress(this.objectValue(order.billing));
    const shipping = this.normalizeAddress(this.objectValue(order.shipping)) ?? billing;
    const customerId = await this.resolveWooCustomer(tenantId, order, customerIds);
    const orderFields = this.orderFields(order, customerId, shipping, billing);
    const createdAt = this.dateValue(order.date_created_gmt) ?? this.dateValue(order.date_created);
    const saved = await this.prisma.order.upsert({
      where: { tenantId_sourceProvider_externalOrderId: { tenantId, sourceProvider, externalOrderId } },
      create: {
        tenantId,
        storeId,
        sourceProvider,
        externalOrderId,
        ...orderFields,
        subtotalAmount: orderFields.subtotalAmount ?? 0,
        totalAmount: orderFields.totalAmount ?? 0,
        ...(createdAt ? { createdAt } : {}),
      },
      update: orderFields,
      select: { id: true },
    });
    await this.replaceOrderItems(tenantId, saved.id, order);
    await this.appendOrderHistory(tenantId, saved.id, orderFields.status, this.stringValue(order.status));
    return saved;
  }

  private async resolveWooCustomer(tenantId: string, order: Record<string, unknown>, customerIds?: Map<string, string>) {
    const billing = this.objectValue(order.billing);
    const externalCustomerId = this.numberId(order.customer_id);
    if (externalCustomerId && customerIds?.has(externalCustomerId)) return customerIds.get(externalCustomerId);
    const email = this.stringValue(billing?.email) ?? this.stringValue(order.email);
    const firstName = this.stringValue(billing?.first_name) ?? this.stringValue(order.first_name);
    const lastName = this.stringValue(billing?.last_name) ?? this.stringValue(order.last_name);
    const phone = this.stringValue(billing?.phone);
    if (externalCustomerId) {
      const saved = await this.prisma.customer.upsert({
        where: { tenantId_externalCustomerId: { tenantId, externalCustomerId } },
        create: { tenantId, externalCustomerId, email, firstName, lastName, phone },
        update: { email, firstName, lastName, phone },
        select: { id: true },
      });
      customerIds?.set(externalCustomerId, saved.id);
      return saved.id;
    }
    if (!email) return undefined;
    const existing = await this.prisma.customer.findFirst({ where: { tenantId, email }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.prisma.customer.create({ data: { tenantId, email, firstName, lastName, phone }, select: { id: true } });
    return created.id;
  }

  private async replaceOrderItems(tenantId: string, orderId: string, order: Record<string, unknown>) {
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    await this.prisma.orderItem.deleteMany({ where: { tenantId, orderId } });
    for (const value of lineItems) {
      if (typeof value !== 'object' || value === null) continue;
      const item = value as Record<string, unknown>;
      const quantity = Math.max(1, Math.trunc(this.decimalValue(item.quantity) || 1));
      const totalAmount = this.optionalDecimalValue(item.total) ?? (this.decimalValue(item.price) * quantity);
      const unitAmount = this.optionalDecimalValue(item.price) ?? (quantity ? totalAmount / quantity : 0);
      const externalProductId = this.numberId(item.product_id);
      const externalVariantId = this.numberId(item.variation_id);
      const product = externalProductId
        ? await this.prisma.product.findUnique({ where: { tenantId_externalProductId: { tenantId, externalProductId } }, select: { id: true } })
        : null;
      const variant = externalVariantId
        ? await this.prisma.productVariant.findUnique({ where: { tenantId_externalVariantId: { tenantId, externalVariantId } }, select: { id: true } })
        : null;
      await this.prisma.orderItem.create({
        data: {
          tenantId,
          orderId,
          productId: product?.id,
          variantId: variant?.id,
          name: this.stringValue(item.name) ?? 'Item',
          sku: this.stringValue(item.sku),
          quantity,
          unitAmount,
          totalAmount,
        },
      });
    }
  }

  private async appendOrderHistory(tenantId: string, orderId: string, status: OrderStatus | undefined, wooStatus: string | undefined) {
    if (!status) return;
    const last = await this.prisma.orderStatusHistory.findFirst({
      where: { tenantId, orderId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (last?.status === status) return;
    await this.prisma.orderStatusHistory.create({
      data: { tenantId, orderId, status, note: wooStatus ? `Synced from WooCommerce (${wooStatus})` : 'Synced from WooCommerce' },
    });
  }

  private normalizeAddress(value: Record<string, unknown> | undefined) {
    if (!value) return undefined;
    const firstName = this.stringValue(value.firstName) ?? this.stringValue(value.first_name);
    const lastName = this.stringValue(value.lastName) ?? this.stringValue(value.last_name);
    const addressLine1 = this.stringValue(value.addressLine1) ?? this.stringValue(value.address_1) ?? this.stringValue(value.address1);
    const addressLine2 = this.stringValue(value.addressLine2) ?? this.stringValue(value.address_2) ?? this.stringValue(value.address2);
    const postalCode = this.stringValue(value.postalCode) ?? this.stringValue(value.postcode) ?? this.stringValue(value.zip);
    const normalized = {
      firstName,
      lastName,
      company: this.stringValue(value.company),
      addressLine1,
      addressLine2,
      city: this.stringValue(value.city),
      state: this.stringValue(value.state) ?? this.stringValue(value.province),
      postalCode,
      country: this.stringValue(value.country),
      email: this.stringValue(value.email),
      phone: this.stringValue(value.phone),
    };
    const compact = Object.fromEntries(Object.entries(normalized).filter(([, item]) => Boolean(item)));
    return Object.keys(compact).length > 0 ? compact : undefined;
  }

  private orderTotals(order: Record<string, unknown>) {
    const total = this.optionalDecimalValue(order.total);
    const tax = this.optionalDecimalValue(order.total_tax);
    const shipping = this.optionalDecimalValue(order.shipping_total);
    const discount = this.optionalDecimalValue(order.discount_total);
    const subtotal = total === undefined
      ? undefined
      : Math.max(0, Number((total - (tax ?? 0) - (shipping ?? 0) + (discount ?? 0)).toFixed(2)));
    return { total, tax, shipping, discount, subtotal };
  }

  private paymentStatusFromWoo(order: Record<string, unknown>): PaymentStatus | undefined {
    const status = this.stringValue(order.status);
    if (this.stringValue(order.date_paid) && status !== 'refunded' && status !== 'failed') return PaymentStatus.PAID;
    const mapped: Record<string, PaymentStatus> = {
      pending: PaymentStatus.PENDING,
      processing: PaymentStatus.PAID,
      'on-hold': PaymentStatus.AUTHORIZED,
      completed: PaymentStatus.PAID,
      cancelled: PaymentStatus.FAILED,
      refunded: PaymentStatus.REFUNDED,
      failed: PaymentStatus.FAILED,
    };
    return status ? mapped[status] : undefined;
  }

  private dateValue(value: unknown) {
    if (typeof value !== 'string' || !value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private async checkHealth(provider: string, credentials: IntegrationCredentials) {
    try {
      return await this.adapters.get(provider).testConnection(credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Integration credentials are invalid';
      return { healthy: false, message, checkedAt: new Date() };
    }
  }
}
