import { Injectable } from '@nestjs/common';
import {
  BookShipmentRequest,
  BookShipmentResult,
  CancelShipmentResult,
  CourierAdapter,
  CourierCredentials,
  ListedShipment,
  ListShipmentsRange,
  ShipmentLabel,
  ShipmentStatusResult,
  TrackShipmentResult,
} from './courier-adapter';

type LeopardsCredentials = {
  apiKey: string;
  apiPassword: string;
  baseUrl: string;
};

const DEFAULT_BASE_URL = 'https://merchantapi.leopardscourier.com/api';

@Injectable()
export class LeopardsAdapter implements CourierAdapter {
  readonly code = 'LEOPARDS';

  async validateCredentials(credentials: CourierCredentials) {
    try {
      const parsed = this.parseCredentials(credentials);
      const body = await this.request(parsed, 'getAllCities/format/json/', 'GET');
      if (this.isAuthFailure(body)) {
        return { valid: false, message: this.authMessage(body) };
      }
      if (!this.isSuccess(body) && !this.collection(body).length) {
        const message = this.errorMessage(body);
        return { valid: false, message: message || 'Leopards could not verify these credentials.' };
      }
      return { valid: true, message: 'Leopards connection is healthy' };
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        return { valid: false, message: 'Leopards did not respond in time. Check your network and try again.' };
      }
      if (error instanceof TypeError) {
        return { valid: false, message: 'Unable to reach the Leopards API.' };
      }
      return { valid: false, message: error instanceof Error ? error.message : 'Leopards credential validation failed' };
    }
  }

  async bookShipment(credentials: CourierCredentials, request: BookShipmentRequest): Promise<BookShipmentResult> {
    const parsed = this.parseCredentials(credentials);
    const payload: Record<string, string> = {
      booked_packet_weight: String(Math.round((request.package.weight || 0.5) * 1000)),
      booked_packet_no_piece: '1',
      booked_packet_collect_amount: String(request.metadata?.orderAmount ?? 0),
      booked_packet_order_id: request.orderId,
      origin_city: String(request.metadata?.originCity ?? 'self'),
      destination_city: String(request.metadata?.destinationCity ?? request.recipient.city),
      shipment_name_eng: String(request.metadata?.shipperName ?? 'Merchant'),
      shipment_phone: String(request.metadata?.shipperPhone ?? ''),
      shipment_address: String(request.metadata?.shipperAddress ?? ''),
      consignment_name_eng: request.recipient.name,
      consignment_phone: request.recipient.phone ?? '',
      consignment_email: String(request.metadata?.customerEmail ?? ''),
      consignment_address: [request.recipient.addressLine1, request.recipient.addressLine2, request.recipient.city].filter(Boolean).join(', '),
      special_instructions: String(request.metadata?.notes ?? ''),
    };
    const body = await this.request(parsed, 'bookPacket/format/json/', 'POST', payload);
    this.assertSuccess(body, 'book shipment');
    const trackingNumber = this.value(body, ['track_number', 'trackingNumber', 'cn', 'cn_number']);
    if (!trackingNumber) throw new Error('Leopards booking response did not include a tracking number');
    return {
      shipmentReference: trackingNumber,
      trackingNumber,
      labelUrl: this.value(body, ['slip_link', 'labelUrl']),
      status: this.mapStatus(this.value(body, ['status', 'booked_packet_status']) ?? 'BOOKED'),
      raw: body,
    };
  }

  async cancelShipment(credentials: CourierCredentials, shipmentReference: string): Promise<CancelShipmentResult> {
    const parsed = this.parseCredentials(credentials);
    const body = await this.request(parsed, 'cancelBookedPackets/format/json/', 'POST', { cn_numbers: shipmentReference, track_numbers: shipmentReference });
    this.assertSuccess(body, 'cancel shipment');
    return { cancelled: true, status: 'CANCELLED', raw: body };
  }

  async trackShipment(credentials: CourierCredentials, trackingNumber: string): Promise<TrackShipmentResult> {
    const parsed = this.parseCredentials(credentials);
    const body = await this.request(parsed, 'trackBookedPacket/format/json/', 'GET', { track_numbers: trackingNumber });
    this.assertSuccess(body, 'track shipment');
    const packet = this.collection(body)[0] ?? body;
    const status = this.mapStatus(this.value(packet, ['booked_packet_status', 'status', 'packet_status', 'tracking_status']) ?? 'UNKNOWN');
    return { trackingNumber, status, events: [], raw: body };
  }

  async getLabel(_credentials: CourierCredentials, _shipmentReference: string): Promise<ShipmentLabel> {
    throw new Error('Leopards does not expose label retrieval through the configured integration API');
  }

  async getStatus(credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentStatusResult> {
    const tracked = await this.trackShipment(credentials, shipmentReference);
    return { shipmentReference, status: tracked.status, raw: tracked.raw };
  }

  async listShipments(credentials: CourierCredentials, range?: ListShipmentsRange): Promise<ListedShipment[]> {
    const parsed = this.parseCredentials(credentials);
    const health = await this.request(parsed, 'getAllCities/format/json/', 'GET');
    if (this.isAuthFailure(health) || (!this.isSuccess(health) && !this.collection(health).length)) {
      throw new Error(this.authMessage(health));
    }
    const end = range?.to ?? new Date();
    const start = range?.from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = this.formatDate(start);
    const toDate = this.formatDate(end);
    const fromAlt = this.formatDateAlt(start);
    const toAlt = this.formatDateAlt(end);
    const attempts: Array<{ path: string; method: 'GET' | 'POST'; extra?: Record<string, string> }> = [
      { path: 'getBookedPacketStatus/format/json/', method: 'POST', extra: { from_date: fromDate, to_date: toDate } },
      { path: 'getBookedPacketStatus/format/json/', method: 'POST', extra: { from_date: fromAlt, to_date: toAlt } },
      { path: 'getBookedPackets/format/json/', method: 'POST', extra: { from_date: fromDate, to_date: toDate } },
      { path: 'lastPacketStatus/format/json/', method: 'POST' },
      { path: 'lastPacketStatus/format/json/', method: 'GET' },
      { path: 'getPacketLastStatus/format/json/', method: 'POST' },
      { path: 'getPacketLastStatus/format/json/', method: 'GET' },
    ];
    for (const attempt of attempts) {
      try {
        const body = await this.request(parsed, attempt.path, attempt.method, attempt.extra ?? {});
        if (this.isAuthFailure(body)) throw new Error(this.authMessage(body));
        if (!this.isSuccess(body) && !this.collection(body).length) continue;
        const items = this.collection(body).map((item) => this.asListedShipment(item)).filter((item): item is ListedShipment => Boolean(item));
        if (items.length || this.isSuccess(body)) return items;
      } catch (error) {
        if (error instanceof Error && /API password|API key/.test(error.message)) throw error;
      }
    }
    throw new Error('Leopards does not expose a shipment list API. After the API password is accepted, book from Orders or refresh tracking with a CN number.');
  }

  private parseCredentials(credentials: CourierCredentials): LeopardsCredentials {
    const apiKey = this.stringValue(credentials.apiKey ?? credentials.api_key);
    const apiPassword = this.stringValue(credentials.apiPassword ?? credentials.api_password);
    const baseUrl = this.stringValue(credentials.baseUrl) || DEFAULT_BASE_URL;
    if (!apiKey) throw new Error('Leopards API key is required');
    if (!apiPassword) throw new Error('Leopards API password is required');
    const normalized = baseUrl.replace(/\/+$/, '');
    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      throw new Error('Leopards base URL is invalid');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Leopards base URL must use HTTP or HTTPS');
    return { apiKey, apiPassword, baseUrl: normalized };
  }

  private async request(credentials: LeopardsCredentials, path: string, method: 'GET' | 'POST', extra: Record<string, string> = {}) {
    const payload = { api_key: credentials.apiKey, api_password: credentials.apiPassword, ...extra };
    const url = `${credentials.baseUrl}/${path.replace(/^\//, '')}`;
    const response = method === 'GET'
      ? await fetch(`${url}?${new URLSearchParams(payload)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
      : await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(payload),
        signal: AbortSignal.timeout(30_000),
      });
    const body = await this.readBody(response);
    if (response.status === 401 || response.status === 403) throw new Error('Leopards rejected the provided API credentials');
    if (!response.ok && !this.collection(body).length && !this.isSuccess(body)) {
      throw new Error(this.errorMessage(body) || `Leopards request failed (${response.status})`);
    }
    return body;
  }

  private async readBody(response: Response): Promise<Record<string, unknown>> {
    const payload: unknown = await response.json().catch(() => ({}));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : { packet_list: payload };
  }

  private assertSuccess(body: Record<string, unknown>, operation: string) {
    if (this.isAuthFailure(body)) throw new Error('Leopards rejected the provided API credentials');
    if (!this.isSuccess(body) && !this.collection(body).length) {
      throw new Error(this.errorMessage(body) || `Leopards failed to ${operation}`);
    }
  }

  private isSuccess(body: Record<string, unknown>) {
    const status = body.status;
    return status === 1 || status === '1' || status === true || status === 'true' || Number(body.statusCode) === 200;
  }

  private isAuthFailure(body: Record<string, unknown>) {
    const message = `${this.errorMessage(body)} ${String(body.status ?? '')}`.toLowerCase();
    return /invalid.{0,20}(api|credential|key|password)|unauthor|auth/.test(message);
  }

  private authMessage(body: Record<string, unknown>) {
    const error = (this.errorMessage(body) ?? '').toLowerCase();
    if (error.includes('invalid api password') && !error.includes('key')) {
      return 'Leopards rejected the API password. Open Leopards merchant portal → API Settings → API Management, copy the API password (not the login password), then click Update on Leopards.';
    }
    if (error.includes('invalid api key') && !error.includes('password')) {
      return 'Leopards rejected the API key. Paste the API key from API Settings → API Management.';
    }
    if (error.includes('invalid api')) {
      return 'Leopards rejected these credentials. Use the API key and API password from API Settings → API Management, not the portal login password.';
    }
    return this.errorMessage(body) || 'Leopards rejected the provided API credentials';
  }

  private errorMessage(body: Record<string, unknown>) {
    const value = body.error ?? body.error_msg ?? body.message ?? body.Error;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ');
    return undefined;
  }

  private collection(body: Record<string, unknown>) {
    const candidates = [body.packet_list, body.packetList, body.booked_packets, body.packets, body.data, body.dist, body.result];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
      }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const nested = candidate as Record<string, unknown>;
        for (const key of ['packet_list', 'list', 'packets', 'items', 'data']) {
          if (Array.isArray(nested[key])) {
            return nested[key].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
          }
        }
      }
    }
    return [] as Record<string, unknown>[];
  }

  parseWebhookEvent(payload: Record<string, unknown>): ListedShipment | null {
    const candidate = this.unwrapWebhookPayload(payload);
    return candidate ? this.asListedShipment(candidate) : null;
  }

  private unwrapWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of ['data', 'packet', 'shipment', 'consignment', 'result']) {
      const nested = payload[key];
      if (Array.isArray(nested) && nested.length && typeof nested[0] === 'object' && nested[0]) return nested[0] as Record<string, unknown>;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) return nested as Record<string, unknown>;
    }
    return payload;
  }

  private asListedShipment(item: Record<string, unknown>): ListedShipment | null {
    const trackingNumber = this.value(item, ['track_number', 'trackingNumber', 'tracking_number', 'cn', 'cn_number', 'cn_no', 'consignment_no', 'booked_packet_cn', 'slip_no']);
    if (!trackingNumber) return null;
    return {
      trackingNumber,
      shipmentReference: this.value(item, ['booked_packet_id', 'packet_id', 'track_number']) ?? trackingNumber,
      orderReference: this.value(item, ['booked_packet_order_id', 'order_id', 'merchant_order_id']),
      status: this.mapStatus(this.value(item, ['booked_packet_status', 'status', 'packet_status', 'current_status']) ?? 'PENDING'),
      customerName: this.value(item, ['consignment_name_eng', 'consignee_name', 'consignment_name', 'customer_name']),
      customerPhone: this.value(item, ['consignment_phone', 'consignee_phone', 'phone']),
      city: this.value(item, ['destination_city_name', 'destination_city', 'city', 'consignee_city']),
      address: this.value(item, ['consignment_address', 'consignee_address', 'address']),
      bookedAt: this.dateValue(item, ['booking_date', 'booked_packet_date', 'created_at', 'packet_date']),
      deliveredAt: this.dateValue(item, ['delivery_date', 'delivered_date']),
      raw: item,
    };
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private formatDateAlt(value: Date) {
    const [year, month, day] = this.formatDate(value).split('-');
    return `${day}-${month}-${year}`;
  }

  private dateValue(item: Record<string, unknown>, keys: string[]) {
    const value = this.value(item, keys);
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private value(body: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  }

  private mapStatus(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const statuses: Record<string, string> = {
      booked: 'LABEL_CREATED',
      booking: 'LABEL_CREATED',
      created: 'LABEL_CREATED',
      pending: 'PENDING',
      pickup: 'PICKED_UP',
      picked_up: 'PICKED_UP',
      assigned: 'PICKED_UP',
      in_transit: 'IN_TRANSIT',
      dispatched: 'IN_TRANSIT',
      arrival: 'IN_TRANSIT',
      arrived: 'IN_TRANSIT',
      warehouse: 'IN_TRANSIT',
      at_hub: 'IN_TRANSIT',
      out_for_delivery: 'OUT_FOR_DELIVERY',
      ofd: 'OUT_FOR_DELIVERY',
      delivered: 'DELIVERED',
      cancelled: 'CANCELLED',
      canceled: 'CANCELLED',
      returned: 'RETURNED',
      return: 'RETURNED',
      failed: 'FAILED',
    };
    return statuses[normalized] ?? 'PENDING';
  }
}
