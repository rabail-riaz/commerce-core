import { Injectable, NotFoundException } from '@nestjs/common';
import { EmailProvider } from '@prisma/client';
import { EmailAdapter } from './email-adapter';

@Injectable()
export class EmailAdapterRegistry {
  private readonly adapters = new Map<EmailProvider, EmailAdapter>();

  register(adapter: EmailAdapter) {
    this.adapters.set(adapter.provider, adapter);
  }

  list() {
    return [...this.adapters.keys()];
  }

  has(provider: EmailProvider) {
    return this.adapters.has(provider);
  }

  get(provider: EmailProvider) {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new NotFoundException(`Email provider is not configured: ${provider}`);
    return adapter;
  }
}
