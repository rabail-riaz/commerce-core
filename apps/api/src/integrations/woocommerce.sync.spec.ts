import { WooCommerceAdapter } from './woocommerce.adapter';

describe('WooCommerceAdapter pagination', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reads WooCommerce page metadata and requests the requested page size', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('[{"id":1}]', {
      status: 200,
      headers: { 'x-wp-totalpages': '3' },
    }));

    const result = await new WooCommerceAdapter().fetchCollection(
      { url: 'https://shop.example.com', key: 'ck_key', secret: 'cs_secret' },
      'products',
      2,
      100,
    );

    expect(result).toEqual({ items: [{ id: 1 }], hasMore: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://shop.example.com/wp-json/wc/v3/products?page=2&per_page=100',
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });
});
