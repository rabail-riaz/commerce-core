import { Injectable } from '@nestjs/common';
import { IntegrationAdapter } from './integration-adapter';
import { WooCommerceAdapter } from './woocommerce.adapter';

@Injectable()
export class IntegrationAdapterRegistry {
  private readonly adapters: Map<string, IntegrationAdapter>;

  constructor(woocommerce: WooCommerceAdapter) {
    this.adapters = new Map([[woocommerce.provider, woocommerce]]);
  }

  get(provider: string): IntegrationAdapter {
    const adapter = this.adapters.get(provider.toUpperCase());
    if (!adapter) throw new Error(`Unsupported integration provider: ${provider}`);
    return adapter;
  }
}
