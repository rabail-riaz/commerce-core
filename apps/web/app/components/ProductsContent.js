'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const money = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value ?? 0));

export default function ProductsContent() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listProducts({ search, ...query }).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load products.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, query]);

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

  const range = useMemo(() => result.total ? `${(query.page - 1) * query.limit + 1}-${Math.min(query.page * query.limit, result.total)} of ${result.total}` : 'No products found', [query, result.total]);

  return (
    <>
      <div className="customers-toolbar">
        <input className="customer-search" aria-label="Search products" placeholder="Search product, SKU, variant, or store..." value={search} onChange={(event) => { setSearch(event.target.value); setQuery({ ...query, page: 1 }); }} />
        <div className="orders-summary"><span>{range}</span><select aria-label="Products per page" value={query.limit} onChange={(event) => setQuery({ ...query, page: 1, limit: Number(event.target.value) })}><option value="10">10 / page</option><option value="25">25 / page</option><option value="50">50 / page</option></select></div>
      </div>
      {error && <div className="error orders-error">{error}</div>}
      <div className="customers-panel panel">
        <div className="orders-table-wrap"><table className="orders-table customers-table"><thead><tr><th>Product</th><th>Store / source</th><th>Status</th><th>Variants</th><th>Price range</th><th>Orders</th><th>Updated</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="table-message">Loading products…</td></tr> : result.items.length === 0 ? <tr><td colSpan="7" className="table-message">No products found.</td></tr> : result.items.map((item) => <tr className="order-row" key={item.id} onClick={() => setSelectedId(item.id)}><td><strong>{item.name}</strong><small>{item.description || 'No description'}</small></td><td>{item.store?.name || 'Unassigned'}<small>{item.store ? 'Normalized store catalog' : 'No store assigned'}</small></td><td><span className={`status-badge status-${String(item.status).toLowerCase()}`}>{label(item.status)}</span></td><td>{item._count?.variants ?? item.variants?.length ?? 0}</td><td><PriceRange variants={item.variants} /></td><td>{item._count?.orderItems ?? 0}</td><td>{date(item.updatedAt)}</td></tr>)}</tbody></table></div>
        <div className="pagination"><button className="button button-secondary" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button><span>Page {query.page} of {Math.max(result.totalPages, 1)}</span><button className="button button-secondary" disabled={query.page >= result.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button></div>
      </div>
      {selectedId && <ProductDrawer product={product} loading={detailLoading} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function PriceRange({ variants }) {
  if (!variants?.length) return <span>—</span>;
  const prices = variants.map((variant) => Number(variant.price));
  const currency = variants[0].currency || 'USD';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return <span>{min === max ? money(min, currency) : `${money(min, currency)} – ${money(max, currency)}`}</span>;
}

function ProductDrawer({ product, loading, onClose }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="order-drawer product-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">PRODUCT DETAIL</p><h2>{product?.name || 'Product'}</h2></div><button className="drawer-close" aria-label="Close product detail" onClick={onClose}>×</button></div>{loading || !product ? <div className="drawer-loading">Loading product details…</div> : <div className="drawer-body"><div className="drawer-status"><span className={`status-badge status-${String(product.status).toLowerCase()}`}>{label(product.status)}</span><span>{product.store?.name || 'No store assigned'}</span></div><Detail title="Product"><strong>{product.description || 'No description'}</strong><span>Source store: {product.store?.name || 'Unassigned'}</span><span>Created {date(product.createdAt)}</span></Detail><Detail title="Variants">{product.variants?.length ? product.variants.map((variant) => <div className="variant-line" key={variant.id}><div><strong>{variant.name || 'Default variant'}</strong><span>{variant.sku || 'No SKU'}</span></div><strong>{money(variant.price, variant.currency)}</strong></div>) : <span>No variants recorded.</span>}</Detail><Detail title="Catalog relationships"><div className="detail-grid"><span>Order line items</span><strong>{product._count?.orderItems ?? 0}</strong><span>Variants</span><strong>{product._count?.variants ?? product.variants?.length ?? 0}</strong></div></Detail></div>}</aside></div>;
}

function Detail({ title, children }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-content">{children}</div></section>;
}
