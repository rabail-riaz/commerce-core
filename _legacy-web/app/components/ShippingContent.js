'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api-client';
import { DATE_PRESETS, DEFAULT_DATE_PRESET, dateRangeForPreset } from '../lib/date-presets';

const statuses = ['PENDING', 'LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'];

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

function cityOf(shipment) {
  const address = shipment.order?.shippingAddress;
  return (address && (address.city || address.cityName)) || '—';
}

function customerOf(shipment) {
  const customer = shipment.order?.customer;
  const address = shipment.order?.shippingAddress;
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ')
    || [address?.firstName, address?.lastName, address?.first_name, address?.last_name].filter(Boolean).join(' ');
  return name || customer?.email || address?.phone || '—';
}

export default function ShippingContent() {
  const [filters, setFilters] = useState(() => ({ search: '', status: '', courier: '', city: '', ...dateRangeForPreset(DEFAULT_DATE_PRESET) }));
  const [datePreset, setDatePreset] = useState(DEFAULT_DATE_PRESET);
  const [query, setQuery] = useState({ page: 1, limit: 25 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0, summary: { couriers: [], total: 0 } });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const hasFilters = Boolean(filters.search || filters.status || filters.courier || filters.city || datePreset !== DEFAULT_DATE_PRESET);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listShipments({ ...filters, ...query }).then((response) => {
      if (!active) return;
      const payload = unwrap(response);
      setResult({
        items: payload.items ?? (Array.isArray(payload) ? payload : []),
        total: payload.total ?? (Array.isArray(payload) ? payload.length : 0),
        totalPages: payload.totalPages ?? 1,
        summary: payload.summary ?? { couriers: [], total: 0 },
      });
      setError('');
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load shipments.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, query, reloadToken]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setQuery((current) => ({ ...current, page: 1 }));
  }

  function updateDatePreset(key) {
    setDatePreset(key);
    const range = dateRangeForPreset(key);
    if (range) setFilters((current) => ({ ...current, ...range }));
    setQuery((current) => ({ ...current, page: 1 }));
  }

  function clearFilters() {
    setFilters({ search: '', status: '', courier: '', city: '', ...dateRangeForPreset(DEFAULT_DATE_PRESET) });
    setDatePreset(DEFAULT_DATE_PRESET);
    setQuery((current) => ({ ...current, page: 1 }));
  }

  async function pullFromCouriers() {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const sync = unwrap(await api.syncShipments({
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      }));
      const parts = [`Imported ${sync.imported ?? 0}`, `updated ${sync.updated ?? 0}`];
      if (sync.skipped) parts.push(`${sync.skipped} courier(s) have no live list API`);
      if (sync.failed) parts.push(`${sync.failed} failed`);
      setMessage(`${parts.join(', ')}.`);
      if (sync.errors?.length) setError(sync.errors.map((item) => `${item.courier}: ${item.message}`).join(' '));
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to pull courier shipments.');
    } finally {
      setSyncing(false);
    }
  }

  async function refreshTracking() {
    if (!selected) return;
    setTracking(true);
    try {
      setSelected(unwrap(await api.trackShipment(selected.id)));
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to refresh tracking.');
    } finally {
      setTracking(false);
    }
  }

  const pageLabel = useMemo(() => {
    if (!result.total) return 'No shipments found';
    const start = (query.page - 1) * query.limit + 1;
    return `${start}-${Math.min(query.page * query.limit, result.total)} of ${result.total}`;
  }, [query, result.total]);

  const empty = !loading && result.items.length === 0;

  return (
    <>
      {result.summary?.couriers?.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <button type="button" className={`stat-card ${filters.courier ? '' : 'stat-card-active'}`} onClick={() => updateFilter('courier', '')}>
            <span>All couriers</span>
            <strong>{result.summary.total ?? 0}</strong>
            <small>Shipments in this workspace</small>
          </button>
          {result.summary.couriers.map((courier) => (
            <button type="button" className={`stat-card ${filters.courier === courier.code ? 'stat-card-active' : ''}`} key={courier.accountId} onClick={() => updateFilter('courier', courier.code)}>
              <span>{courier.name}</span>
              <strong>{courier.total}</strong>
              <small>{courier.canImport ? 'Live import available' : 'Local bookings only'}</small>
            </button>
          ))}
        </div>
      )}
      <div className="orders-toolbar">
        <div className="orders-filters">
          <input aria-label="Search shipments" placeholder="Search tracking, order, customer…" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
          <select aria-label="Filter by status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
          <select aria-label="Filter by courier" value={filters.courier} onChange={(event) => updateFilter('courier', event.target.value)}>
            <option value="">All couriers</option>
            {(result.summary?.couriers ?? []).map((courier) => <option key={courier.code} value={courier.code}>{courier.name}</option>)}
          </select>
          <input aria-label="Filter by city" placeholder="City" value={filters.city} onChange={(event) => updateFilter('city', event.target.value)} />
          <select aria-label="Filter by date range" value={datePreset} onChange={(event) => updateDatePreset(event.target.value)}>
            {DATE_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
          </select>
          {datePreset === 'custom' && (
            <>
              <input aria-label="Shipments from date" type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} />
              <input aria-label="Shipments to date" type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} />
            </>
          )}
          {hasFilters && <button className="button button-secondary" type="button" onClick={clearFilters}>Clear</button>}
        </div>
        <div className="orders-summary">
          <span>{pageLabel}</span>
          <button className="button" type="button" disabled={syncing} onClick={pullFromCouriers}>{syncing ? 'Pulling…' : 'Pull courier shipments'}</button>
        </div>
      </div>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
      <section className="panel orders-panel">
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Courier</th>
                <th>Order</th>
                <th>Customer</th>
                <th>City</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="table-message">Loading shipments…</td></tr>
                : empty ? (
                  <tr>
                    <td colSpan="7" className="table-message">
                      No shipments found. Book from an order, or pull live data from a connected courier such as PostEx.
                      <div className="orders-empty-actions">
                        <button className="button" type="button" disabled={syncing} onClick={pullFromCouriers}>{syncing ? 'Pulling…' : 'Pull courier shipments'}</button>
                      </div>
                    </td>
                  </tr>
                ) : result.items.map((shipment) => (
                  <tr className="order-row" key={shipment.id} onClick={() => setSelected(shipment)}>
                    <td><strong>{shipment.trackingNumber || shipment.externalShipmentId || 'Pending'}</strong><small>{shipment.externalShipmentId && shipment.externalShipmentId !== shipment.trackingNumber ? shipment.externalShipmentId : ''}</small></td>
                    <td>{shipment.courierAccount?.courier?.name || '—'}</td>
                    <td>{shipment.order?.externalOrderId || shipment.orderId}</td>
                    <td>{customerOf(shipment)}</td>
                    <td>{cityOf(shipment)}</td>
                    <td><StatusBadge status={shipment.status} /></td>
                    <td>{formatDate(shipment.createdAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {result.totalPages > 1 && (
          <div className="pagination">
            <button className="button button-secondary" type="button" disabled={query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
            <span>Page {query.page} of {result.totalPages}</span>
            <button className="button button-secondary" type="button" disabled={query.page >= result.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
          </div>
        )}
      </section>
      {selected && <ShipmentDetail shipment={selected} tracking={tracking} onTrack={refreshTracking} onClose={() => setSelected(null)} />}
    </>
  );
}

function ShipmentDetail({ shipment, tracking, onTrack, onClose }) {
  const address = shipment.order?.shippingAddress;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><p className="eyebrow">SHIPMENT DETAIL</p><h2>{shipment.trackingNumber || 'Shipment'}</h2></div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          <Detail title="Status">
            <StatusBadge status={shipment.status} />
            <span>Courier: {shipment.courierAccount?.courier?.name || '—'}</span>
            <span>Account: {shipment.courierAccount?.name || '—'}</span>
            <button className="button" disabled={!shipment.trackingNumber || tracking} onClick={onTrack}>{tracking ? 'Refreshing…' : 'Refresh tracking'}</button>
          </Detail>
          <Detail title="Order">
            <strong>{shipment.order?.externalOrderId || shipment.orderId}</strong>
            <span>Customer: {customerOf(shipment)}</span>
            <span>City: {cityOf(shipment)}</span>
            {address?.addressLine1 || address?.address_1 ? <span>{[address.addressLine1 || address.address_1, address.city, address.country].filter(Boolean).join(', ')}</span> : null}
            {address?.phone ? <span>Phone: {address.phone}</span> : null}
          </Detail>
          <Detail title="Timeline">
            <div className="timeline">
              {(shipment.statusHistory ?? []).map((event) => (
                <div className="timeline-item" key={event.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{label(event.status)}</strong>
                    <span>{event.note || 'Status updated'}</span>
                    <small>{formatDate(event.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          </Detail>
        </div>
      </aside>
    </div>
  );
}

function Detail({ title, children }) {
  return <section className="detail-section"><h3>{title}</h3><div className="detail-content">{children}</div></section>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${String(status).toLowerCase()}`}>{label(status)}</span>;
}
