'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, clearSession } from '../lib/api-client';
import { sectionAndCategoryFromPathname } from '../lib/section';
import { PortalContext } from '../components/portal-context';

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
  ['Accounting', '/accounting', '$'],
  ['Integrations', '/integrations', '◈'],
  ['Settings', '/settings', '☷'],
];

const integrationCopy = {
  website: ['WEBSITE', 'Website stores', 'Connect WooCommerce or Shopify and import catalog and orders.'],
  courier: ['COURIERS', 'Pakistan couriers', 'Configure one or more courier APIs used for booking shipments.'],
  email: ['EMAIL', 'Email', 'Connect mailboxes for sending and receiving operations mail.'],
  whatsapp: ['WHATSAPP', 'WhatsApp', 'Connect Meta Cloud API for customer conversations.'],
};

const accountingCopy = {
  vendors: ['ACCOUNTING', 'Vendors', 'Add and manage the vendors you buy from.'],
  'purchase-orders': ['ACCOUNTING', 'Purchase orders', 'Record orders you place with vendors, with line items and totals.'],
  expenses: ['ACCOUNTING', 'Expenses', 'Track bilty, transportation, and other costs — optionally linked to a purchase order.'],
};

export default function PortalLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { section, category } = sectionAndCategoryFromPathname(pathname);
  const [state, setState] = useState({ loading: true, user: null, tenant: null, error: '' });
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!sessionStorage.getItem('commerce.accessToken')) {
        router.replace('/login');
        return;
      }
      try {
        const [userResult, tenantResult] = await Promise.all([api.currentUser(), api.currentTenant()]);
        if (active) setState({ loading: false, user: userResult.data ?? userResult, tenant: tenantResult.data ?? tenantResult, error: '' });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status === 401) clearSession();
        if (active) {
          setState({ loading: false, user: null, tenant: null, error: error.message });
          router.replace('/login');
        }
      }
    }
    load();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    api.listNotifications().then((response) => setNotifications(response.data ?? response)).catch(() => {});
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    router.replace('/login');
  }

  if (state.loading) return <main className="portal-loading">Loading workspace…</main>;
  if (!state.user || !state.tenant) return null;

  const { user, tenant } = state;
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? user.email[0]}`.toUpperCase();
  const heading = section === 'Integrations' && category && integrationCopy[category]
    ? integrationCopy[category]
    : section === 'Accounting' && category && accountingCopy[category]
    ? accountingCopy[category]
    : ['OVERVIEW', section, section === 'Dashboard' ? 'A clear view of your commerce operations.' : section === 'Integrations' ? 'Connect website, courier, email, and WhatsApp from one place.' : section === 'Shipping' ? 'Filter shipments by courier, status, and city, and pull live data from connected couriers.' : section === 'Accounting' ? 'Vendors, purchase orders, and expenses in one place.' : `${section} workspace is ready for your team.`];

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
          <div><span className="breadcrumb">Workspace{section === 'Integrations' ? ' / Integrations' : ''} / </span><strong>{heading[1]}</strong></div>
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
          <div className="content-heading"><div><p className="eyebrow">{heading[0]}</p><h1>{heading[1]}</h1><p className="muted">{heading[2]}</p></div><span className="date-chip">Today · {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
          <PortalContext.Provider value={{ user, tenant }}>
            {children}
          </PortalContext.Provider>
        </section>
      </main>
    </div>
  );
}
