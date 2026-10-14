import { Injectable } from '@nestjs/common';
import { CourierAdapter } from './courier-adapter';
import { LeopardsAdapter } from './leopards.adapter';
import { PostExAdapter } from './postex.adapter';

@Injectable()
export class CourierAdapterRegistry {
  private readonly adapters = new Map<string, CourierAdapter>();

  constructor(postEx?: PostExAdapter, leopards?: LeopardsAdapter) {
    if (postEx) this.register(postEx);
    if (leopards) this.register(leopards);
  }

  register(adapter: CourierAdapter) {
    const code = adapter.code.trim().toUpperCase();
    if (!code) throw new Error('Courier adapter code is required');
    if (this.adapters.has(code)) throw new Error(`Courier adapter already registered: ${code}`);
    this.adapters.set(code, adapter);
  }

  get(code: string): CourierAdapter {
    const adapter = this.adapters.get(code.trim().toUpperCase());
    if (!adapter) throw new Error(`Unsupported courier adapter: ${code}`);
    return adapter;
  }
}
