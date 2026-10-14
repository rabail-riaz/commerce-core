'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function AutomationsContent() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', trigger: 'ORDER_DELIVERED', action: 'SEND_WHATSAPP_TEMPLATE', delayMinutes: 2880 });
  const [error, setError] = useState('');

  async function load() {
    try { setItems(unwrap(await api.listAutomations())); setError(''); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load automations.'); }
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="panel">
      <div className="panel-title"><div><h2>Automations</h2><p>Simple event → wait → action rules.</p></div></div>
      {error && <div className="error">{error}</div>}
      <form className="integration-form" onSubmit={async (event) => { event.preventDefault(); await api.createAutomation({ ...form, delayMinutes: Number(form.delayMinutes) }); await load(); }}>
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Trigger<select value={form.trigger} onChange={(event) => setForm({ ...form, trigger: event.target.value })}><option>ORDER_DELIVERED</option><option>ORDER_CREATED</option><option>RETURN_REQUESTED</option></select></label>
        <label>Action<select value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}><option>SEND_WHATSAPP_TEMPLATE</option><option>SEND_EMAIL_TEMPLATE</option><option>CREATE_TICKET</option></select></label>
        <label>Delay (minutes)<input type="number" value={form.delayMinutes} onChange={(event) => setForm({ ...form, delayMinutes: event.target.value })} /></label>
        <button className="button">Create rule</button>
      </form>
      {items.map((item) => (
        <div className="check-row" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.trigger} → wait {item.delayMinutes}m → {item.action}</small></div>
          <button className="button button-secondary" onClick={async () => { await api.executeAutomation(item.id); await load(); }}>Test run</button>
        </div>
      ))}
    </section>
  );
}
