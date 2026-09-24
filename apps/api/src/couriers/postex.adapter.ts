import { Injectable } from '@nestjs/common';
import {
  BookShipmentRequest,
  BookShipmentResult,
  CancelShipmentResult,
  CourierAdapter,
  CourierCredentials,
  ShipmentLabel,
  ShipmentStatusResult,
  TrackShipmentResult,
} from './courier-adapter';

type PostExCredentials = {
  token: string;
  baseUrl?: string;
};

const DEFAULT_BASE_URL = 'https://api.postex.pk';

@Injectable()
export class PostExAdapter implements CourierAdapter {
  readonly code = 'POSTEX';

  async validateCredentials(credentials: CourierCredentials) {
    try {
      const parsed = this.parseCredentials(credentials);
      const response = await this.request(parsed, '/services/integration/api/order/v1/track-order/invalid-credential-check', { method: 'GET' });
      if (response.status === 401 || response.status === 403) return { valid: false, message: 'PostEx rejected the provided token' };
      return { valid: true, message: 'PostEx credentials are valid' };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : 'PostEx credential validation failed' };
    }
  }

  async bookShipment(credentials: CourierCredentials, request: BookShipmentRequest): Promise<BookShipmentResult> {
    const parsed = this.parseCredentials(credentials);
    const payload = {
      orderRefNumber: request.orderId,
      invoicePayment: 'COD',
      orderAmount: request.metadata?.orderAmount ?? 0,
      customerName: request.recipient.name,
      customerPhone: request.recipient.phone,
      deliveryAddress: [request.recipient.addressLine1, request.recipient.addressLine2, request.recipient.city, request.recipient.postalCode].filter(Boolean).join(', '),
      cityName: request.recipient.city,
      items: request.metadata?.items ?? '',
      customerEmail: request.metadata?.customerEmail,
      transactionNotes: request.metadata?.transactionNotes,
    };
    const response = await this.request(parsed, '/services/integration/api/order/v3/create-order', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const body = await this.readBody(response);
    this.assertSuccess(response, body, 'book shipment');
    const reference = this.value(body, ['dist', 'trackingNumber', 'tracking_number', 'orderTrackingNumber', 'orderRefNumber']);
    if (!reference) throw new Error('PostEx booking response did not include a shipment reference');
    return {
      shipmentReference: reference,
      trackingNumber: this.value(body, ['trackingNumber', 'tracking_number', 'dist']),
      status: this.mapStatus(this.value(body, ['status', 'orderStatus']) ?? 'BOOKED'),
      raw: body,
    };
  }

  async cancelShipment(credentials: CourierCredentials, shipmentReference: string): Promise<CancelShipmentResult> {
    const parsed = this.parseCredentials(credentials);
    const response = await this.request(parsed, `/services/integration/api/order/v1/cancel-order/${encodeURIComponent(shipmentReference)}`, { method: 'GET' });
    const body = await this.readBody(response);
    this.assertSuccess(response, body, 'cancel shipment');
    return { cancelled: true, status: this.mapStatus(this.value(body, ['status', 'orderStatus']) ?? 'CANCELLED'), raw: body };
  }

  async trackShipment(credentials: CourierCredentials, trackingNumber: string): Promise<TrackShipmentResult> {
    const parsed = this.parseCredentials(credentials);
    const response = await this.request(parsed, `/services/integration/api/order/v1/track-order/${encodeURIComponent(trackingNumber)}`, { method: 'GET' });
    const body = await this.readBody(response);
    this.assertSuccess(response, body, 'track shipment');
    const status = this.mapStatus(this.value(body, ['status', 'orderStatus', 'trackingStatus']) ?? 'UNKNOWN');
    return { trackingNumber, status, events: [], raw: body };
  }

  async getLabel(_credentials: CourierCredentials, _shipmentReference: string): Promise<ShipmentLabel> {
    throw new Error('PostEx does not expose label retrieval through the configured integration API');
  }

  async getStatus(credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentStatusResult> {
    const tracked = await this.trackShipment(credentials, shipmentReference);
    return { shipmentReference, status: tracked.status, raw: tracked.raw };
  }

  private parseCredentials(credentials: CourierCredentials): PostExCredentials {
    const token = typeof credentials.token === 'string' ? credentials.token.trim() : '';
    const baseUrl = typeof credentials.baseUrl === 'string' && credentials.baseUrl.trim()
      ? credentials.baseUrl.trim().replace(/\/+$/, '')
      : DEFAULT_BASE_URL;
    if (!token) throw new Error('PostEx token is required');
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error('PostEx base URL is invalid');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('PostEx base URL must use HTTP or HTTPS');
    return { token, baseUrl };
  }

  private async request(credentials: PostExCredentials, path: string, init: RequestInit) {
    return fetch(`${credentials.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        token: credentials.token,
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
  }

  private async readBody(response: Response): Promise<Record<string, unknown>> {
    const payload: unknown = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  }

  private assertSuccess(response: Response, body: Record<string, unknown>, operation: string) {
    if (response.status === 401 || response.status === 403) throw new Error('PostEx rejected the provided token');
    if (!response.ok || body.status === false || body.statusCode === 400) {
      throw new Error(`PostEx failed to ${operation}`);
    }
  }

  private value(body: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    const nested = body.dist;
    if (nested && typeof nested === 'object') return this.value(nested as Record<string, unknown>, keys);
    return undefined;
  }

  private mapStatus(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const statuses: Record<string, string> = {
      booked: 'LABEL_CREATED',
      created: 'LABEL_CREATED',
      pending: 'PENDING',
      picked_up: 'PICKED_UP',
      pickedup: 'PICKED_UP',
      in_transit: 'IN_TRANSIT',
      dispatched: 'IN_TRANSIT',
      out_for_delivery: 'OUT_FOR_DELIVERY',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
      canceled: 'CANCELLED',
      returned: 'RETURNED',
      failed: 'FAILED',
    };
    return statuses[normalized] ?? 'PENDING';
  }
}
