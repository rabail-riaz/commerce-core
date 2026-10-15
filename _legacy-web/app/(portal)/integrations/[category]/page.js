import { notFound } from 'next/navigation';
import PortalContent from '../../../components/PortalContent';

const categories = new Set(['website', 'courier', 'email', 'whatsapp']);

export default async function IntegrationCategoryPage({ params }) {
  const { category } = await params;
  if (!categories.has(category)) notFound();
  return <PortalContent section="Integrations" category={category} />;
}
