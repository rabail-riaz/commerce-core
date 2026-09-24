'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

const unwrap = (response) => response?.data ?? response;

export default function CampaignsContent() {
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [template, setTemplate] = useState({ name: '', channel: 'EMAIL', subject: '', body: 'Hello {{ firstName }}' });
  const [campaign, setCampaign] = useState({ name: '', channel: 'EMAIL', templateId: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      setTemplates(unwrap(await api.listTemplates()));
      setCampaigns(unwrap(await api.listCampaigns()));
      setError('');
    } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Unable to load campaigns.'); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="panel-grid">
      <section className="panel">
        <h2>Templates</h2>
        {error && <div className="error">{error}</div>}
        <form className="integration-form" onSubmit={async (event) => { event.preventDefault(); await api.createTemplate(template); setTemplate({ ...template, name: '' }); await load(); }}>
          <label>Name<input value={template.name} onChange={(event) => setTemplate({ ...template, name: event.target.value })} required /></label>
          <label>Channel<select value={template.channel} onChange={(event) => setTemplate({ ...template, channel: event.target.value })}><option>EMAIL</option><option>WHATSAPP</option></select></label>
          <label>Subject<input value={template.subject} onChange={(event) => setTemplate({ ...template, subject: event.target.value })} /></label>
          <label>Body<textarea value={template.body} onChange={(event) => setTemplate({ ...template, body: event.target.value })} /></label>
          <button className="button">Save template</button>
        </form>
        {templates.map((item) => <div className="check-row" key={item.id}><div><strong>{item.name}</strong><small>{item.channel}{item.provider ? ` · ${item.provider}` : ''}</small></div></div>)}
      </section>
      <section className="panel">
        <h2>Campaigns</h2>
        <form className="integration-form" onSubmit={async (event) => { event.preventDefault(); await api.createCampaign(campaign); await load(); }}>
          <label>Name<input value={campaign.name} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} required /></label>
          <label>Template<select value={campaign.templateId} onChange={(event) => setCampaign({ ...campaign, templateId: event.target.value })}><option value="">Select template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button className="button">Create draft</button>
        </form>
        {campaigns.map((item) => (
          <div className="check-row" key={item.id}>
            <div><strong>{item.name}</strong><small>{item.status} · {item.channel}</small></div>
            {item.status !== 'COMPLETED' && <button className="button button-secondary" onClick={async () => { await api.executeCampaign(item.id); await load(); }}>Run</button>}
          </div>
        ))}
      </section>
    </div>
  );
}
