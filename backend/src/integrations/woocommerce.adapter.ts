import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IntegrationAdapter, IntegrationCredentials, IntegrationHealth } from './integration-adapter';

type WooCommerceCredentials = {
  url: string;
  key: string;
  secret: string;
};

@Injectable()
export class WooCommerceAdapter implements IntegrationAdapter {
  readonly provider = 'WOOCOMMERCE';

  verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const provided = Buffer.from(signature.trim(), 'utf8');
    const calculated = Buffer.from(expected, 'utf8');
    return provided.length === calculated.length && timingSafeEqual(provided, calculated);
  }

  async testConnection(credentials: IntegrationCredentials): Promise<IntegrationHealth> {
    const checkedAt = new Date();

    try {
      const parsed = this.parseCredentials(credentials);
      const endpoint = `${parsed.url}/wp-json/wc/v3/orders?per_page=1`;
      const authorization = Buffer.from(`${parsed.key}:${parsed.secret}`, 'utf8').toString('base64');
      const response = await fetch(endpoint, {
        headers: { accept: 'application/json', authorization: `Basic ${authorization}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 401 || response.status === 403) {
        return { healthy: false, message: 'WooCommerce rejected the provided credentials', checkedAt };
      }
      if (response.status === 404) {
        return { healthy: false, message: 'WooCommerce REST API endpoint was not found', checkedAt };
      }
      if (!response.ok) {
        return { healthy: false, message: `WooCommerce returned HTTP ${response.status}`, checkedAt };
      }
      return { healthy: true, message: 'WooCommerce connection is healthy', checkedAt };
    } catch (error) {
      if (error instanceof Error && (
        error.message === 'WooCommerce URL is invalid'
        || error.message === 'WooCommerce URL must use HTTP or HTTPS'
        || error.message === 'WooCommerce URL, key, and secret are required'
      )) {
        return { healthy: false, message: error.message, checkedAt };
      }
      if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) {
        return { healthy: false, message: 'Unable to reach the WooCommerce REST API', checkedAt };
      }
      return { healthy: false, message: 'WooCommerce connection failed', checkedAt };
    }
  }

  async fetchCollection(credentials: IntegrationCredentials, resource: string, page: number, perPage: number) {
    const parsed = this.parseCredentials(credentials);
    const authorization = Buffer.from(`${parsed.key}:${parsed.secret}`, 'utf8').toString('base64');
    const endpoint = `${parsed.url}/wp-json/wc/v3/${resource}?page=${page}&per_page=${perPage}`;
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json', authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('WooCommerce rejected the provided credentials');
      throw new Error(`WooCommerce returned HTTP ${response.status} while fetching ${resource}`);
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error(`WooCommerce returned an invalid ${resource} response`);
    const totalPages = Number(response.headers.get('x-wp-totalpages') ?? page);
    return { items: payload as Record<string, unknown>[], hasMore: page < totalPages };
  }

  private parseCredentials(credentials: IntegrationCredentials): WooCommerceCredentials {
    const url = typeof credentials.url === 'string' ? credentials.url.trim().replace(/\/+$/, '') : '';
    const key = typeof credentials.key === 'string' ? credentials.key.trim() : '';
    const secret = typeof credentials.secret === 'string' ? credentials.secret.trim() : '';
    if (!url || !key || !secret) throw new Error('WooCommerce URL, key, and secret are required');

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('WooCommerce URL is invalid');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('WooCommerce URL must use HTTP or HTTPS');
    return { url, key, secret };
  }
}
