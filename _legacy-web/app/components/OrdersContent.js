'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const statuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'CANCELLED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'FAILED'];

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
const formatMoney = (value, currency = 'USD') => {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || ''}`.trim();
  }
};

function ordinal(value) {
  const n = Number(value) || 0;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = n % 100;
  return `${n}${suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]}`;
}

const ratingCopy = {
  VIP: { text: 'VIP customer', className: 'status-delivered' },
  GOOD: { text: 'Good customer', className: 'status-delivered' },
  STANDARD: { text: 'Standard customer', className: 'status-confirmed' },
  HIGH_RISK: { text: 'High risk customer', className: 'status-cancelled' },
};

function addressText(address) {
  if (!address || typeof address !== 'object') return 'No address provided';
  const firstName = address.firstName || address.first_name;
  const lastName = address.lastName || address.last_name;
  return [
    firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName,
    address.addressLine1 || address.address_1,
    address.addressLine2 || address.address_2,
    address.city,
    address.state,
    address.postalCode || address.postcode,
    address.country,
    address.phone,
  ].filter(Boolean).join(', ') || 'No address provided';
}

export default function OrdersContent() {
  const [filters, setFilters] = useState({ search: '', status: '', city: '', dateFrom: '', dateTo: '' });
  const [query, setQuery] = useState({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const hasFilters = Boolean(filters.search || filters.status || filters.city || filters.dateFrom || filters.dateTo);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listOrders({ ...filters, ...query }).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load orders.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, query, reloadToken]);

  useEffect(() => {
    if (!selectedId) { setSelectedOrder(null); return undefined; }
    let active = true;
    setDetailLoading(true);
    api.getOrder(selectedId).then((response) => {
      if (active) setSelectedOrder(unwrap(response));
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load order details.');
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, reloadToken]);

  const pageLabel = useMemo(() => {
    if (!result.total) return 'No orders found';
    const start = (query.page - 1) * query.limit + 1;
    return `${start}-${Math.min(query.page * query.limit, result.total)} of ${result.total}`;
  }, [query, result.total]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setQuery((current) => ({ ...current, page: 1 }));
  }

  function clearFilters() {
    setFilters({ search: '', status: '', city: '', dateFrom: '', dateTo: '' });
    setQuery((current) => ({ ...current, page: 1 }));
  }

  function sortBy(sortBy) {
    setQuery((current) => ({ ...current, page: 1, sortBy, sortOrder: current.sortBy === sortBy && current.sortOrder === 'desc' ? 'asc' : 'desc' }));
  }

  async function pullFromWoo() {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const response = await api.listIntegrations({ page: 1, limit: 50 });
      const items = unwrap(response)?.items ?? [];
      const woo = items.find((item) => item.provider === 'WOOCOMMERCE' && item.status === 'ACTIVE') || items.find((item) => item.provider === 'WOOCOMMERCE');
      if (!woo) {
        setError('Connect WooCommerce in Integrations first, then pull orders.');
        return;
      }
      const sync = unwrap(await api.syncIntegration(woo.id));
      setMessage(sync.completed
        ? `Imported ${sync.recordsSynced ?? 0} WooCommerce records.`
        : 'WooCommerce sync started. Refresh in a moment.');
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to import WooCommerce orders.');
    } finally {
      setSyncing(false);
    }
  }

  const empty = !loading && result.items.length === 0;

  return (
    <>
      <div className="orders-toolbar">
        <div className="orders-filters">
          <input aria-label="Search orders" placeholder="Search order, customer, SKU..." value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
          <select aria-label="Filter by status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
          <input aria-label="Filter by city" placeholder="City" value={filters.city} onChange={(event) => updateFilter('city', event.target.value)} />
          <input aria-label="Orders from date" type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} />
          <input aria-label="Orders to date" type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} />
          <button className="button button-secondary" type="button" onClick={clearFilters}>Clear</button>
          <button className="button" type="button" disabled={syncing} onClick={pullFromWoo}>{syncing ? 'Importing…' : 'Pull WooCommerce orders'}</button>
        </div>
        <div className="orders-summary"><span>{pageLabel}</span><select aria-label="Orders per page" value={query.limit} onChange={(event) => setQuery({ ...query, page: 1, limit: Number(event.target.value) })}><option value="10">10 / page</option><option value="25">25 / page</option><option value="50">50 / page</option></select></div>
      </div>
      {message && <div className="success orders-error">{message}</div>}
      {error && <div className="error orders-error">{error}</div>}
      {empty && !hasFilters ? (
        <div className="empty-state">
          <div className="empty-icon">▤</div>
          <h2>No orders yet</h2>
          <p>Connect WooCommerce in Integrations, then import orders here. New and updated Woo orders will appear in this list with customer, items, payment, and status.</p>
          <div className="orders-empty-actions">
            <Link href="/integrations" className="button">Connect WooCommerce</Link>
            <button className="button button-secondary" type="button" disabled={syncing} onClick={pullFromWoo}>{syncing ? 'Importing…' : 'Pull orders now'}</button>
          </div>
        </div>
      ) : (
        <div className="orders-panel panel">
          <div className="orders-table-wrap">
            <table className="orders-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Store</th><th><SortButton label="Status" field="status" query={query} onSort={sortBy} /></th><th>Payment</th><th>Tracking</th><th><SortButton label="Amount" field="totalAmount" query={query} onSort={sortBy} /></th><th><SortButton label="Created" field="createdAt" query={query} onSort={sortBy} /></th></tr></thead>
              <tbody>{loading ? <tr><td colSpan="8" className="table-message">Loading orders…</td></tr> : result.items.length === 0 ? <tr><td colSpan="8" className="table-message">No orders match these filters.</td></tr> : result.items.map((order) => <tr key={order.id} className="order-row" onClick={() => setSelectedId(order.id)}><td><strong>#{order.externalOrderId}</strong><small>{label(order.sourceProvider)}</small></td><td>{[order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || order.customer?.email || 'Guest'}<small>{order.customerPhone || order.customer?.email || '—'}</small><CustomerInsightLine insights={order.customerInsights} /></td><td>{order.store?.name || '—'}</td><td><StatusBadge status={order.status} /></td><td><StatusBadge status={order.paymentStatus} /><small>{label(order.paymentMethod)}</small></td><td><TrackingCell shipment={order.shipment} /></td><td><strong>{formatMoney(order.totalAmount, order.currency)}</strong></td><td>{formatDate(order.createdAt)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="pagination"><button className="button button-secondary" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button><span>Page {query.page} of {Math.max(result.totalPages, 1)}</span><button className="button button-secondary" disabled={query.page >= result.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button></div>
        </div>
      )}
      {selectedId && <OrderDrawer order={selectedOrder} loading={detailLoading} onClose={() => setSelectedId(null)} onChanged={() => setReloadToken((current) => current + 1)} />}
    </>
  );
}

function SortButton({ label: text, field, query, onSort }) {
  return <button className="sort-button" onClick={() => onSort(field)}>{text} {query.sortBy === field ? (query.sortOrder === 'asc' ? '↑' : '↓') : ''}</button>;
}

function TrackingCell({ shipment }) {
  if (!shipment) return <span className="muted">Not booked</span>;
  return <><strong>{shipment.trackingNumber || 'Pending'}</strong><small>{shipment.courierAccount?.courier?.name || '—'}</small></>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${String(status).toLowerCase()}`}>{label(status)}</span>;
}

function OrderDrawer({ order, loading, onClose, onChanged }) {
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState(order?.status ?? '');
  const [booking, setBooking] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [bookingResult, setBookingResult] = useState(null);
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    setStatus(order?.status ?? '');
    setBookingResult(null);
    setBookingError('');
    setStatusError('');
    setReturnError('');
  }, [order?.id, order?.status]);

  async function bookShipment() {
    if (!accountId || !order) return;
    setBooking(true);
    setBookingError('');
    try {
      const response = await api.bookOrderShipment(order.id, accountId);
      setBookingResult(unwrap(response));
      onChanged?.();
    } catch (requestError) {
      setBookingError(requestError instanceof ApiError ? requestError.message : 'Unable to book shipment.');
    } finally {
      setBooking(false);
    }
  }

  async function saveStatus() {
    if (!order || !status || status === order.status) return;
    setSavingStatus(true);
    setStatusError('');
    try {
      await api.updateOrderStatus(order.id, status);
      onChanged?.();
    } catch (requestError) {
      setStatusError(requestError instanceof ApiError ? requestError.message : 'Unable to update order status.');
    } finally {
      setSavingStatus(false);
    }
  }

  async function requestReturn() {
    if (!order || !shipment) return;
    setReturning(true);
    setReturnError('');
    try {
      await api.createReturn({ orderId: order.id, shipmentId: shipment.id, reason: 'Customer return requested' });
      onChanged?.();
    } catch (requestError) {
      setReturnError(requestError instanceof ApiError ? requestError.message : 'Unable to request return.');
    } finally {
      setReturning(false);
    }
  }

  const shipment = bookingResult?.shipment || order?.shipment;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">ORDER DETAIL</p>
            <h2>#{order?.externalOrderId || 'Order'}</h2>
          </div>
          <button className="drawer-close" aria-label="Close order detail" onClick={onClose}>×</button>
        </div>
        {loading || !order ? <div className="drawer-loading">Loading order details…</div> : (
          <div className="drawer-body">
            <div className="drawer-status">
              <StatusBadge status={order.status} />
              <span>{label(order.sourceProvider)}</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
            <DetailSection title="Status">
              <div className="orders-status-form">
                <select aria-label="Update order status" value={status} onChange={(event) => setStatus(event.target.value)}>
                  {statuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                </select>
                <button className="button" type="button" disabled={!status || status === order.status || savingStatus} onClick={saveStatus}>{savingStatus ? 'Saving…' : 'Update status'}</button>
              </div>
              {statusError && <span className="error">{statusError}</span>}
            </DetailSection>
            <DetailSection title="Shipment">
              {shipment ? (
                <>
                  <span>Courier: {shipment.courierAccount?.courier?.name || 'Selected courier'}</span>
                  <strong>Tracking: {shipment.trackingNumber || 'Pending'}</strong>
                  {!shipment.return && <button className="button button-secondary" type="button" disabled={returning} onClick={requestReturn}>{returning ? 'Requesting…' : 'Request return'}</button>}
                  {returnError && <span className="error">{returnError}</span>}
                </>
              ) : (
                <>
                  <select aria-label="Select courier account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                    <option value="">Select courier</option>
                    {order.courierAccounts?.map((account) => <option key={account.id} value={account.id}>{account.courier.name} · {account.name}</option>)}
                  </select>
                  <button className="button" type="button" disabled={!accountId || booking} onClick={bookShipment}>{booking ? 'Booking…' : 'Book shipment'}</button>
                  {bookingError && <span className="error">{bookingError}</span>}
                  {!order.courierAccounts?.length && <span>No active courier accounts. Add one in Shipping to book a shipment.</span>}
                </>
              )}
            </DetailSection>
            <DetailSection title="Customer">
              <strong>{[order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || 'Guest customer'}</strong>
              <span>{order.customer?.email || 'No email'}</span>
              {(order.customerPhone || order.customer?.phone) && <span>{order.customerPhone || order.customer.phone}</span>}
              {order.customerInsights && <CustomerInsights insights={order.customerInsights} />}
            </DetailSection>
            <DetailSection title="Products">
              {order.products?.length
                ? order.products.map((item) => (
                  <div className="product-line" key={item.id}>
                    <div><strong>{item.name}</strong><span>{item.variant?.name || item.variant?.sku || item.sku || 'Standard'} · Qty {item.quantity}</span></div>
                    <strong>{formatMoney(item.totalAmount, order.amount.currency)}</strong>
                  </div>
                ))
                : <span>No line items were imported for this order.</span>}
            </DetailSection>
            <DetailSection title="Amount">
              <MoneyLine label="Subtotal" value={order.amount.subtotal} currency={order.amount.currency} />
              <MoneyLine label="Tax" value={order.amount.tax} currency={order.amount.currency} />
              <MoneyLine label="Shipping" value={order.amount.shipping} currency={order.amount.currency} />
              <MoneyLine label="Discount" value={order.amount.discount} currency={order.amount.currency} />
              <MoneyLine label="Total" value={order.amount.total} currency={order.amount.currency} total />
            </DetailSection>
            <DetailSection title="Payment">
              <div className="detail-grid">
                <span>Status</span><strong><StatusBadge status={order.payment.status} /></strong>
                <span>Method</span><strong>{label(order.payment.method) || '—'}</strong>
                <span>Reference</span><strong>{order.payment.reference || '—'}</strong>
              </div>
            </DetailSection>
            <DetailSection title="Address">
              <strong>Shipping</strong>
              <span>{addressText(order.address?.shipping)}</span>
              {order.address?.billing && <><strong className="address-label">Billing</strong><span>{addressText(order.address.billing)}</span></>}
            </DetailSection>
            <DetailSection title="Timeline">
              <div className="timeline">
                {order.timeline?.length
                  ? order.timeline.map((event) => (
                    <div className="timeline-item" key={event.id}>
                      <span className="timeline-dot" />
                      <div><strong>{label(event.status)}</strong><span>{event.note || 'Status updated'}</span><small>{formatDate(event.createdAt)}</small></div>
                    </div>
                  ))
                  : <span>No status history yet.</span>}
              </div>
            </DetailSection>
          </div>
        )}
      </aside>
    </div>
  );
}

function CustomerInsightLine({ insights }) {
  if (!insights) return null;
  const rating = ratingCopy[insights.classification] ?? ratingCopy.STANDARD;
  return (
    <small className="customer-insight-line">
      {ordinal(insights.orderNumber)} of {insights.totalOrders} · <span className={`status-badge ${rating.className}`}>{rating.text}</span>
    </small>
  );
}

function CustomerInsights({ insights }) {
  const rating = ratingCopy[insights.classification] ?? ratingCopy.STANDARD;
  return (
    <div className="customer-insights">
      <span>This is their {ordinal(insights.orderNumber)} order of {insights.totalOrders} total.</span>
      <span>{insights.priorReturns > 0 ? `Returned ${insights.priorReturns} previous order${insights.priorReturns === 1 ? '' : 's'}.` : 'No returns on record before this order.'}</span>
      <span className={`status-badge ${rating.className}`}>{rating.text} · {insights.score}/100</span>
    </div>
  );
}

function DetailSection({ title, children }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-content">{children}</div></section>;
}

function MoneyLine({ label: lineLabel, value, currency, total }) {
  return <div className={total ? 'money-line total' : 'money-line'}><span>{lineLabel}</span><strong>{formatMoney(value, currency)}</strong></div>;
}
