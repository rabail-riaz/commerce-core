import { Injectable, NotFoundException } from '@nestjs/common';
import { WhatsAppAdapter } from './whatsapp-adapter';

@Injectable()
export class WhatsAppAdapterRegistry {
  private readonly adapters = new Map<string, WhatsAppAdapter>();

  register(adapter: WhatsAppAdapter) {
    this.adapters.set(adapter.provider.toUpperCase(), adapter);
  }

  get(provider = 'META') {
    const adapter = this.adapters.get(provider.toUpperCase());
    if (!adapter) throw new NotFoundException(`WhatsApp provider is not configured: ${provider}`);
    return adapter;
  }

  list() {
    return [...this.adapters.keys()];
  }
}
