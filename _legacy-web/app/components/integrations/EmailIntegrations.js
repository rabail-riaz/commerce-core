'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function EmailIntegrations() {
  const [accounts, setAccounts] = useState([]);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({ accountId: '', emailAddress: '', displayName: '', provider: 'SMTP', host: '', port: '587', username: '', password: '', isDefault: false, canSend: true, canReceive: true });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [providerResult, accountResult] = await Promise.all([api.listEmailProviders(), api.listEmailAccounts()]);
    setProviders(unwrap(providerResult) ?? []);
    setAccounts(unwrap(accountResult) ?? []);
  }

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, []);

  function reconnect(account) {
    setForm((current) => ({ ...current, accountId: account.id, emailAddress: account.emailAddress, displayName: account.displayName || '', provider: account.provider }));
    setMessage('Enter the password again and save to reconnect.');
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = {
        emailAddress: form.emailAddress,
        displayName: form.displayName || undefined,
        provider: form.provider,
        isDefault: form.isDefault,
        canSend: form.canSend,
        canReceive: form.canReceive,
      };
      let account;
      const credentials = { host: form.host, port: Number(form.port), username: form.username, password: form.password };
      if (form.accountId) {
        account = { id: form.accountId };
        await api.reconnectEmailAccount(account.id, credentials);
      } else {
        account = unwrap(await api.createEmailAccount(payload));
        await api.saveEmailCredentials(account.id, credentials);
      }
      const health = await api.testEmailConnection(account.id);
      setMessage(health.data?.message ?? 'Email account connected.');
      setForm((current) => ({ ...current, accountId: '', password: '' }));
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to save email account.');
    } finally {
      setSaving(false);
    }
  }

  async function emailAction(action, account) {
    setError('');
    try {
      if (action === 'test') await api.testEmailConnection(account.id);
      if (action === 'disconnect') await api.disconnectEmailAccount(account.id);
      setMessage(action === 'test' ? 'Connection health checked.' : 'Email account disconnected.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div>
      <p className="integration-back"><Link href="/integrations">← All integrations</Link></p>
      <div className="integration-layout">
        <section className="panel">
          <div className="panel-title"><div><h2>Mailbox</h2><p>Connect SMTP now. Gmail and Microsoft 365 appear when those adapters are enabled.</p></div><span className="panel-badge">Encrypted</span></div>
          <form className="integration-form" onSubmit={save}>
            <label>Email address<input required type="email" value={form.emailAddress} onChange={(event) => setForm({ ...form, emailAddress: event.target.value })} /></label>
            <label>Display name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
            <label>Provider
              <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
                {['GMAIL', 'MICROSOFT365', 'SMTP'].map((provider) => (
                  <option key={provider} value={provider} disabled={!providers.includes(provider)}>
                    {provider === 'MICROSOFT365' ? 'Microsoft 365 / Outlook' : provider}{!providers.includes(provider) ? ' (not configured)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {form.provider === 'SMTP' && (
              <>
                <label>SMTP host<input required placeholder="smtp.example.com" value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} /></label>
                <label>SMTP port<input required type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} /></label>
                <label>Username<input required autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
                <label>Password<input required type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
              </>
            )}
            <label><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} /> Default account</label>
            <label><input type="checkbox" checked={form.canSend} onChange={(event) => setForm({ ...form, canSend: event.target.checked })} /> Can send</label>
            <label><input type="checkbox" checked={form.canReceive} onChange={(event) => setForm({ ...form, canReceive: event.target.checked })} /> Can receive</label>
            <button className="button" disabled={saving || providers.length === 0}>{saving ? 'Testing connection…' : form.accountId ? 'Reconnect email account' : 'Test and save email account'}</button>
          </form>
          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}
        </section>
        <section className="panel">
          <h2>Connected accounts</h2>
          {accounts.length === 0 ? <p className="muted">No email accounts yet.</p> : accounts.map((account) => (
            <div className="integration-health" key={account.id}>
              <div><strong>{account.displayName || account.emailAddress}</strong><small>{account.emailAddress} · {account.provider}</small></div>
              <div className="integration-health-actions">
                <span className={`status-badge status-${String(account.status).toLowerCase()}`}>{account.status}</span>
                <button className="button button-secondary" onClick={() => emailAction('test', account)}>Test</button>
                {account.status === 'DISABLED'
                  ? <button className="button button-secondary" onClick={() => reconnect(account)}>Reconnect</button>
                  : <button className="button button-secondary" onClick={() => emailAction('disconnect', account)}>Disconnect</button>}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
