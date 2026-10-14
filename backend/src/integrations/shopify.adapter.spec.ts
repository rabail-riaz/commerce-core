import { ShopifyAdapter } from './shopify.adapter';

describe('ShopifyAdapter', () => {
  const credentials = { shop: 'https://demo.myshopify.com/', accessToken: 'shpat_secret' };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reports a healthy connection for valid credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"shop":{"id":1}}', { status: 200 }));
    const result = await new ShopifyAdapter().testConnection(credentials);
    expect(result.healthy).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://demo.myshopify.com/admin/api/2024-10/shop.json',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Shopify-Access-Token': 'shpat_secret' }),
      }),
    );
  });

  it('does not leak the access token on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('denied', { status: 401 }));
    const result = await new ShopifyAdapter().testConnection(credentials);
    expect(result.healthy).toBe(false);
    expect(JSON.stringify(result)).not.toContain('shpat_secret');
  });
});
