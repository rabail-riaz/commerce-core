import { notFound } from 'next/navigation';
import PortalPage from '../../components/PortalPage';

const categories = new Set(['website', 'courier', 'email', 'whatsapp']);

export default async function IntegrationCategoryPage({ params }) {
  const { category } = await params;
  if (!categories.has(category)) notFound();
  return <PortalPage section="Integrations" category={category} />;
}
