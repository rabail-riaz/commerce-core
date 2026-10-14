import { LeopardsAdapter } from './leopards.adapter';

describe('LeopardsAdapter', () => {
  const originalFetch = global.fetch;
  const credentials = { apiKey: 'lcs-key', apiPassword: 'lcs-pass' };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('validates credentials against getAllCities', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 1, city_list: [{ id: 1, name: 'Lahore' }] }), { status: 200 }));
    await expect(new LeopardsAdapter().validateCredentials(credentials)).resolves.toEqual(expect.objectContaining({ valid: true }));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://merchantapi.leopardscourier.com/api/getAllCities/format/json/?'),
      expect.objectContaining({ method: 'GET' }),
    );
    const url = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toContain('api_key=lcs-key');
    expect(url).toContain('api_password=lcs-pass');
  });

  it('rejects invalid Leopards credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 0, error: 'Invalid API Key or Password' }), { status: 200 }));
    await expect(new LeopardsAdapter().validateCredentials(credentials)).resolves.toEqual(expect.objectContaining({
      valid: false,
      message: expect.stringContaining('API key and API password'),
    }));
  });

  it('lists booked packets without exposing credentials', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, city_list: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1,
        packet_list: [{
          track_number: 'LE12345678',
          booked_packet_order_id: 'ORD-9',
          booked_packet_status: 'In Transit',
          consignment_name_eng: 'Ali',
          destination_city_name: 'Karachi',
        }],
      }), { status: 200 }));

    const items = await new LeopardsAdapter().listShipments(credentials);
    expect(items).toEqual([expect.objectContaining({
      trackingNumber: 'LE12345678',
      orderReference: 'ORD-9',
      status: 'IN_TRANSIT',
      city: 'Karachi',
    })]);
    expect(JSON.stringify(items)).not.toContain('lcs-key');
    expect(JSON.stringify(items)).not.toContain('lcs-pass');
  });

  it('falls through to lastPacketStatus when the date-range endpoint is missing', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, city_list: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 1,
        packet_list: [{ track_number: 'LE999', booked_packet_status: 'Delivered' }],
      }), { status: 200 }));

    const items = await new LeopardsAdapter().listShipments(credentials);
    expect(items).toEqual([expect.objectContaining({ trackingNumber: 'LE999', status: 'DELIVERED' })]);
  });

  it('explains an invalid API password instead of treating connect as a live list', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 0, error: 'Invalid API Password' }), { status: 200 }));
    await expect(new LeopardsAdapter().listShipments(credentials)).rejects.toThrow('API password');
  });

  it('tracks a packet by CN', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 1,
      packet_list: [{ track_number: 'LE12345678', booked_packet_status: 'Out for Delivery' }],
    }), { status: 200 }));
    await expect(new LeopardsAdapter().trackShipment(credentials, 'LE12345678')).resolves.toEqual(
      expect.objectContaining({ trackingNumber: 'LE12345678', status: 'OUT_FOR_DELIVERY' }),
    );
  });

  it('rejects missing credentials before calling Leopards', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    await expect(new LeopardsAdapter().listShipments({ apiKey: 'only-key' })).rejects.toThrow('API password is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
