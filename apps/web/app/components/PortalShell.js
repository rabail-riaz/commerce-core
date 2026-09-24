'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
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

const navigation = [
  ['Dashboard', '/dashboard', '⌂'],
  ['Orders', '/orders', '▤'],
  ['Customers', '/customers', '♙'],
  ['Products', '/products', '□'],
  ['Shipping', '/shipping', '⇢'],
  ['Returns', '/returns', '↩'],
  ['Inbox', '/inbox', '✉'],
  ['Support', '/support', '?'],
  ['Campaigns', '/campaigns', '✦'],
  ['Automations', '/automations', '⚙'],
  ['Reports', '/reports', '▥'],
  ['Integrations', '/integrations', '◈'],
  ['Settings', '/settings', '☷'],
];

export default function PortalShell({ section, user, tenant }) {
  const router = useRouter();
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? user.email[0]}`.toUpperCase();
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    api.listNotifications().then((response) => setNotifications(response.data ?? response)).catch(() => {});
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    router.replace('/login');
  }

  return (
    <div className="portal">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Commerce<span className="brand-muted">Core</span></span></div>
        <div className="workspace"><span className="workspace-label">WORKSPACE</span><strong>{tenant.name}</strong><span className="status-dot">● Active</span></div>
        <nav className="nav" aria-label="Main navigation">
          {navigation.map(([label, href, icon]) => (
            <Link className={section === label ? 'nav-link active' : 'nav-link'} href={href} key={label}>
              <span className="nav-icon">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer"><span>Commerce Core</span><small>Operations workspace</small></div>
      </aside>
      <main className="portal-main">
        <header className="topbar">
          <div><span className="breadcrumb">Workspace / </span><strong>{section}</strong></div>
          <div className="topbar-actions">
            <div className="notification-menu">
              <button className="icon-button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}>♢ {notifications.filter((item) => item.status === 'UNREAD').length || ''}</button>
              {showNotifications && (
                <div className="notification-list">
                  {notifications.length ? notifications.map((item) => (
                    <button key={item.id} onClick={() => api.markNotificationRead(item.id).then(() => setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, status: 'READ' } : row)))}>
                      <strong>{item.title}</strong>
                      <small>{item.body}</small>
                    </button>
                  )) : <p className="muted">No notifications</p>}
                </div>
              )}
            </div>
            <div className="user-menu"><span className="avatar">{initials}</span><span className="user-details"><strong>{user.firstName || user.email.split('@')[0]}</strong><small>{user.email}</small></span><button className="logout-button" onClick={logout}>Sign out</button></div>
          </div>
        </header>
        <section className="content">
          <div className="content-heading"><div><p className="eyebrow">OVERVIEW</p><h1>{section}</h1><p className="muted">{section === 'Dashboard' ? 'A clear view of your commerce operations.' : `${section} workspace is ready for your team.`}</p></div><span className="date-chip">Today · {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
          {section === 'Dashboard' ? <DashboardContent tenant={tenant} /> : section === 'Orders' ? <OrdersContent /> : section === 'Customers' ? <CustomersContent /> : section === 'Products' ? <ProductsContent /> : section === 'Shipping' ? <ShippingContent /> : section === 'Returns' ? <ReturnsContent /> : section === 'Inbox' ? <InboxContent /> : section === 'Support' ? <SupportContent /> : section === 'Campaigns' ? <CampaignsContent /> : section === 'Automations' ? <AutomationsContent /> : section === 'Reports' ? <ReportsContent /> : section === 'Integrations' ? <IntegrationsContent /> : section === 'Settings' ? <SettingsContent /> : <EmptyContent section={section} />}
        </section>
      </main>
    </div>
  );
}

function DashboardContent({ tenant }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.dashboardSummary().then((response) => {
      if (active) setSummary(response.data ?? response);
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'Unable to load dashboard metrics.');
    });
    return () => { active = false; };
  }, []);

  const period = (title, subtitle, cards) => <section className="dashboard-section"><div className="dashboard-section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="stat-grid">{cards.map(([label, metric, formatter]) => <Stat key={label} label={label} value={summary ? formatter ? formatter(summary[metric]) : summary[metric] : '—'} hint={title} />)}</div></section>;

  return <>{error && <div className="error">{error}</div>}{period('Today', 'Activity since midnight UTC.', [['Orders', 'todayOrders'], ['Revenue', 'todayRevenue', formatDashboardMoney], ['New customers', 'newCustomers'], ['Returning customers', 'returningCustomers']])}{period('This week', 'Orders and revenue from the current calendar week.', [['Orders', 'weeklyOrders'], ['Revenue', 'weeklyRevenue', formatDashboardMoney]])}{period('This month', 'Orders and revenue from the current calendar month.', [['Orders', 'monthlyOrders'], ['Revenue', 'monthlyRevenue', formatDashboardMoney]])}{period('Overall', 'Current status and all-time totals for this workspace.', [['Orders', 'overallOrders'], ['Revenue', 'overallRevenue', formatDashboardMoney], ['Pending', 'pendingOrders'], ['Out for delivery', 'outForDelivery'], ['Delivered', 'delivered'], ['Returned', 'returned']])}<div className="panel-grid"><div className="panel"><div className="panel-title"><div><h2>Getting started</h2><p>Set up your workspace for daily operations.</p></div><span className="panel-badge">Phase 1</span></div><div className="check-row"><span className="check done">✓</span><div><strong>Workspace created</strong><small>{tenant.name} is ready to configure.</small></div></div><div className="check-row"><span className="check">2</span><div><strong>Connect an integration</strong><small>Bring orders and customers into one place.</small></div><Link href="/integrations" className="text-link">View integrations →</Link></div><div className="check-row"><span className="check">3</span><div><strong>Invite your team</strong><small>Give operators the right access.</small></div><Link href="/settings" className="text-link">Manage settings →</Link></div></div><div className="panel quick-panel"><h2>Quick actions</h2><Link href="/orders" className="quick-action"><span>＋</span><div><strong>View orders</strong><small>Review operational order activity</small></div><b>→</b></Link><Link href="/integrations" className="quick-action"><span>◈</span><div><strong>Manage integrations</strong><small>Connect a commerce platform</small></div><b>→</b></Link></div></div></>;
}

function Stat({ label, value, hint }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function formatDashboardMoney(value) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value ?? 0)); }
function EmptyContent({ section }) { return <div className="empty-state"><div className="empty-icon">✦</div><h2>{section} is ready</h2><p>This area is part of your operations shell. Feature workflows will be added in the next phase.</p><Link href="/dashboard" className="button">Back to dashboard</Link></div>; }
