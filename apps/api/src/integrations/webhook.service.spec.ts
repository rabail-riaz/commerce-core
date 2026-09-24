import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { IntegrationEncryptionService } from './integration-encryption.service';
import { IntegrationsService } from './integrations.service';
import { WooCommerceAdapter } from './woocommerce.adapter';

describe('WooCommerce webhook processing', () => {
  function setup(payload: Record<string, unknown>, processedAt: Date | null = null) {
    const secret = 'webhook-secret';
    const encryption = new IntegrationEncryptionService({
      get: () => Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    } as unknown as ConfigService);
    const prisma = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'integration-a', tenantId: 'tenant-a', provider: 'WOOCOMMERCE',
          credential: { ciphertext: encryption.encrypt(JSON.stringify({ secret, webhookSecret: secret })) },
        }),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue(processedAt === null ? null : { id: 'event-a', processedAt }),
        create: jest.fn().mockResolvedValue({ id: 'event-a', processedAt: null }),
        update: jest.fn(),
      },
    };
    const service = new IntegrationsService(prisma as never, encryption, { get: jest.fn().mockReturnValue(new WooCommerceAdapter()) } as never);
    const body = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    return { service, prisma, body, signature };
  }

  it('is idempotent for an already processed event', async () => {
    const body = Buffer.from('{"id":42}');
    const secret = 'webhook-secret';
    const encryption = new IntegrationEncryptionService({
      get: () => Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    } as unknown as ConfigService);
    const prisma = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'integration-a',
          tenantId: 'tenant-a',
          provider: 'WOOCOMMERCE',
          credential: { ciphertext: encryption.encrypt(JSON.stringify({ secret, webhookSecret: secret })) },
        }),
      },
      webhookEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-a', processedAt: new Date() }),
        create: jest.fn(),
      },
    };
    const service = new IntegrationsService(prisma as never, encryption, { get: jest.fn().mockReturnValue(new WooCommerceAdapter()) } as never);
    const signature = createHmac('sha256', secret).update(body).digest('base64');

    await expect(service.receiveWooCommerceWebhook('integration-a', 'order.updated', 'wc-event-1', signature, body, { id: 42 }))
      .resolves.toEqual({ accepted: true, duplicate: true, processed: true, eventId: 'event-a' });
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without creating an event', async () => {
    const { service, prisma, body } = setup({ id: 42 });

    await expect(service.receiveWooCommerceWebhook('integration-a', 'order.updated', 'wc-event-2', 'invalid', body, { id: 42 }))
      .rejects.toThrow('Invalid webhook signature');
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('processes a valid customer webhook and marks it processed', async () => {
    const payload = { id: 42, email: 'buyer@example.com', first_name: 'Ada', last_name: 'Lovelace', billing: { phone: '555-0100' } };
    const { service, prisma, body, signature } = setup(payload);
    const customerUpsert = jest.fn().mockResolvedValue({ id: 'customer-a' });
    Object.assign(prisma, { customer: { upsert: customerUpsert } });

    await expect(service.receiveWooCommerceWebhook('integration-a', 'customer.updated', 'wc-event-3', signature, body, payload))
      .resolves.toEqual({ accepted: true, duplicate: false, processed: true, eventId: 'event-a' });
    expect(customerUpsert).toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ processedAt: expect.any(Date), errorMessage: null }) }));
  });

  it('records processing failures and returns a retryable error', async () => {
    const { service, prisma, body, signature } = setup({ id: 42 });

    await expect(service.receiveWooCommerceWebhook('integration-a', 'coupon.updated', 'wc-event-4', signature, body, { id: 42 }))
      .rejects.toThrow('Webhook processing failed');
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: { errorMessage: 'Unsupported WooCommerce webhook event: coupon.updated' } }));
  });
});
