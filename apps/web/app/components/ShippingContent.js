'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export default function ShippingContent() {
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);

  async function load() {
    try { setShipments(unwrap(await api.listShipments())); setError(''); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load shipments.'); }
  }
  useEffect(() => { load(); }, []);

  async function refreshTracking() {
    if (!selected) return;
    setTracking(true);
    try { setSelected(unwrap(await api.trackShipment(selected.id))); await load(); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to refresh tracking.'); } finally { setTracking(false); }
  }

  return <div className="panel"><div className="panel-title"><div><h2>Shipments</h2><p>Provider-independent shipment status and tracking.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>{error && <div className="error">{error}</div>}<div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>Tracking number</th><th>Courier</th><th>Order</th><th>Status</th><th>Created</th></tr></thead><tbody>{shipments.length ? shipments.map((shipment) => <tr className="order-row" key={shipment.id} onClick={() => setSelected(shipment)}><td><strong>{shipment.trackingNumber || shipment.externalShipmentId || 'Pending'}</strong></td><td>{shipment.courierAccount?.courier?.name || '—'}</td><td>{shipment.order?.externalOrderId || shipment.orderId}</td><td><StatusBadge status={shipment.status} /></td><td>{formatDate(shipment.createdAt)}</td></tr>) : <tr><td colSpan="5" className="table-message">No shipments found.</td></tr>}</tbody></table></div>{selected && <ShipmentDetail shipment={selected} tracking={tracking} onTrack={refreshTracking} onClose={() => setSelected(null)} />}</div>;
}

function ShipmentDetail({ shipment, tracking, onTrack, onClose }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="order-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">SHIPMENT DETAIL</p><h2>{shipment.trackingNumber || 'Shipment'}</h2></div><button className="drawer-close" onClick={onClose}>×</button></div><div className="drawer-body"><Detail title="Status"><StatusBadge status={shipment.status} /><span>Courier: {shipment.courierAccount?.courier?.name || '—'}</span><button className="button button-primary" disabled={!shipment.trackingNumber || tracking} onClick={onTrack}>{tracking ? 'Refreshing…' : 'Refresh tracking'}</button></Detail><Detail title="Timeline"><div className="timeline">{shipment.statusHistory?.map((event) => <div className="timeline-item" key={event.id}><span className="timeline-dot" /><div><strong>{label(event.status)}</strong><span>{event.note || 'Status updated'}</span><small>{formatDate(event.createdAt)}</small></div></div>)}</div></Detail></div></aside></div>;
}

function Detail({ title, children }) { return <section className="detail-section"><h3>{title}</h3><div className="detail-content">{children}</div></section>; }
function StatusBadge({ status }) { return <span className={`status-badge status-${String(status).toLowerCase()}`}>{label(status)}</span>; }
