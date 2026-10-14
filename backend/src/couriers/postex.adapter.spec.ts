import { PostExAdapter } from './postex.adapter';

describe('PostExAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('books and maps a shipment without exposing the token', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      status: true,
      dist: { trackingNumber: 'PX-123', orderRefNumber: 'order-1' },
      orderStatus: 'Booked',
    }), { status: 200 }));

    const result = await new PostExAdapter().bookShipment(
      { token: 'sandbox-token', baseUrl: 'https://sandbox.postex.test' },
      {
        orderId: 'order-1',
        recipient: { name: 'Test', phone: '03001234567', addressLine1: '1 Main', city: 'Lahore', country: 'PK' },
        package: { weight: 1 },
        metadata: { orderAmount: 1000 },
      },
    );

    expect(result).toEqual(expect.objectContaining({
      shipmentReference: 'PX-123',
      trackingNumber: 'PX-123',
      status: 'LABEL_CREATED',
    }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://sandbox.postex.test/services/integration/api/order/v3/create-order',
      expect.objectContaining({
        headers: expect.objectContaining({ token: 'sandbox-token' }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('sandbox-token');
  });

  it('lists merchant shipments without exposing the token', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: '200',
      dist: [{ trackingNumber: 'PX-123', orderRefNumber: 'order-1', transactionStatus: 'In Transit', customerName: 'Ali', cityName: 'Lahore' }],
    }), { status: 200 }));

    const items = await new PostExAdapter().listShipments({ token: 'sandbox-token' });
    expect(items).toEqual([expect.objectContaining({ trackingNumber: 'PX-123', orderReference: 'order-1', status: 'IN_TRANSIT', city: 'Lahore' })]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/services/integration/api/order/v1/get-all-order'),
      expect.objectContaining({ headers: expect.objectContaining({ token: 'sandbox-token' }) }),
    );
    expect(JSON.stringify(items)).not.toContain('sandbox-token');
  });

  it('tracks and maps provider status', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      status: true,
      trackingStatus: 'Out For Delivery',
    }), { status: 200 }));

    await expect(new PostExAdapter().trackShipment(
      { token: 'sandbox-token', baseUrl: 'https://sandbox.postex.test' },
      'PX-123',
    )).resolves.toEqual(expect.objectContaining({ trackingNumber: 'PX-123', status: 'OUT_FOR_DELIVERY' }));
  });

  it('rejects unsupported label retrieval explicitly', async () => {
    await expect(new PostExAdapter().getLabel({ token: 'sandbox-token' }, 'PX-123'))
      .rejects.toThrow('does not expose label retrieval');
  });

  it('rejects invalid credentials before making a request', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(new PostExAdapter().bookShipment({}, {
      orderId: 'order-1',
      recipient: { name: 'Test', addressLine1: '1 Main', city: 'Lahore', country: 'PK' },
      package: { weight: 1 },
    })).rejects.toThrow('PostEx token is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates credentials against merchant addresses', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"status":true}', { status: 200 }));
    await expect(new PostExAdapter().validateCredentials({ apiKey: 'sandbox-token' })).resolves.toEqual(expect.objectContaining({ valid: true }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.postex.pk/services/integration/api/order/v1/get-merchant-address',
      expect.objectContaining({ headers: expect.objectContaining({ token: 'sandbox-token' }) }),
    );
  });

  it('rejects a malformed PostEx token instead of treating server errors as success', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"status":500}', { status: 500 }));
    await expect(new PostExAdapter().validateCredentials({ token: 'not-a-token' })).resolves.toEqual(expect.objectContaining({
      valid: false,
      message: expect.stringContaining('full merchant API token'),
    }));
  });
});
