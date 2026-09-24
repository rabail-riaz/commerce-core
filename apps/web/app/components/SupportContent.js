'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const label = (value) => String(value ?? '').replaceAll('_', ' ');

export default function SupportContent() {
  const [tickets, setTickets] = useState({ items: [] });
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ subject: '', body: '', priority: 'NORMAL' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try { setTickets(unwrap(await api.listTickets({ page: 1, limit: 25 }))); setError(''); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load tickets.'); }
  }
  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault();
    try { await api.createTicket(form); setForm({ subject: '', body: '', priority: 'NORMAL' }); await load(); } catch (requestError) { setError(requestError.message); }
  }

  async function open(ticket) {
    setSelected(unwrap(await api.getTicket(ticket.id)));
  }

  async function addMessage() {
    if (!selected || !message) return;
    await api.addTicketMessage(selected.id, message);
    setMessage('');
    setSelected(unwrap(await api.getTicket(selected.id)));
  }

  return (
    <div className="panel-grid">
      <section className="panel">
        <div className="panel-title"><div><h2>Tickets</h2><p>Assign, update, and reply to support work.</p></div></div>
        {error && <div className="error">{error}</div>}
        <form className="integration-form" onSubmit={create}>
          <label>Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></label>
          <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
          <label>First message<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
          <button className="button">Create ticket</button>
        </form>
        <div className="email-thread-list">{tickets.items?.map((ticket) => <button className="email-thread" key={ticket.id} onClick={() => open(ticket)}><div><strong>{ticket.subject}</strong><small>{label(ticket.status)} · {label(ticket.priority)}</small></div></button>)}</div>
      </section>
      {selected && <section className="panel"><div className="panel-title"><div><h2>{selected.subject}</h2><p>{label(selected.status)} · {label(selected.priority)}</p></div>
        <select value={selected.status} onChange={async (event) => { await api.updateTicket(selected.id, { status: event.target.value }); setSelected(unwrap(await api.getTicket(selected.id))); }}><option>OPEN</option><option>PENDING</option><option>WAITING</option><option>RESOLVED</option><option>CLOSED</option></select>
      </div>
        {selected.messages?.map((item) => <article className="email-message" key={item.id}><strong>{item.author?.email || 'System'}</strong><p>{item.body}</p></article>)}
        <label>Reply<textarea value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <button className="button" onClick={addMessage}>Add message</button>
      </section>}
    </div>
  );
}
