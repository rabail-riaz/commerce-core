import { Injectable } from '@nestjs/common';
import { IntegrationAdapter } from './integration-adapter';
import { ShopifyAdapter } from './shopify.adapter';
import { WooCommerceAdapter } from './woocommerce.adapter';

@Injectable()
export class IntegrationAdapterRegistry {
  private readonly adapters: Map<string, IntegrationAdapter>;

  constructor(woocommerce: WooCommerceAdapter, shopify: ShopifyAdapter) {
    this.adapters = new Map<string, IntegrationAdapter>([
      [woocommerce.provider, woocommerce],
      [shopify.provider, shopify],
    ]);
  }

  get(provider: string): IntegrationAdapter {
    const adapter = this.adapters.get(provider.toUpperCase());
    if (!adapter) throw new Error(`Unsupported integration provider: ${provider}`);
    return adapter;
  }
}
