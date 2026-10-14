'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const emptyForm = { name: '', email: '', phone: '', address: '', notes: '', status: 'ACTIVE' };

export default function VendorsPanel() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ page: 1, limit: 25 });
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(null); // vendor object, or {} for new
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listVendors({ search, ...query }).then((response) => {
      if (active) { setResult(unwrap(response)); setError(''); }
    }).catch((requestError) => {
      if (active) setError(requestError instanceof ApiError ? requestError.message : 'Unable to load vendors.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, query, reloadToken]);

  async function handleSave(form) {
    setSaving(true);
    setFormError('');
    try {
      if (editing?.id) await api.updateVendor(editing.id, form);
      else await api.createVendor(form);
      setEditing(null);
      setReloadToken((value) => value + 1);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Unable to save vendor.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await api.deleteVendor(id);
      setEditing(null);
      setReloadToken((value) => value + 1);
    } catch (requestError) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Unable to delete vendor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="orders-toolbar">
        <div className="orders-filters">
          <input className="customer-search" aria-label="Search vendors" placeholder="Search vendor name, email, phone…" value={search} onChange={(event) => { setSearch(event.target.value); setQuery((current) => ({ ...current, page: 1 })); }} />
        </div>
        <div className="orders-summary">
          <button className="button" type="button" onClick={() => { setFormError(''); setEditing({}); }}>+ Add vendor</button>
        </div>
      </div>
      {error && <div className="error orders-error">{error}</div>}
      <section className="panel orders-panel">
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead><tr><th>Vendor</th><th>Contact</th><th>Status</th><th>Purchase orders</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="4" className="table-message">Loading vendors…</td></tr>
                : result.items.length === 0 ? <tr><td colSpan="4" className="table-message">No vendors yet. Add your first vendor to get started.</td></tr>
                : result.items.map((vendor) => (
                  <tr className="order-row" key={vendor.id} onClick={() => { setFormError(''); setEditing(vendor); }}>
                    <td><strong>{vendor.name}</strong><small>{vendor.address || 'No address on file'}</small></td>
                    <td>{vendor.email || '—'}<small>{vendor.phone || 'No phone'}</small></td>
                    <td><span className={`status-badge status-${String(vendor.status).toLowerCase()}`}>{vendor.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
                    <td>{vendor._count?.purchaseOrders ?? 0}</td>
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
        <VendorDrawer
          vendor={editing}
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

function VendorDrawer({ vendor, saving, error, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({ ...emptyForm, ...vendor });

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="order-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><p className="eyebrow">VENDOR</p><h2>{vendor.id ? vendor.name : 'Add vendor'}</h2></div>
          <button className="drawer-close" aria-label="Close vendor form" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          <form className="integration-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
            <label>Name<input value={form.name} onChange={(event) => update('name', event.target.value)} required /></label>
            <label>Email<input type="email" value={form.email ?? ''} onChange={(event) => update('email', event.target.value)} /></label>
            <label>Phone<input value={form.phone ?? ''} onChange={(event) => update('phone', event.target.value)} /></label>
            <label>Address<input value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} /></label>
            <label>Notes<textarea value={form.notes ?? ''} onChange={(event) => update('notes', event.target.value)} /></label>
            <label>Status
              <select value={form.status} onChange={(event) => update('status', event.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            {error && <div className="error">{error}</div>}
            <div className="integration-health-actions">
              <button className="button submit-button" type="submit" disabled={saving}>{saving ? 'Saving…' : vendor.id ? 'Save changes' : 'Add vendor'}</button>
              {onDelete && <button className="button button-secondary" type="button" disabled={saving} onClick={onDelete}>Delete</button>}
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
