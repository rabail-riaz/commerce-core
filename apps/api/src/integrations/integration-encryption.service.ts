import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

@Injectable()
export class IntegrationEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configured = config.get<string>('INTEGRATION_ENCRYPTION_KEY');
    if (!configured) throw new Error('INTEGRATION_ENCRYPTION_KEY must be configured for integration credentials');
    const key = Buffer.from(configured, /^[0-9a-f]{64}$/i.test(configured) ? 'hex' : 'base64');
    if (key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes');
    this.key = key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(value: string): string {
    const [ivEncoded, tagEncoded, ciphertextEncoded] = value.split('.');
    if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error('Invalid integration credential ciphertext');
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivEncoded, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64url')), decipher.final()]).toString('utf8');
  }
}
