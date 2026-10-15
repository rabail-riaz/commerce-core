import { notFound } from 'next/navigation';
import PortalContent from '../../../components/PortalContent';

const categories = new Set(['vendors', 'purchase-orders', 'expenses']);

export default async function AccountingCategoryPage({ params }) {
  const { category } = await params;
  if (!categories.has(category)) notFound();
  return <PortalContent section="Accounting" category={category} />;
}
