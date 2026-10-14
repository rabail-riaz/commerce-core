import PortalPage from '../components/PortalPage';

const sections = new Set([
  'orders', 'customers', 'products', 'shipping', 'returns', 'inbox',
  'support', 'campaigns', 'automations', 'reports', 'settings',
]);

export default async function SectionPage({ params }) {
  const { section } = await params;
  const title = sections.has(section) ? section[0].toUpperCase() + section.slice(1) : 'Dashboard';
  return <PortalPage section={title} />;
}
