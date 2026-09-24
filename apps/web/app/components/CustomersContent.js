'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const money = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value ?? 0));

export default function CustomersContent() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listCustomers({ search, ...query }).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load customers.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, query]);

  useEffect(() => {
    if (!selectedId) { setCustomer(null); return undefined; }
    let active = true;
    setDetailLoading(true);
    api.getCustomer(selectedId).then((response) => {
      if (active) setCustomer(unwrap(response));
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load customer.');
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const range = useMemo(() => result.total ? `${(query.page - 1) * query.limit + 1}-${Math.min(query.page * query.limit, result.total)} of ${result.total}` : 'No customers found', [query, result.total]);

  return (
    <>
      <div className="customers-toolbar">
        <input className="customer-search" aria-label="Search customers" placeholder="Search name, email, phone, or order..." value={search} onChange={(event) => { setSearch(event.target.value); setQuery({ ...query, page: 1 }); }} />
        <div className="orders-summary"><span>{range}</span><select aria-label="Customers per page" value={query.limit} onChange={(event) => setQuery({ ...query, page: 1, limit: Number(event.target.value) })}><option value="10">10 / page</option><option value="25">25 / page</option><option value="50">50 / page</option></select></div>
      </div>
      {error && <div className="error orders-error">{error}</div>}
      <div className="customers-panel panel">
        <div className="orders-table-wrap"><table className="orders-table customers-table"><thead><tr><th>Customer</th><th>Contact</th><th>Status</th><th>Orders</th><th>Tags</th><th>Score</th><th>Joined</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="table-message">Loading customers…</td></tr> : result.items.length === 0 ? <tr><td colSpan="7" className="table-message">No customers found.</td></tr> : result.items.map((item) => <tr className="order-row" key={item.id} onClick={() => setSelectedId(item.id)}><td><strong>{[item.firstName, item.lastName].filter(Boolean).join(' ') || 'Unnamed customer'}</strong><small>{item.id}</small></td><td>{item.email || '—'}<small>{item.phone || 'No phone'}</small></td><td><span className={`status-badge status-${String(item.status).toLowerCase()}`}>{label(item.status)}</span></td><td>{item._count?.orders ?? 0}</td><td><div className="tag-list">{item.tags?.map((tag) => <span className="tag" key={tag.id}>{tag.name}</span>)}</div></td><td>{item.score?.score ?? '—'}</td><td>{date(item.createdAt)}</td></tr>)}</tbody></table></div>
        <div className="pagination"><button className="button button-secondary" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button><span>Page {query.page} of {Math.max(result.totalPages, 1)}</span><button className="button button-secondary" disabled={query.page >= result.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button></div>
      </div>
      {selectedId && <CustomerDrawer customer={customer} loading={detailLoading} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function CustomerDrawer({ customer, loading, onClose }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="order-drawer customer-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">CUSTOMER PROFILE</p><h2>{customer ? [customer.profile.firstName, customer.profile.lastName].filter(Boolean).join(' ') || 'Unnamed customer' : 'Customer'}</h2></div><button className="drawer-close" aria-label="Close customer detail" onClick={onClose}>×</button></div>{loading || !customer ? <div className="drawer-loading">Loading customer details…</div> : <div className="drawer-body"><div className="drawer-status"><span className={`status-badge status-${String(customer.profile.status).toLowerCase()}`}>{label(customer.profile.status)}</span><span>{customer.profile.email || 'No email'}</span></div><Detail title="Profile"><strong>{customer.profile.email || 'No email'}</strong><span>{customer.profile.phone || 'No phone'}</span><span>Customer since {date(customer.profile.createdAt)}</span></Detail><div className="customer-stat-grid"><div><small>Orders</small><strong>{customer.spending.orderCount}</strong></div><div><small>Spending</small><strong>{money(customer.spending.total, customer.spending.currency)}</strong></div><div><small>Score</small><strong>{customer.score?.score ?? '—'}</strong></div></div><button className="button button-secondary" onClick={() => api.recalculateScore(customer.id).then(() => window.location.reload())}>Recalculate score</button><Detail title="Tags"><div className="tag-list">{customer.tags?.length ? customer.tags.map((tag) => <span className="tag" key={tag.id}>{tag.name}</span>) : <span>No tags</span>}</div></Detail><Detail title="Order history">{customer.orders?.length ? customer.orders.map((order) => <div className="customer-order" key={order.id}><div><strong>{order.externalOrderId}</strong><span>{date(order.createdAt)} · {label(order.paymentStatus)}</span></div><div><StatusBadge status={order.status} /><strong>{money(order.totalAmount, order.currency)}</strong></div></div>) : <span>No orders yet.</span>}</Detail><Detail title="Returns">{customer.returns?.length ? customer.returns.map((item) => <span key={item.id}>{label(item.status)} · {item.reason || 'No reason'}</span>) : <span>No returns recorded.</span>}</Detail><Detail title="Shipments">{customer.shipments?.length ? customer.shipments.map((item) => <span key={item.id}>{item.trackingNumber || item.id} · {label(item.status)}</span>) : <span>No shipments recorded.</span>}</Detail><Detail title="Tickets">{customer.tickets?.length ? customer.tickets.map((item) => <span key={item.id}>{item.subject} · {label(item.status)}</span>) : <span>No tickets recorded.</span>}</Detail><Detail title="WhatsApp">{customer.whatsapp?.length ? customer.whatsapp.map((item) => <span key={item.id}>{item.customerPhone}</span>) : <span>No WhatsApp conversations recorded.</span>}</Detail><Detail title="Email">{customer.email?.length ? customer.email.map((item) => <span key={item.id}>{item.subject || 'No subject'}</span>) : <span>No email conversations recorded.</span>}</Detail><Detail title="Notes">{customer.notes?.length ? customer.notes.map((item) => <span key={item.id}>{item.body}</span>) : <span>No notes recorded.</span>}</Detail><Detail title="Addresses">{customer.addresses?.length ? customer.addresses.map((address) => <span key={address.id}>{[address.addressLine1, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(', ')}</span>) : <span>No addresses recorded.</span>}</Detail></div>}</aside></div>;
}

function Detail({ title, children }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-content">{children}</div></section>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${String(status).toLowerCase()}`}>{label(status)}</span>;
}
