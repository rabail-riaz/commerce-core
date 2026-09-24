'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';

export default function IntegrationsContent() {
  const [integrations, setIntegrations] = useState([]);
  const [form, setForm] = useState({ url: '', key: '', secret: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [emailProviders, setEmailProviders] = useState([]);
  const [emailForm, setEmailForm] = useState({ accountId: '', emailAddress: '', displayName: '', provider: 'SMTP', host: '', port: '587', username: '', password: '', isDefault: false, canSend: true, canReceive: false });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  async function load() {
    const response = await api.listIntegrations({ page: 1, limit: 50 });
    setIntegrations(response.data?.items ?? response.items ?? []);
    const [providers, accounts] = await Promise.all([api.listEmailProviders(), api.listEmailAccounts()]);
    setEmailProviders(providers.data ?? providers);
    setEmailAccounts(accounts.data ?? accounts);
  }

  async function addEmailAccount(event) {
    event.preventDefault();
    setEmailSaving(true);
    setEmailMessage('');
    setEmailError('');
    try {
      const accountPayload = {
        emailAddress: emailForm.emailAddress,
        displayName: emailForm.displayName || undefined,
        provider: emailForm.provider,
        isDefault: emailForm.isDefault,
        canSend: emailForm.canSend,
        canReceive: emailForm.canReceive,
      };
      let account;
      if (emailForm.accountId) {
        account = { id: emailForm.accountId };
        await api.reconnectEmailAccount(account.id, { host: emailForm.host, port: Number(emailForm.port), username: emailForm.username, password: emailForm.password });
      } else {
        const created = await api.createEmailAccount(accountPayload);
        account = created.data ?? created;
        await api.saveEmailCredentials(account.id, { host: emailForm.host, port: Number(emailForm.port), username: emailForm.username, password: emailForm.password });
      }
      const health = await api.testEmailConnection(account.id);
      setEmailMessage(health.data?.message ?? 'Email account connected successfully.');
      setEmailForm((current) => ({ ...current, accountId: '', password: '' }));
      await load();
    } catch (requestError) {
      setEmailError(requestError.message);
    } finally {
      setEmailSaving(false);
    }
  }

  async function emailAction(action, account) {
    setEmailError('');
    try {
      if (action === 'test') await api.testEmailConnection(account.id);
      if (action === 'disconnect') await api.disconnectEmailAccount(account.id);
      setEmailMessage(action === 'test' ? 'Connection health checked.' : 'Email account disconnected. Credentials were removed.');
      await load();
    } catch (requestError) {
      setEmailError(requestError.message);
    }

    function reconnect(account) {
      setEmailForm((current) => ({ ...current, accountId: account.id, emailAddress: account.emailAddress, displayName: account.displayName || '', provider: account.provider }));
      setEmailMessage('Enter the account password and submit to reconnect.');
      setEmailError('');
    }
  }

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, []);

  async function sync(integration, reconciliation = false) {
    setSyncing(true);
    setError('');
    try {
      const result = await (reconciliation ? api.reconcileIntegration(integration.id) : api.syncIntegration(integration.id));
      const started = result.data?.started !== false;
      setMessage(started
        ? (reconciliation ? 'Reconciliation started.' : 'Initial synchronization started.')
        : 'A synchronization is already running.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSyncing(false);
    }
  }

  async function connect(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      let integration = integrations.find((item) => item.provider === 'WOOCOMMERCE');
      if (!integration) {
        const created = await api.createIntegration('WOOCOMMERCE');
        integration = created.data ?? created;
      }

      const result = await api.saveIntegrationCredentials(integration.id, form);
      setMessage(result.data?.health?.message ?? 'WooCommerce connected successfully.');
      setForm((current) => ({ ...current, secret: '' }));
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="integration-layout">
      <section className="panel">
        <div className="panel-title"><div><h2>Email accounts</h2><p>Connect provider-independent email sending and receiving.</p></div><span className="panel-badge">Encrypted</span></div>
        <form onSubmit={addEmailAccount} className="integration-form">
          <label>Email address<input required type="email" value={emailForm.emailAddress} onChange={(event) => setEmailForm({ ...emailForm, emailAddress: event.target.value })} /></label>
          <label>Display name<input type="text" value={emailForm.displayName} onChange={(event) => setEmailForm({ ...emailForm, displayName: event.target.value })} /></label>
          <label>Provider<select value={emailForm.provider} onChange={(event) => setEmailForm({ ...emailForm, provider: event.target.value })}>{['GMAIL', 'MICROSOFT365', 'SMTP'].map((provider) => <option key={provider} value={provider} disabled={!emailProviders.includes(provider)}>{provider === 'MICROSOFT365' ? 'Microsoft 365 / Outlook' : provider}{!emailProviders.includes(provider) ? ' (not configured)' : ''}</option>)}</select></label>
          {emailForm.provider === 'SMTP' && <><label>SMTP host<input required type="text" placeholder="smtp.example.com" value={emailForm.host} onChange={(event) => setEmailForm({ ...emailForm, host: event.target.value })} /></label><label>SMTP port<input required type="number" min="1" max="65535" value={emailForm.port} onChange={(event) => setEmailForm({ ...emailForm, port: event.target.value })} /></label><label>Username<input required type="text" autoComplete="off" value={emailForm.username} onChange={(event) => setEmailForm({ ...emailForm, username: event.target.value })} /></label><label>Password<input required type="password" autoComplete="new-password" value={emailForm.password} onChange={(event) => setEmailForm({ ...emailForm, password: event.target.value })} /></label></>}
          <label><input type="checkbox" checked={emailForm.isDefault} onChange={(event) => setEmailForm({ ...emailForm, isDefault: event.target.checked })} /> Default account</label>
          <button className="button" disabled={emailSaving || emailProviders.length === 0}>{emailSaving ? 'Testing connection…' : emailForm.accountId ? 'Reconnect email account' : 'Test and save email account'}</button>
        </form>
        {emailMessage && <div className="success">{emailMessage}</div>}{emailError && <div className="error">{emailError}</div>}
        {emailAccounts.map((account) => <div className="integration-health" key={account.id}><div><strong>{account.displayName || account.emailAddress}</strong><small>{account.emailAddress} · {account.provider}</small></div><div className="integration-health-actions"><span className={`status-badge status-${String(account.status).toLowerCase()}`}>{account.status}</span><button className="button button-secondary" onClick={() => emailAction('test', account)}>Test</button>{account.status === 'DISABLED' && <button className="button button-secondary" onClick={() => reconnect(account)}>Reconnect</button>}{account.status !== 'DISABLED' && <button className="button button-secondary" onClick={() => emailAction('disconnect', account)}>Disconnect</button>}</div></div>)}
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>WooCommerce</h2><p>Connect a WooCommerce store using a REST API key and secret.</p></div><span className="panel-badge">Secure</span></div>
        <form onSubmit={connect} className="integration-form">
          <label>Store URL<input required type="url" placeholder="https://store.example.com" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
          <label>Consumer key<input required type="text" autoComplete="off" value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} /></label>
          <label>Consumer secret<input required type="password" autoComplete="new-password" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} /></label>
          <button className="button" disabled={saving}>{saving ? 'Testing connection…' : 'Test and save connection'}</button>
        </form>
        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
      </section>
      <section className="panel">
        <h2>Connection health</h2>
        {integrations.length === 0 ? <p className="muted">No integrations configured.</p> : integrations.map((integration) => (
          <div className="integration-health" key={integration.id}>
            <div><strong>{integration.provider}</strong><small>Last sync: {integration.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString() : 'Not synced yet'}</small>{integration.lastError && <small className="integration-error">{integration.lastError}</small>}</div>
            <div className="integration-health-actions"><span className={`status-badge status-${String(integration.status).toLowerCase()}`}>{integration.status}</span><button className="button button-secondary" disabled={syncing} onClick={() => sync(integration)}>Initial sync</button><button className="button button-secondary" disabled={syncing} onClick={() => sync(integration, true)}>Reconcile</button></div>
          </div>
        ))}
      </section>
    </div>
  );
}
