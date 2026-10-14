'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function WhatsAppIntegrations() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ displayName: '', phoneNumberId: '', businessAccountId: '', accessToken: '', verifyToken: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const result = unwrap(await api.listWhatsAppAccounts());
    setAccounts(Array.isArray(result) ? result : []);
  }

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api.saveWhatsAppAccount(form);
      setMessage('WhatsApp account saved. Use the verify token in Meta webhook setup.');
      setForm((current) => ({ ...current, accessToken: '' }));
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to save WhatsApp account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="integration-back"><Link href="/integrations">← All integrations</Link></p>
      <div className="integration-layout">
        <section className="panel">
          <div className="panel-title"><div><h2>Meta Cloud API</h2><p>Phone number ID and permanent access token from Meta Business Suite.</p></div><span className="panel-badge">WhatsApp</span></div>
          <form className="integration-form" onSubmit={save}>
            <label>Display name<input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
            <label>Phone number ID<input required value={form.phoneNumberId} onChange={(event) => setForm({ ...form, phoneNumberId: event.target.value })} /></label>
            <label>Business account ID<input value={form.businessAccountId} onChange={(event) => setForm({ ...form, businessAccountId: event.target.value })} /></label>
            <label>Access token<input required type="password" autoComplete="new-password" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} /></label>
            <label>Webhook verify token<input value={form.verifyToken} onChange={(event) => setForm({ ...form, verifyToken: event.target.value })} /></label>
            <button className="button" disabled={saving}>{saving ? 'Saving…' : 'Save WhatsApp account'}</button>
          </form>
          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}
        </section>
        <section className="panel">
          <h2>Connected numbers</h2>
          {accounts.length === 0 ? <p className="muted">No WhatsApp account connected yet.</p> : accounts.map((account) => (
            <div className="integration-health" key={account.id}>
              <div><strong>{account.displayName}</strong><small>{account.phoneNumberId}</small></div>
              <span className={`status-badge status-${String(account.status).toLowerCase()}`}>{account.status}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
