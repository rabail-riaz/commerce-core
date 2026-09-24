import { ConfigService } from '@nestjs/config';
import { IntegrationEncryptionService } from './integration-encryption.service';

describe('IntegrationEncryptionService', () => {
  it('encrypts and decrypts without storing plaintext in the ciphertext', () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const service = new IntegrationEncryptionService({ get: () => Buffer.from(secret).toString('base64') } as unknown as ConfigService);

    const ciphertext = service.encrypt(JSON.stringify({ accessToken: 'top-secret', shop: 'store-1' }));

    expect(ciphertext).not.toContain('top-secret');
    expect(service.decrypt(ciphertext)).toBe(JSON.stringify({ accessToken: 'top-secret', shop: 'store-1' }));
    expect(service.encrypt('same value')).not.toBe(service.encrypt('same value'));
  });

  it('rejects invalid key lengths', () => {
    expect(() => new IntegrationEncryptionService({ get: () => 'short' } as unknown as ConfigService)).toThrow('exactly 32 bytes');
  });
});
