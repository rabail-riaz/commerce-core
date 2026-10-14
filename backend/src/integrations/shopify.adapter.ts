import { Injectable } from '@nestjs/common';
import { IntegrationAdapter, IntegrationCredentials, IntegrationHealth } from './integration-adapter';

const API_VERSION = '2024-10';

type ShopifyCredentials = {
  shop: string;
  accessToken: string;
};

@Injectable()
export class ShopifyAdapter implements IntegrationAdapter {
  readonly provider = 'SHOPIFY';

  async testConnection(credentials: IntegrationCredentials): Promise<IntegrationHealth> {
    const checkedAt = new Date();
    try {
      const parsed = this.parseCredentials(credentials);
      const response = await fetch(this.endpoint(parsed, 'shop.json'), {
        headers: this.headers(parsed),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) {
        return { healthy: false, message: 'Shopify rejected the provided access token', checkedAt };
      }
      if (response.status === 404) {
        return { healthy: false, message: 'Shopify shop was not found', checkedAt };
      }
      if (!response.ok) {
        return { healthy: false, message: `Shopify returned HTTP ${response.status}`, checkedAt };
      }
      return { healthy: true, message: 'Shopify connection is healthy', checkedAt };
    } catch (error) {
      if (error instanceof Error && (
        error.message === 'Shopify shop domain is invalid'
        || error.message === 'Shopify shop and access token are required'
      )) {
        return { healthy: false, message: error.message, checkedAt };
      }
      if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) {
        return { healthy: false, message: 'Unable to reach the Shopify Admin API', checkedAt };
      }
      return { healthy: false, message: 'Shopify connection failed', checkedAt };
    }
  }

  async fetchCollection(credentials: IntegrationCredentials, resource: string, page: number, perPage: number) {
    if (page > 1) return { items: [] as Record<string, unknown>[], hasMore: false };
    const parsed = this.parseCredentials(credentials);
    const variationMatch = /^products\/([^/]+)\/variations$/.exec(resource);
    if (variationMatch) {
      const response = await fetch(this.endpoint(parsed, `products/${variationMatch[1]}.json`), {
        headers: this.headers(parsed),
        signal: AbortSignal.timeout(30_000),
      });
      this.assertOk(response, resource);
      const payload = await response.json() as { product?: { variants?: Record<string, unknown>[] } };
      return { items: payload.product?.variants ?? [], hasMore: false };
    }

    const items: Record<string, unknown>[] = [];
    let url: string | null = this.collectionUrl(parsed, resource, Math.min(perPage, 250));
    while (url) {
      const response = await fetch(url, { headers: this.headers(parsed), signal: AbortSignal.timeout(30_000) });
      this.assertOk(response, resource);
      const payload = await response.json() as Record<string, unknown>;
      items.push(...this.unwrap(payload, resource));
      url = this.nextLink(response.headers.get('link'));
    }
    return { items, hasMore: false };
  }

  private collectionUrl(credentials: ShopifyCredentials, resource: string, limit: number) {
    const query = resource === 'orders' ? `limit=${limit}&status=any` : `limit=${limit}`;
    return this.endpoint(credentials, `${resource}.json?${query}`);
  }

  private unwrap(payload: Record<string, unknown>, resource: string) {
    const key = resource.split('/')[0];
    const value = payload[key];
    return Array.isArray(value) ? value as Record<string, unknown>[] : [];
  }

  private nextLink(header: string | null) {
    if (!header) return null;
    const match = header.split(',').map((part) => part.trim()).find((part) => part.includes('rel="next"'));
    const url = match?.match(/<([^>]+)>/)?.[1];
    return url ?? null;
  }

  private assertOk(response: Response, resource: string) {
    if (response.ok) return;
    if (response.status === 401 || response.status === 403) throw new Error('Shopify rejected the provided access token');
    throw new Error(`Shopify returned HTTP ${response.status} while fetching ${resource}`);
  }

  private endpoint(credentials: ShopifyCredentials, path: string) {
    return `https://${credentials.shop}/admin/api/${API_VERSION}/${path}`;
  }

  private headers(credentials: ShopifyCredentials) {
    return { accept: 'application/json', 'X-Shopify-Access-Token': credentials.accessToken };
  }

  private parseCredentials(credentials: IntegrationCredentials): ShopifyCredentials {
    const shopValue = typeof credentials.shop === 'string' ? credentials.shop.trim() : typeof credentials.url === 'string' ? credentials.url.trim() : '';
    const accessToken = typeof credentials.accessToken === 'string' ? credentials.accessToken.trim() : typeof credentials.token === 'string' ? credentials.token.trim() : '';
    if (!shopValue || !accessToken) throw new Error('Shopify shop and access token are required');
    const host = shopValue.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0];
    if (!host.includes('.')) throw new Error('Shopify shop domain is invalid');
    return { shop: host, accessToken };
  }
}
