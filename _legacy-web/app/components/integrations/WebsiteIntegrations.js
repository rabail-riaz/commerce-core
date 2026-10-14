'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function WebsiteIntegrations() {
  const [integrations, setIntegrations] = useState([]);
  const [woo, setWoo] = useState({ url: '', key: '', secret: '' });
  const [shopify, setShopify] = useState({ shop: '', accessToken: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await api.listIntegrations({ page: 1, limit: 50 });
    setIntegrations(unwrap(response)?.items ?? []);
  }

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, []);

  async function connectProvider(provider, credentials, syncLabel) {
    setBusy(provider);
    setMessage('');
    setError('');
    try {
      let integration = integrations.find((item) => item.provider === provider);
      if (!integration) {
        const created = await api.createIntegration(provider);
        integration = unwrap(created);
      }
      const saved = await api.saveIntegrationCredentials(integration.id, credentials);
      setMessage(saved.data?.health?.message ?? `${provider} connected. Importing orders…`);
      const sync = unwrap(await api.syncIntegration(integration.id));
      setMessage(sync.completed
        ? `${syncLabel} connected. Imported ${sync.recordsSynced ?? 0} records into Orders.`
        : `${syncLabel} connected. Synchronization started.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : `Unable to connect ${syncLabel}.`);
    } finally {
      setBusy('');
    }
  }

  async function sync(integration, reconciliation = false) {
    setBusy(integration.id);
    setError('');
    try {
      const payload = unwrap(await (reconciliation ? api.reconcileIntegration(integration.id) : api.syncIntegration(integration.id)));
      setMessage(payload.completed
        ? `Imported ${payload.recordsSynced ?? 0} records.`
        : (reconciliation ? 'Reconciliation started.' : 'Synchronization started.'));
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
      <div className="integration-layout">
        <section className="panel">
          <div className="panel-title"><div><h2>WooCommerce</h2><p>REST API consumer key and secret from WooCommerce → Settings → Advanced → REST API.</p></div><span className="panel-badge">Website</span></div>
          <form className="integration-form" onSubmit={(event) => { event.preventDefault(); connectProvider('WOOCOMMERCE', woo, 'WooCommerce'); }}>
            <label>Store URL<input required type="url" placeholder="https://store.example.com" value={woo.url} onChange={(event) => setWoo({ ...woo, url: event.target.value })} /></label>
            <label>Consumer key<input required autoComplete="off" value={woo.key} onChange={(event) => setWoo({ ...woo, key: event.target.value })} /></label>
            <label>Consumer secret<input required type="password" autoComplete="new-password" value={woo.secret} onChange={(event) => setWoo({ ...woo, secret: event.target.value })} /></label>
            <button className="button" disabled={Boolean(busy)}>{busy === 'WOOCOMMERCE' ? 'Connecting…' : 'Connect WooCommerce'}</button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-title"><div><h2>Shopify</h2><p>Custom app Admin API access token from Shopify → Settings → Apps.</p></div><span className="panel-badge">Website</span></div>
          <form className="integration-form" onSubmit={(event) => { event.preventDefault(); connectProvider('SHOPIFY', shopify, 'Shopify'); setShopify((current) => ({ ...current, accessToken: '' })); }}>
            <label>Shop domain<input required placeholder="your-store.myshopify.com" value={shopify.shop} onChange={(event) => setShopify({ ...shopify, shop: event.target.value })} /></label>
            <label>Admin API access token<input required type="password" autoComplete="new-password" value={shopify.accessToken} onChange={(event) => setShopify({ ...shopify, accessToken: event.target.value })} /></label>
            <button className="button" disabled={Boolean(busy)}>{busy === 'SHOPIFY' ? 'Connecting…' : 'Connect Shopify'}</button>
          </form>
        </section>
      </div>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Connected stores</h2>
        {integrations.filter((item) => item.provider === 'WOOCOMMERCE' || item.provider === 'SHOPIFY').length === 0
          ? <p className="muted">No website store connected yet. Use either card above.</p>
          : integrations.filter((item) => item.provider === 'WOOCOMMERCE' || item.provider === 'SHOPIFY').map((integration) => (
            <div className="integration-health" key={integration.id}>
              <div>
                <strong>{integration.provider === 'SHOPIFY' ? 'Shopify' : 'WooCommerce'}</strong>
                <small>Last sync: {integration.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString() : 'Not synced yet'}</small>
                {integration.lastError && <small className="integration-error">{integration.lastError}</small>}
              </div>
              <div className="integration-health-actions">
                <span className={`status-badge status-${String(integration.status).toLowerCase()}`}>{integration.status}</span>
                <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => sync(integration)}>Sync orders</button>
                <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => sync(integration, true)}>Reconcile</button>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
