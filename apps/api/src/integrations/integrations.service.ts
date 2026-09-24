import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, OrderStatus, ProductStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/pagination.dto';
import { IntegrationEncryptionService } from './integration-encryption.service';
import { IntegrationAdapterRegistry } from './integration-adapter.registry';
import { IntegrationAdapter, IntegrationCredentials } from './integration-adapter';
import { CreateIntegrationDto } from './dto';
import { QueueFoundationService } from '../queues/queue-foundation.service';

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
    return this.prisma.integration.create({
      data: { tenantId, provider: dto.provider, storeId: dto.storeId },
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

  private async upsertWebhookProduct(tenantId: string, integrationId: string, product: Record<string, unknown>) {
    const externalProductId = this.numberId(product.id);
    if (!externalProductId) throw new Error('Webhook product is missing an external ID');
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, id: integrationId }, select: { storeId: true } });
    const saved = await this.prisma.product.upsert({
      where: { tenantId_externalProductId: { tenantId, externalProductId } },
      create: { tenantId, storeId: integration?.storeId, externalProductId, name: this.stringValue(product.name) ?? `Product ${externalProductId}`, description: this.stringValue(product.description), ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}) },
      update: { name: this.stringValue(product.name) ?? `Product ${externalProductId}`, description: this.stringValue(product.description), ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}) },
      select: { id: true },
    });
    const variations = Array.isArray(product.variations) ? product.variations : [];
    for (const value of variations) {
      if (typeof value !== 'object' || value === null) continue;
      const variation = value as Record<string, unknown>;
      const externalVariantId = this.numberId(variation.id);
      if (!externalVariantId) continue;
      await this.prisma.productVariant.upsert({
        where: { tenantId_externalVariantId: { tenantId, externalVariantId } },
        create: { tenantId, productId: saved.id, externalVariantId, sku: this.stringValue(variation.sku), name: this.stringValue(variation.name), price: this.decimalValue(variation.price), currency: this.stringValue(variation.currency) ?? 'USD' },
        update: { productId: saved.id, sku: this.stringValue(variation.sku), name: this.stringValue(variation.name), price: this.decimalValue(variation.price), currency: this.stringValue(variation.currency) ?? 'USD' },
      });
    }
  }

  private async upsertWebhookOrder(tenantId: string, integrationId: string, order: Record<string, unknown>) {
    const externalOrderId = this.numberId(order.id);
    if (!externalOrderId) throw new Error('Webhook order is missing an external ID');
    const integration = await this.prisma.integration.findFirst({ where: { tenantId, id: integrationId }, select: { storeId: true } });
    const externalCustomerId = this.numberId(order.customer_id);
    const customer = externalCustomerId ? await this.prisma.customer.findUnique({ where: { tenantId_externalCustomerId: { tenantId, externalCustomerId } }, select: { id: true } }) : null;
    const billing = this.objectValue(order.billing);
    const shipping = this.objectValue(order.shipping);
    const orderFields = this.orderFields(order, customer?.id, shipping, billing);
    await this.prisma.order.upsert({
      where: { tenantId_sourceProvider_externalOrderId: { tenantId, sourceProvider: 'WOOCOMMERCE', externalOrderId } },
      create: { tenantId, storeId: integration?.storeId, sourceProvider: 'WOOCOMMERCE', externalOrderId, ...orderFields, subtotalAmount: orderFields.subtotalAmount ?? 0, totalAmount: orderFields.totalAmount ?? 0 },
      update: orderFields,
    });
  }

  private webhookEventId(rawBody: Buffer, eventType: string) {
    return createHash('sha256').update(eventType).update(':').update(rawBody).digest('hex');
  }

  async startInitialSync(tenantId: string, integrationId: string) {
    if (!this.queues) throw new Error('Queue foundation is not available');
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id: integrationId },
      select: { id: true, provider: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    const running = await this.prisma.integrationSyncLog.findFirst({
      where: { tenantId, integrationId, status: 'RUNNING' },
      select: { id: true, status: true, startedAt: true },
    });
    if (running) return { started: false, syncLogId: running.id, status: running.status, startedAt: running.startedAt };

    const log = await this.prisma.integrationSyncLog.create({
      data: { tenantId, integrationId, status: 'RUNNING', syncType: 'MANUAL' },
      select: { id: true, status: true, startedAt: true },
    });
    const job = await this.queues.integrationSync.add('initial-sync', { tenantId, integrationId, provider: integration.provider, syncLogId: log.id }, { jobId: log.id });
    return { started: true, syncLogId: log.id, jobId: job.id, status: log.status, startedAt: log.startedAt };
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

      const customers = await this.fetchAll(adapter, credentials, 'customers');
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

      const products = await this.fetchAll(adapter, credentials, 'products');
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
            ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}),
          },
          update: {
            name: this.stringValue(product.name) ?? `Product ${externalProductId}`,
            description: this.stringValue(product.description) ?? this.stringValue(product.short_description),
            ...(this.productStatus(product) ? { status: this.productStatus(product) } : {}),
          },
          select: { id: true },
        });
        counts.recordsSynced++;

        const rawVariations = Array.isArray(product.variations) ? product.variations : [];
        const embeddedVariations = rawVariations.filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null);
        const variations = embeddedVariations.length === rawVariations.length && rawVariations.length > 0
          ? embeddedVariations
          : await this.fetchAll(adapter, credentials, `products/${externalProductId}/variations`);
        for (const variation of variations) {
          const externalVariantId = this.numberId(variation.id);
          if (!externalVariantId) continue;
          await this.prisma.productVariant.upsert({
            where: { tenantId_externalVariantId: { tenantId, externalVariantId } },
            create: {
              tenantId,
              productId: saved.id,
              externalVariantId,
              sku: this.stringValue(variation.sku),
              name: this.stringValue(variation.name),
              price: this.decimalValue(variation.price),
              currency: this.stringValue(variation.currency) ?? 'USD',
            },
            update: {
              productId: saved.id,
              sku: this.stringValue(variation.sku),
              name: this.stringValue(variation.name),
              price: this.decimalValue(variation.price),
              currency: this.stringValue(variation.currency) ?? 'USD',
            },
          });
          counts.recordsSynced++;
        }
      }

      const orders = await this.fetchAll(adapter, credentials, 'orders');
      for (const order of orders) {
        const externalOrderId = this.numberId(order.id);
        if (!externalOrderId) continue;
        const billing = this.objectValue(order.billing);
        const shipping = this.objectValue(order.shipping);
        const externalCustomerId = this.numberId(order.customer_id);
        const orderFields = this.orderFields(order, externalCustomerId ? customerIds.get(externalCustomerId) : undefined, shipping, billing);
        await this.prisma.order.upsert({
          where: { tenantId_sourceProvider_externalOrderId: { tenantId, sourceProvider: provider, externalOrderId } },
          create: {
            tenantId,
            storeId,
            sourceProvider: provider,
            externalOrderId,
            ...orderFields,
            subtotalAmount: orderFields.subtotalAmount ?? 0,
            totalAmount: orderFields.totalAmount ?? 0,
          },
          update: orderFields,
        });
        counts.recordsSynced++;
      }

      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.integrationSyncLog.update({ where: { id: syncLogId }, data: { status: 'SUCCEEDED', completedAt, ...counts } }),
        this.prisma.integration.update({ where: { id: integrationId }, data: { status: 'ACTIVE', lastSyncedAt: completedAt, lastError: null } }),
      ]);
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
    if (!this.queues) throw new Error('Queue foundation is not available');
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, id: integrationId },
      select: { id: true, provider: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    const running = await this.prisma.integrationSyncLog.findFirst({
      where: { tenantId, integrationId, status: 'RUNNING' },
      select: { id: true, status: true, startedAt: true },
    });
    if (running) return { started: false, syncLogId: running.id, status: running.status, startedAt: running.startedAt };
    const log = await this.prisma.integrationSyncLog.create({
      data: { tenantId, integrationId, status: 'RUNNING', syncType: 'RECONCILIATION' },
      select: { id: true, status: true, startedAt: true },
    });
    const job = await this.queues.integrationSync.add('reconcile-store', {
      tenantId, integrationId, provider: integration.provider, syncLogId: log.id,
    }, { jobId: log.id });
    return { started: true, syncLogId: log.id, jobId: job.id, status: log.status, startedAt: log.startedAt, syncType: 'RECONCILIATION' };
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
    return typeof value === 'number' || typeof value === 'string' ? String(value) : undefined;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private productStatus(product: Record<string, unknown>): ProductStatus | undefined {
    if (product.status === 'publish') return ProductStatus.ACTIVE;
    if (typeof product.status === 'string' && product.status.length > 0) return ProductStatus.INACTIVE;
    return undefined;
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
    return {
      ...(customerId ? { customerId } : {}),
      ...(this.optionalDecimalValue(order.total) !== undefined ? { subtotalAmount: this.optionalDecimalValue(order.total), totalAmount: this.optionalDecimalValue(order.total) } : {}),
      ...(this.optionalDecimalValue(order.total_tax) !== undefined ? { taxAmount: this.optionalDecimalValue(order.total_tax) } : {}),
      ...(this.optionalDecimalValue(order.shipping_total) !== undefined ? { shippingAmount: this.optionalDecimalValue(order.shipping_total) } : {}),
      ...(this.optionalDecimalValue(order.discount_total) !== undefined ? { discountAmount: this.optionalDecimalValue(order.discount_total) } : {}),
      ...(this.stringValue(order.currency) ? { currency: this.stringValue(order.currency) } : {}),
      ...(this.stringValue(order.payment_method_title) ? { paymentMethod: this.stringValue(order.payment_method_title) } : {}),
      ...(this.stringValue(order.transaction_id) ? { paymentReference: this.stringValue(order.transaction_id) } : {}),
      ...(shipping ? { shippingAddress: shipping as Prisma.InputJsonValue } : {}),
      ...(billing ? { billingAddress: billing as Prisma.InputJsonValue } : {}),
      ...(status ? { status: this.orderStatus(status) } : {}),
    };
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
