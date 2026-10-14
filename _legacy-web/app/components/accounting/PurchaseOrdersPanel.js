'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const money = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value ?? 0));
const statuses = ['PENDING', 'ORDERED', 'RECEIVED', 'PAID', 'CANCELLED'];
const emptyItem = () => ({ name: '', quantity: 1, unitPrice: '' });

export default function PurchaseOrdersPanel() {
  const [vendors, setVendors] = useState([]);
  const [query, setQuery] = useState({ page: 1, limit: 25 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.listVendors({ limit: 100 }).then((response) => setVendors(unwrap(response).items ?? [])).catch(() => {});
  }, [reloadToken]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listPurchaseOrders(query).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load purchase orders.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, reloadToken]);

  async function handleSave(form) {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        vendorId: form.vendorId,
        status: form.status,
        currency: form.currency,
        note: form.note,
        items: form.items.filter((item) => item.name && item.quantity && item.unitPrice !== '').map((item) => ({ name: item.name, quantity: Number(item.quantity), unitPrice: String(item.unitPrice) })),
      };
      if (!payload.items.length) throw new ApiError('Add at least one line item.');
      if (editing?.id) await api.updatePurchaseOrder(editing.id, payload);
      else await api.createPurchaseOrder(payload);
      setEditing(null);
      setReloadToken((value) => value + 1);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Unable to save purchase order.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await api.deletePurchaseOrder(id);
      setEditing(null);
      setReloadToken((value) => value + 1);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Unable to delete purchase order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="orders-toolbar">
        <div className="orders-summary"><span>{result.total ? `${result.total} purchase order${result.total === 1 ? '' : 's'}` : 'No purchase orders yet'}</span></div>
        <div className="orders-summary">
          <button className="button" type="button" disabled={!vendors.length} title={!vendors.length ? 'Add a vendor first' : ''} onClick={() => { setFormError(''); setEditing({}); }}>+ New purchase order</button>
        </div>
      </div>
      {error && <div className="error orders-error">{error}</div>}
      <section className="panel orders-panel">
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead><tr><th>Vendor</th><th>Status</th><th>Items</th><th>Total</th><th>Created</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="5" className="table-message">Loading purchase orders…</td></tr>
                : result.items.length === 0 ? <tr><td colSpan="5" className="table-message">No purchase orders yet. Create one once you have a vendor.</td></tr>
                : result.items.map((order) => (
                  <tr className="order-row" key={order.id} onClick={() => { setFormError(''); setEditing(order); }}>
                    <td><strong>{order.vendor?.name}</strong></td>
                    <td><span className={`status-badge status-${String(order.status).toLowerCase()}`}>{label(order.status)}</span></td>
                    <td>{order.items?.length ?? 0}</td>
                    <td>{money(order.totalAmount, order.currency)}</td>
                    <td>{date(order.createdAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {result.totalPages > 1 && (
          <div className="pagination">
            <button className="button button-secondary" disabled={query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
            <span>Page {query.page} of {result.totalPages}</span>
            <button className="button button-secondary" disabled={query.page >= result.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
          </div>
        )}
      </section>
      {editing && (
        <PurchaseOrderDrawer
          order={editing}
          vendors={vendors}
          saving={saving}
          error={formError}
          onSave={handleSave}
          onDelete={editing.id ? () => handleDelete(editing.id) : null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PurchaseOrderDrawer({ order, vendors, saving, error, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    vendorId: order.vendorId ?? order.vendor?.id ?? vendors[0]?.id ?? '',
    status: order.status ?? 'PENDING',
    currency: order.currency ?? 'USD',
    note: order.note ?? '',
    items: order.items?.length ? order.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice })) : [emptyItem()],
  });

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateItem(index, field, value) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }));
  }

  function removeItem(index) {
    setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  const total = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><p className="eyebrow">PURCHASE ORDER</p><h2>{order.id ? (order.vendor?.name ?? 'Purchase order') : 'New purchase order'}</h2></div>
          <button className="drawer-close" aria-label="Close purchase order form" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          <form className="integration-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
            <label>Vendor
              <select value={form.vendorId} onChange={(event) => update('vendorId', event.target.value)} required>
                {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
              </select>
            </label>
            <label>Status
              <select value={form.status} onChange={(event) => update('status', event.target.value)}>
                {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
              </select>
            </label>
            <label>Currency<input value={form.currency} onChange={(event) => update('currency', event.target.value)} /></label>
            <label>Note<textarea value={form.note} onChange={(event) => update('note', event.target.value)} /></label>

            <div className="detail-section" style={{ paddingTop: 4 }}>
              <h3>Line items</h3>
              {form.items.map((item, index) => (
                <div className="po-item-row" key={index}>
                  <input placeholder="Item name" value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} required />
                  <input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required />
                  <input type="number" min="0" step="0.01" placeholder="Unit price" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} required />
                  <button type="button" className="button-secondary po-item-remove" disabled={form.items.length === 1} onClick={() => removeItem(index)}>×</button>
                </div>
              ))}
              <button type="button" className="button button-secondary" onClick={addItem}>+ Add line item</button>
              <div className="money-line total"><span>Total</span><strong>{money(total, form.currency)}</strong></div>
            </div>

            {error && <div className="error">{error}</div>}
            <div className="integration-health-actions">
              <button className="button submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : order.id ? 'Save changes' : 'Create purchase order'}</button>
              {onDelete && <button className="button button-secondary" type="button" disabled={saving} onClick={onDelete}>Delete</button>}
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
