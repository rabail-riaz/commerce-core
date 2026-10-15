'use client';

import Link from 'next/link';
import { usePortal } from './portal-context';
import DashboardContent from './DashboardContent';
import OrdersContent from './OrdersContent';
import CustomersContent from './CustomersContent';
import ProductsContent from './ProductsContent';
import IntegrationsContent from './IntegrationsContent';
import ShippingContent from './ShippingContent';
import ReturnsContent from './ReturnsContent';
import InboxContent from './InboxContent';
import SupportContent from './SupportContent';
import CampaignsContent from './CampaignsContent';
import AutomationsContent from './AutomationsContent';
import ReportsContent from './ReportsContent';
import SettingsContent from './SettingsContent';
import AccountingContent from './AccountingContent';

export default function PortalContent({ section, category }) {
  const { tenant } = usePortal();
  if (section === 'Dashboard') return <DashboardContent tenant={tenant} />;
  if (section === 'Orders') return <OrdersContent />;
  if (section === 'Customers') return <CustomersContent />;
  if (section === 'Products') return <ProductsContent />;
  if (section === 'Shipping') return <ShippingContent />;
  if (section === 'Returns') return <ReturnsContent />;
  if (section === 'Inbox') return <InboxContent />;
  if (section === 'Support') return <SupportContent />;
  if (section === 'Campaigns') return <CampaignsContent />;
  if (section === 'Automations') return <AutomationsContent />;
  if (section === 'Reports') return <ReportsContent />;
  if (section === 'Accounting') return <AccountingContent category={category} />;
  if (section === 'Integrations') return <IntegrationsContent category={category} />;
  if (section === 'Settings') return <SettingsContent />;
  return <EmptyContent section={section} />;
}

function EmptyContent({ section }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">✦</div>
      <h2>{section} is ready</h2>
      <p>This area is part of your operations shell. Feature workflows will be added in the next phase.</p>
      <Link href="/dashboard" className="button">Back to dashboard</Link>
    </div>
  );
}
