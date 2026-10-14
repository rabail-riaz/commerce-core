'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const statuses = ['RETURN_REQUESTED', 'APPROVED', 'PICKUP', 'SHIPMENT', 'RECEIVED', 'INSPECTION', 'REFUND', 'REPLACEMENT', 'REJECTED'];
const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export default function ReturnsContent() {
  const [returns, setReturns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const load = async () => { try { setReturns(unwrap(await api.listReturns())); setError(''); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load returns.'); } };
  useEffect(() => { load(); }, []);
  async function changeStatus(status) {
    if (!selected) return;
    try { const updated = unwrap(await api.updateReturnStatus(selected.id, status)); setSelected(updated); await load(); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to update return.'); }
  }
  return <div className="panel"><div className="panel-title"><div><h2>Returns</h2><p>Manage the return lifecycle without provider-specific assumptions.</p></div><button className="button button-secondary" onClick={load}>Refresh</button></div>{error && <div className="error">{error}</div>}<div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>Order</th><th>Shipment</th><th>Status</th><th>Reason</th><th>Requested</th></tr></thead><tbody>{returns.length ? returns.map((item) => <tr className="order-row" key={item.id} onClick={() => setSelected(item)}><td>{item.order?.externalOrderId || item.orderId}</td><td>{item.shipment?.trackingNumber || '—'}</td><td><StatusBadge status={item.status} /></td><td>{item.reason || '—'}</td><td>{formatDate(item.requestedAt)}</td></tr>) : <tr><td colSpan="5" className="table-message">No returns found.</td></tr>}</tbody></table></div>{selected && <ReturnDetail item={selected} onChangeStatus={changeStatus} onClose={() => setSelected(null)} />}</div>;
}

function ReturnDetail({ item, onChangeStatus, onClose }) {
  const next = { RETURN_REQUESTED: ['APPROVED', 'REJECTED'], APPROVED: ['PICKUP', 'REJECTED'], PICKUP: ['SHIPMENT', 'REJECTED'], SHIPMENT: ['RECEIVED', 'REJECTED'], RECEIVED: ['INSPECTION', 'REJECTED'], INSPECTION: ['REFUND', 'REPLACEMENT', 'REJECTED'] }[item.status] || [];
  return <div className="drawer-backdrop" onClick={onClose}><aside className="order-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">RETURN DETAIL</p><h2>{item.order?.externalOrderId || 'Return'}</h2></div><button className="drawer-close" onClick={onClose}>×</button></div><div className="drawer-body"><section className="detail-section"><h3>Workflow</h3><div className="detail-content"><StatusBadge status={item.status} />{next.length > 0 && <div className="detail-grid">{next.map((status) => <button className="button button-secondary" key={status} onClick={() => onChangeStatus(status)}>{label(status)}</button>)}</div>}</div></section><section className="detail-section"><h3>Return timeline</h3><div className="timeline">{item.statusHistory?.map((event) => <div className="timeline-item" key={event.id}><span className="timeline-dot" /><div><strong>{label(event.status)}</strong><span>{event.note || 'Status updated'}</span><small>{formatDate(event.createdAt)}</small></div></div>)}</div></section><section className="detail-section"><h3>Details</h3><div className="detail-content"><span>Reason: {item.reason || '—'}</span><span>Resolution: {item.resolution || '—'}</span><span>Tracking: {item.shipment?.trackingNumber || '—'}</span></div></section></div></aside></div>;
}

function StatusBadge({ status }) { return <span className={`status-badge status-${String(status).toLowerCase()}`}>{label(status)}</span>; }
