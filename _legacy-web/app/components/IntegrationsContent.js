'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';
import WebsiteIntegrations from './integrations/WebsiteIntegrations';
import CourierIntegrations from './integrations/CourierIntegrations';
import EmailIntegrations from './integrations/EmailIntegrations';
import WhatsAppIntegrations from './integrations/WhatsAppIntegrations';

const cards = [
  { key: 'website', href: '/integrations/website', icon: '⌂', title: 'Website', copy: 'Connect WooCommerce or Shopify and import orders into this workspace.', metric: (overview) => `${overview?.website?.connected ?? 0} connected` },
  { key: 'courier', href: '/integrations/courier', icon: '⇢', title: 'Courier', copy: 'Choose Pakistan couriers and save API credentials for one or more providers.', metric: (overview) => `${overview?.courier?.connected ?? 0} of ${overview?.courier?.total ?? 0} configured` },
  { key: 'email', href: '/integrations/email', icon: '✉', title: 'Email', copy: 'Add SMTP or mailbox accounts for notifications and inbox replies.', metric: (overview) => `${overview?.email?.connected ?? 0} active` },
  { key: 'whatsapp', href: '/integrations/whatsapp', icon: '✆', title: 'WhatsApp', copy: 'Connect Meta Cloud API to send and receive customer messages.', metric: (overview) => `${overview?.whatsapp?.connected ?? 0} active` },
];

export default function IntegrationsContent({ category }) {
  if (category === 'website') return <WebsiteIntegrations />;
  if (category === 'courier') return <CourierIntegrations />;
  if (category === 'email') return <EmailIntegrations />;
  if (category === 'whatsapp') return <WhatsAppIntegrations />;
  return <IntegrationsHub />;
}

function IntegrationsHub() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.integrationsOverview().then((response) => setOverview(response.data ?? response)).catch((requestError) => {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to load integrations.');
    });
  }, []);

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="integration-hub">
        {cards.map((card) => (
          <Link className="integration-hub-card" href={card.href} key={card.key}>
            <span className="integration-hub-icon">{card.icon}</span>
            <div>
              <h2>{card.title}</h2>
              <p>{card.copy}</p>
            </div>
            <strong>{card.metric(overview)}</strong>
            <span className="text-link">Open →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
