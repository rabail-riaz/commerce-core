export type CourierCredentials = Record<string, unknown>;

export type ShipmentAddress = {
  name: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
};

export type BookShipmentRequest = {
  orderId: string;
  recipient: ShipmentAddress;
  package: {
    weight: number;
    weightUnit?: string;
    length?: number;
    width?: number;
    height?: number;
    dimensionUnit?: string;
  };
  serviceLevel?: string;
  metadata?: Record<string, unknown>;
};

export type BookShipmentResult = {
  shipmentReference: string;
  trackingNumber?: string;
  labelUrl?: string;
  status: string;
  raw?: Record<string, unknown>;
};

export type CancelShipmentResult = {
  cancelled: boolean;
  status: string;
  raw?: Record<string, unknown>;
};

export type TrackShipmentResult = {
  trackingNumber: string;
  status: string;
  events: Array<{ status: string; occurredAt?: Date; note?: string }>;
  raw?: Record<string, unknown>;
};

export type ShipmentLabel = {
  trackingNumber?: string;
  contentType: string;
  content: string;
  raw?: Record<string, unknown>;
};

export type ShipmentStatusResult = {
  shipmentReference: string;
  status: string;
  raw?: Record<string, unknown>;
};

export type ListedShipment = {
  trackingNumber: string;
  shipmentReference?: string;
  orderReference?: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  city?: string;
  address?: string;
  bookedAt?: Date;
  deliveredAt?: Date;
  raw?: Record<string, unknown>;
};

export type ListShipmentsRange = {
  from?: Date;
  to?: Date;
};

export interface CourierAdapter {
  readonly code: string;
  validateCredentials?(credentials: CourierCredentials): Promise<{ valid: boolean; message: string }>;
  listShipments?(credentials: CourierCredentials, range?: ListShipmentsRange): Promise<ListedShipment[]>;
  bookShipment(credentials: CourierCredentials, request: BookShipmentRequest): Promise<BookShipmentResult>;
  cancelShipment(credentials: CourierCredentials, shipmentReference: string): Promise<CancelShipmentResult>;
  trackShipment(credentials: CourierCredentials, trackingNumber: string): Promise<TrackShipmentResult>;
  getLabel(credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentLabel>;
  getStatus(credentials: CourierCredentials, shipmentReference: string): Promise<ShipmentStatusResult>;
  /** Parses a courier's webhook/push payload into a shipment update. Return null when the payload doesn't resolve to a shipment. */
  parseWebhookEvent?(payload: Record<string, unknown>): ListedShipment | null;
}
