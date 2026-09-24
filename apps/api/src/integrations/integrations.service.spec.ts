import { IntegrationsService } from './integrations.service';
import { IntegrationEncryptionService } from './integration-encryption.service';
import { ConfigService } from '@nestjs/config';

describe('IntegrationsService', () => {
  it('stores only encrypted credentials and never returns them', async () => {
    const encryption = new IntegrationEncryptionService({
      get: () => Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    } as unknown as ConfigService);
    const plaintext = JSON.stringify({ token: 'secret' });
    let storedCiphertext = '';
    const prisma = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'integration-a', provider: 'WOOCOMMERCE' }),
        update: jest.fn(),
      },
      integrationCredential: {
        upsert: jest.fn().mockImplementation(({ create }) => {
          storedCiphertext = create.ciphertext;
          return { id: 'credential-a', ciphertext: storedCiphertext };
        }),
      },
    };
    const adapters = { get: jest.fn().mockReturnValue({ testConnection: jest.fn().mockResolvedValue({ healthy: true, message: 'ok', checkedAt: new Date() }) }) };
    const service = new IntegrationsService(prisma as never, encryption, adapters as never);

    await expect(service.saveCredentials('tenant-a', 'integration-a', { token: 'secret' })).resolves.toEqual(expect.objectContaining({ saved: true }));
    expect(storedCiphertext).not.toContain('secret');
    expect(encryption.decrypt(storedCiphertext)).toBe(plaintext);
    expect(prisma.integrationCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_integrationId: { tenantId: 'tenant-a', integrationId: 'integration-a' } },
      create: expect.objectContaining({ tenantId: 'tenant-a', integrationId: 'integration-a', ciphertext: storedCiphertext }),
    }));
  });

  it('returns safe integration metadata without credential fields', async () => {
    const prisma = {
      integration: { findFirst: jest.fn().mockResolvedValue({ id: 'integration-a', provider: 'SHOPIFY', status: 'ACTIVE', syncLogs: [] }) },
    };
    const service = new IntegrationsService(prisma as never, { encrypt: jest.fn() } as never, { get: jest.fn() } as never);

    const result = await service.getById('tenant-a', 'integration-a');
    expect(result).not.toHaveProperty('credential');
    expect(result).not.toHaveProperty('credentialsCiphertext');
  });

  it('does not persist invalid provider credentials', async () => {
    const prisma = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'integration-a', provider: 'WOOCOMMERCE' }),
        update: jest.fn(),
      },
      integrationCredential: { upsert: jest.fn() },
    };
    const adapters = {
      get: jest.fn().mockReturnValue({
        testConnection: jest.fn().mockResolvedValue({ healthy: false, message: 'WooCommerce rejected the provided credentials', checkedAt: new Date() }),
      }),
    };
    const service = new IntegrationsService(prisma as never, { encrypt: jest.fn() } as never, adapters as never);

    await expect(service.saveCredentials('tenant-a', 'integration-a', { url: 'https://shop.test', key: 'bad', secret: 'bad' }))
      .rejects.toThrow('WooCommerce rejected the provided credentials');
    expect(prisma.integrationCredential.upsert).not.toHaveBeenCalled();
    expect(prisma.integration.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ERROR', lastError: 'WooCommerce rejected the provided credentials' } }));
  });
});
