'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const money = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value ?? 0));

export default function ProductsContent() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ page: 1, limit: 12 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listProducts({ search, ...query }).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load products.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, query, reloadToken]);

  useEffect(() => {
    if (!selectedId) { setProduct(null); return undefined; }
    let active = true;
    setDetailLoading(true);
    api.getProduct(selectedId).then((response) => {
      if (active) setProduct(unwrap(response));
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load product.');
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  async function syncProducts() {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const response = await api.listIntegrations({ page: 1, limit: 50 });
      const items = unwrap(response)?.items ?? [];
      const store = items.find((item) => ['WOOCOMMERCE', 'SHOPIFY'].includes(item.provider) && item.status === 'ACTIVE');
      if (!store) {
        setError('Connect a store (WooCommerce or Shopify) in Integrations first, then sync products.');
        return;
      }
      const result = unwrap(await api.syncIntegrationProducts(store.id));
      setMessage(`Synced ${result.synced ?? 0} product${(result.synced ?? 0) === 1 ? '' : 's'} from your store.`);
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to sync products.');
    } finally {
      setSyncing(false);
    }
  }

  const range = useMemo(() => result.total ? `${(query.page - 1) * query.limit + 1}-${Math.min(query.page * query.limit, result.total)} of ${result.total}` : 'No products found', [query, result.total]);
  const empty = !loading && result.items.length === 0;

  return (
    <>
      <div className="customers-toolbar">
        <input className="customer-search" aria-label="Search products" placeholder="Search product, SKU, variant, or store..." value={search} onChange={(event) => { setSearch(event.target.value); setQuery({ ...query, page: 1 }); }} />
        <div className="orders-summary">
          <span>{range}</span>
          <select aria-label="Products per page" value={query.limit} onChange={(event) => setQuery({ ...query, page: 1, limit: Number(event.target.value) })}><option value="12">12 / page</option><option value="24">24 / page</option><option value="48">48 / page</option></select>
          <button className="button" type="button" disabled={syncing} onClick={syncProducts}>{syncing ? 'Syncing…' : 'Sync products'}</button>
        </div>
      </div>
      {message && <div className="success orders-error">{message}</div>}
      {error && <div className="error orders-error">{error}</div>}
      {loading ? (
        <div className="product-grid">{Array.from({ length: query.limit }).map((_, index) => <div className="product-card product-card-skeleton" key={index} />)}</div>
      ) : empty ? (
        <div className="empty-state">
          <div className="empty-icon">□</div>
          <h2>No products found</h2>
          <p>Connect a store in Integrations and sync your catalog, or adjust your search.</p>
        </div>
      ) : (
        <div className="product-grid">
          {result.items.map((item) => (
            <button type="button" className="product-card" key={item.id} onClick={() => setSelectedId(item.id)}>
              <ProductImage src={item.imageUrl} alt={item.name} />
              <div className="product-card-body">
                <span className={`status-badge product-card-status status-${String(item.status).toLowerCase()}`}>{label(item.status)}</span>
                <strong className="product-card-name">{item.name}</strong>
                <span className="product-card-store">{item.store?.name || 'Unassigned store'}</span>
                <div className="product-card-footer">
                  <strong className="product-card-price"><PriceRange product={item} /></strong>
                  <small>{stockLabel(item)}</small>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {!empty && (
        <div className="pagination"><button className="button button-secondary" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button><span>Page {query.page} of {Math.max(result.totalPages, 1)}</span><button className="button button-secondary" disabled={query.page >= result.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button></div>
      )}
      {selectedId && <ProductDrawer product={product} loading={detailLoading} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function ProductImage({ src, alt, large }) {
  const [broken, setBroken] = useState(false);
  const className = large ? 'product-image product-image-large' : 'product-image';
  if (!src || broken) return <div className={`${className} product-image-placeholder`}>□</div>;
  return <img className={className} src={src} alt={alt || ''} loading="lazy" onError={() => setBroken(true)} />;
}

function PriceRange({ product }) {
  const variants = product.variants;
  if (!variants?.length) {
    if (product.price === null || product.price === undefined) return <span>—</span>;
    return <span>{money(product.price, product.currency)}</span>;
  }
  const prices = variants.map((variant) => Number(variant.price));
  const currency = variants[0].currency || 'USD';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return <span>{min === max ? money(min, currency) : `${money(min, currency)} – ${money(max, currency)}`}</span>;
}

function stockLabel(item) {
  if (item.stockQuantity !== null && item.stockQuantity !== undefined) {
    return item.stockQuantity > 0 ? `${item.stockQuantity} in stock` : 'Out of stock';
  }
  if (item.stockStatus === 'instock') return 'In stock';
  if (item.stockStatus === 'outofstock') return 'Out of stock';
  if (item.stockStatus === 'onbackorder') return 'On backorder';
  const variantCount = item._count?.variants ?? item.variants?.length ?? 0;
  return `${variantCount} variant${variantCount === 1 ? '' : 's'} · ${item._count?.orderItems ?? 0} sold`;
}

function ProductDrawer({ product, loading, onClose }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer product-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><p className="eyebrow">PRODUCT DETAIL</p><h2>{product?.name || 'Product'}</h2></div>
          <button className="drawer-close" aria-label="Close product detail" onClick={onClose}>×</button>
        </div>
        {loading || !product ? <div className="drawer-loading">Loading product details…</div> : (
          <div className="drawer-body">
            <ProductImage src={product.imageUrl} alt={product.name} large />
            <div className="drawer-status">
              <span className={`status-badge status-${String(product.status).toLowerCase()}`}>{label(product.status)}</span>
              <span>{product.store?.name || 'No store assigned'}</span>
            </div>
            <Detail title="Product">
              <strong>{product.description || 'No description'}</strong>
              <span>Source store: {product.store?.name || 'Unassigned'}</span>
              <span>SKU: {product.sku || '—'}</span>
              {!product.variants?.length && <span>Price: <PriceRange product={product} /></span>}
              {(product.stockQuantity !== null && product.stockQuantity !== undefined || product.stockStatus) && <span>Stock: {stockLabel(product)}</span>}
              <span>Created {date(product.createdAt)}</span>
            </Detail>
            <Detail title="Variants">
              {product.variants?.length ? product.variants.map((variant) => (
                <div className="variant-line" key={variant.id}>
                  <div><strong>{variant.name || 'Default variant'}</strong><span>{variant.sku || 'No SKU'}</span></div>
                  <strong>{money(variant.price, variant.currency)}</strong>
                </div>
              )) : <span>No variants recorded.</span>}
            </Detail>
            <Detail title="Catalog relationships">
              <div className="detail-grid">
                <span>Order line items</span><strong>{product._count?.orderItems ?? 0}</strong>
                <span>Variants</span><strong>{product._count?.variants ?? product.variants?.length ?? 0}</strong>
              </div>
            </Detail>
          </div>
        )}
      </aside>
    </div>
  );
}

function Detail({ title, children }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-content">{children}</div></section>;
}
