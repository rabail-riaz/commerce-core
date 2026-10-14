'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export default function InboxContent() {
  const [channel, setChannel] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try { setItems(unwrap(await api.listInbox({ channel }))); setError(''); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load inbox.'); }
  }
  useEffect(() => { load(); }, [channel]);

  async function openItem(item) {
    try {
      const response = unwrap(await api.getInboxConversation(item.channel, item.id));
      const detail = response.conversation ?? response;
      await api.markInboxRead(item.channel, item.id);
      setSelected({ ...item, detail });
      setReply('');
    } catch (requestError) { setError(requestError.message); }
  }

  async function sendReply() {
    if (!selected || !reply) return;
    try {
      await api.replyInbox(selected.channel, selected.id, { body: reply });
      setReply('');
      await openItem(selected);
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <div className="panel-grid">
      <section className="panel">
        <div className="panel-title"><div><h2>Unified inbox</h2><p>Email and WhatsApp in one list.</p></div>
          <select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">All channels</option><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option></select>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="email-thread-list">
          {items.length ? items.map((item) => (
            <button className={item.unreadCount ? 'email-thread unread' : 'email-thread'} key={`${item.channel}-${item.id}`} onClick={() => openItem(item)}>
              <div><strong>{item.title}</strong><small>{item.channel} · {item.preview || 'No preview'}</small></div>
              <div><small>{date(item.lastMessageAt)}</small>{item.unreadCount > 0 && <span className="status-badge status-active">{item.unreadCount}</span>}</div>
            </button>
          )) : <p className="muted">No conversations yet.</p>}
        </div>
      </section>
      {selected && (
        <section className="panel">
          <div className="panel-title"><div><h2>{selected.title}</h2><p>{selected.channel}</p></div><button className="button button-secondary" onClick={() => setSelected(null)}>Close</button></div>
          <div className="email-messages">
            {(selected.detail.messages || []).map((message) => (
              <article className="email-message" key={message.id}>
                <div className="email-message-header"><strong>{message.direction}</strong><span>{date(message.createdAt || message.sentAt || message.receivedAt)}</span></div>
                <p>{message.textBody || message.body || '(empty)'}</p>
              </article>
            ))}
          </div>
          <label>Reply<textarea value={reply} onChange={(event) => setReply(event.target.value)} rows="4" /></label>
          <button className="button" onClick={sendReply}>Send reply</button>
        </section>
      )}
    </div>
  );
}
