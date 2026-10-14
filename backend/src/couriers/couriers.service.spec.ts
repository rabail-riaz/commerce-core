import { PrismaService } from '../prisma/prisma.service';
import { BookShipmentRequest, CourierAdapter } from './courier-adapter';
import { CourierAdapterRegistry } from './courier-adapter.registry';
import { CouriersService } from './couriers.service';

describe('CouriersService', () => {
  const request: BookShipmentRequest = {
    orderId: 'order-1',
    recipient: {
      name: 'Test Customer',
      addressLine1: '1 Main Street',
      city: 'Lahore',
      country: 'PK',
    },
    package: { weight: 1 },
  };

  function setup() {
    const adapter: jest.Mocked<CourierAdapter> = {
      code: 'MOCK',
      bookShipment: jest.fn().mockResolvedValue({
        shipmentReference: 'shipment-1',
        trackingNumber: 'TRACK-1',
        status: 'BOOKED',
      }),
      cancelShipment: jest.fn().mockResolvedValue({ cancelled: true, status: 'CANCELLED' }),
      trackShipment: jest.fn().mockResolvedValue({ trackingNumber: 'TRACK-1', status: 'IN_TRANSIT', events: [] }),
      getLabel: jest.fn().mockResolvedValue({ contentType: 'application/pdf', content: 'label' }),
      getStatus: jest.fn().mockResolvedValue({ shipmentReference: 'shipment-1', status: 'DELIVERED' }),
    };
    const registry = new CourierAdapterRegistry();
    registry.register(adapter);
    return { adapter, service: new CouriersService(registry, {} as PrismaService) };
  }

  it('delegates shipment operations to the registered adapter', async () => {
    const { adapter, service } = setup();
    const credentials = { apiKey: 'test-key' };

    await expect(service.bookShipment('mock', credentials, request)).resolves.toEqual(expect.objectContaining({ trackingNumber: 'TRACK-1' }));
    await expect(service.cancelShipment('MOCK', credentials, 'shipment-1')).resolves.toEqual({ cancelled: true, status: 'CANCELLED' });
    await expect(service.trackShipment('mock', credentials, 'TRACK-1')).resolves.toEqual(expect.objectContaining({ status: 'IN_TRANSIT' }));
    await expect(service.getLabel('mock', credentials, 'shipment-1')).resolves.toEqual(expect.objectContaining({ content: 'label' }));
    await expect(service.getStatus('mock', credentials, 'shipment-1')).resolves.toEqual({ shipmentReference: 'shipment-1', status: 'DELIVERED' });

    expect(adapter.bookShipment).toHaveBeenCalledWith(credentials, request);
    expect(adapter.cancelShipment).toHaveBeenCalledWith(credentials, 'shipment-1');
    expect(adapter.trackShipment).toHaveBeenCalledWith(credentials, 'TRACK-1');
    expect(adapter.getLabel).toHaveBeenCalledWith(credentials, 'shipment-1');
    expect(adapter.getStatus).toHaveBeenCalledWith(credentials, 'shipment-1');
  });

  it('exposes the Pakistan courier catalog for configuration', () => {
    const { service } = setup();
    const catalog = service.listCatalog();
    expect(catalog.map((courier) => courier.code)).toEqual(expect.arrayContaining(['TCS', 'LEOPARDS', 'TRAX', 'POSTEX', 'RIDER', 'CALLCOURIER', 'BLUEEX']));
    expect(catalog.length).toBeGreaterThanOrEqual(20);
  });

  it('rejects unsupported providers without provider-specific business logic', async () => {
    const { service } = setup();

    await expect(service.getStatus('unknown', {}, 'shipment-1')).rejects.toThrow('Unsupported courier adapter: unknown');
  });
});
