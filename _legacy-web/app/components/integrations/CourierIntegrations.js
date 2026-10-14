'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, apiConfig, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function CourierIntegrations() {
  const [couriers, setCouriers] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const items = unwrap(await api.listCouriers());
    setCouriers(Array.isArray(items) ? items : []);
  }

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return couriers;
    return couriers.filter((courier) => `${courier.name} ${courier.code} ${courier.description}`.toLowerCase().includes(query));
  }, [couriers, search]);

  function open(courier) {
    setSelected(courier);
    setForm({});
    setError('');
    setMessage('');
  }

  async function connect(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(selected.code);
    setError('');
    try {
      await api.connectCourier(selected.code, form);
      setMessage(`${selected.name} connected. You can configure additional couriers too.`);
      setSelected(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to save courier credentials.');
    } finally {
      setBusy('');
    }
  }

  async function disconnect(courier) {
    setBusy(courier.code);
    setError('');
    try {
      await api.disconnectCourier(courier.code);
      setMessage(`${courier.name} disconnected.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <p className="integration-back"><Link href="/integrations">← All integrations</Link></p>
      <div className="orders-toolbar">
        <div className="orders-filters">
          <input aria-label="Search couriers" placeholder="Search Pakistan couriers…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="orders-summary"><span>{couriers.filter((item) => item.account?.status === 'ACTIVE').length} configured</span></div>
      </div>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
      <div className="courier-grid">
        {visible.map((courier) => (
          <article className="courier-card" key={courier.code}>
            <div>
              <h2>{courier.name}</h2>
              <p>{courier.description}</p>
            </div>
            <div className="integration-health-actions">
              <span className={`status-badge status-${String(courier.account?.status || 'pending').toLowerCase()}`}>{courier.account?.status === 'ACTIVE' ? 'Connected' : 'Not connected'}</span>
              <button className="button" type="button" onClick={() => open(courier)}>{courier.account ? 'Update' : 'Configure'}</button>
              {courier.account?.status === 'ACTIVE' && <button className="button button-secondary" type="button" disabled={busy === courier.code} onClick={() => disconnect(courier)}>Disconnect</button>}
            </div>
            {courier.code === 'LEOPARDS' && courier.account?.webhookPath && <WebhookUrl path={courier.account.webhookPath} courierName={courier.name} />}
          </article>
        ))}
      </div>
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="order-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div><p className="eyebrow">COURIER</p><h2>{selected.name}</h2></div>
              <button className="drawer-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="drawer-body">
              <p className="muted">{selected.description}</p>
              {selected.code === 'POSTEX' && <p className="muted">Use the merchant API token from the PostEx dashboard (Integrations). A short API key will be rejected. Leave Base URL empty unless you use sandbox.</p>}
              {selected.code === 'LEOPARDS' && <p className="muted">Use the API key and API password from the Leopards merchant portal (API Settings → API Management), not the portal login password. Save again if pull says the password is invalid.</p>}
              <form className="integration-form" onSubmit={connect}>
                {selected.fields.map((field) => (
                  <label key={field.key}>
                    {field.label}{field.required ? '' : ' (optional)'}
                    <input
                      required={field.required}
                      type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                      placeholder={field.placeholder || ''}
                      autoComplete="off"
                      value={form[field.key] || ''}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  </label>
                ))}
                {error && <div className="error">{error}</div>}
                <button className="button" disabled={busy === selected.code}>{busy === selected.code ? 'Saving…' : 'Save courier'}</button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function WebhookUrl({ path, courierName }) {
  const [copied, setCopied] = useState(false);
  const url = `${apiConfig.baseUrl}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable; the field is still selectable for manual copy.
    }
  }

  return (
    <div className="webhook-url-box">
      <p className="muted">Paste this URL as the callback/push URL in {courierName}&apos;s merchant portal (LCS ECOM Portal → Push API settings), so new bookings and status updates arrive automatically. Needs a public (deployed) site — won&apos;t work from localhost.</p>
      <div className="webhook-url-row">
        <input readOnly value={url} onFocus={(event) => event.target.select()} />
        <button type="button" className="button button-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}
