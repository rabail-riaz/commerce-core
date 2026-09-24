import { Injectable } from '@nestjs/common';
import {
  BookShipmentRequest,
  BookShipmentResult,
  CancelShipmentResult,
  CourierCredentials,
  ShipmentLabel,
  ShipmentStatusResult,
  TrackShipmentResult,
} from './courier-adapter';
import { CourierAdapterRegistry } from './courier-adapter.registry';

@Injectable()
export class CouriersService {
  constructor(private readonly adapters: CourierAdapterRegistry) {}

  async validateCredentials(code: string, credentials: CourierCredentials) {
    const adapter = this.adapters.get(code);
    if (!adapter.validateCredentials) throw new Error(`Credential validation is not supported for courier: ${code}`);
    return adapter.validateCredentials(credentials);
  }

  async bookShipment(code: string, credentials: CourierCredentials, request: BookShipmentRequest): Promise<BookShipmentResult> {
    return this.adapters.get(code).bookShipment(credentials, request);
  }

  async cancelShipment(code: string, credentials: CourierCredentials, shipmentReference: string): Promise<CancelShipmentResult> {
    return this.adapters.get(code).cancelShipment(credentials, shipmentReference);
  }

  async trackShipment(code: string, credentials: CourierCredentials, trackingNumber: string): Promise<TrackShipmentResult> {
    return this.adapters.get(code).trackShipment(credentials, trackingNumber);
  }

  async getLabel(code: string, credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentLabel> {
    return this.adapters.get(code).getLabel(credentials, shipmentReference);
  }

  async getStatus(code: string, credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentStatusResult> {
    return this.adapters.get(code).getStatus(credentials, shipmentReference);
  }
}
