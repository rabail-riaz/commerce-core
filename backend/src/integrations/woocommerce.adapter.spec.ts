import { WooCommerceAdapter } from './woocommerce.adapter';

describe('WooCommerceAdapter', () => {
  const credentials = { url: 'https://shop.example.com/', key: 'ck_valid', secret: 'cs_secret' };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reports a healthy connection for valid credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await new WooCommerceAdapter().testConnection(credentials);

    expect(result.healthy).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://shop.example.com/wp-json/wc/v3/orders?per_page=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Basic ${Buffer.from('ck_valid:cs_secret').toString('base64')}`,
        }),
      }),
    );
  });

  it('reports invalid credentials without exposing the secret', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('private response', { status: 401 }));

    const result = await new WooCommerceAdapter().testConnection(credentials);

    expect(result).toEqual(expect.objectContaining({ healthy: false, message: 'WooCommerce rejected the provided credentials' }));
    expect(JSON.stringify(result)).not.toContain('cs_secret');
  });

  it('rejects malformed credentials before making a request', async () => {
    global.fetch = jest.fn();

    const result = await new WooCommerceAdapter().testConnection({ url: 'not-a-url', key: 'key', secret: 'secret' });

    expect(result.healthy).toBe(false);
    expect(result.message).toBe('WooCommerce URL is invalid');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('verifies WooCommerce webhook signatures', () => {
    const body = Buffer.from('{"id":42}');
    const secret = 'webhook-secret';
    const signature = require('node:crypto').createHmac('sha256', secret).update(body).digest('base64');
    const adapter = new WooCommerceAdapter();

    expect(adapter.verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(adapter.verifyWebhookSignature(body, `${signature.slice(0, -2)}xx`, secret)).toBe(false);
  });
});
