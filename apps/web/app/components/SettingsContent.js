'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function SettingsContent() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [flags, setFlags] = useState({});
  const [whatsapp, setWhatsapp] = useState({ displayName: '', phoneNumberId: '', accessToken: '', verifyToken: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      setUsers(unwrap(await api.listUsers()));
      const roleResult = unwrap(await api.listRoles());
      setRoles(roleResult.items ?? roleResult);
      setSubscription(unwrap(await api.getSubscription()));
      setFlags(unwrap(await api.getFeatureFlags()));
      setError('');
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load settings.'); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="panel-grid">
      <section className="panel">
        <h2>Workspace users</h2>
        {error && <div className="error">{error}</div>}
        {users.map((item) => <div className="check-row" key={item.id}><div><strong>{item.user.email}</strong><small>{item.role} · {item.user.isActive ? 'Active' : 'Inactive'}</small></div></div>)}
        <h2>Roles</h2>
        {roles.map((role) => <div className="check-row" key={role.id}><div><strong>{role.name}</strong><small>{role.status}</small></div></div>)}
      </section>
      <section className="panel">
        <h2>Subscription</h2>
        {subscription && <p className="muted">{subscription.status} · {subscription.plan?.name} · trial ends {subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString() : '—'}</p>}
        <h2>Feature flags</h2>
        {Object.entries(flags).map(([key, enabled]) => <div className="check-row" key={key}><div><strong>{key}</strong><small>{enabled ? 'Enabled' : 'Disabled'}</small></div></div>)}
        <h2>WhatsApp account</h2>
        <form className="integration-form" onSubmit={async (event) => { event.preventDefault(); await api.saveWhatsAppAccount(whatsapp); await load(); }}>
          <label>Display name<input value={whatsapp.displayName} onChange={(event) => setWhatsapp({ ...whatsapp, displayName: event.target.value })} required /></label>
          <label>Phone number ID<input value={whatsapp.phoneNumberId} onChange={(event) => setWhatsapp({ ...whatsapp, phoneNumberId: event.target.value })} required /></label>
          <label>Access token<input type="password" value={whatsapp.accessToken} onChange={(event) => setWhatsapp({ ...whatsapp, accessToken: event.target.value })} /></label>
          <button className="button">Save WhatsApp</button>
        </form>
        <div className="orders-filters" style={{ marginTop: 16 }}>
          <button className="button button-secondary" type="button" onClick={() => api.exportCsv('customers')}>Export customers</button>
          <button className="button button-secondary" type="button" onClick={() => api.exportCsv('shipments')}>Export shipments</button>
          <button className="button button-secondary" type="button" onClick={() => api.exportCsv('returns')}>Export returns</button>
        </div>
      </section>
    </div>
  );
}
