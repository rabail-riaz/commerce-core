import { notFound } from 'next/navigation';
import PortalPage from '../../components/PortalPage';

const categories = new Set(['vendors', 'purchase-orders', 'expenses']);

export default async function AccountingCategoryPage({ params }) {
  const { category } = await params;
  if (!categories.has(category)) notFound();
  return <PortalPage section="Accounting" category={category} />;
}
