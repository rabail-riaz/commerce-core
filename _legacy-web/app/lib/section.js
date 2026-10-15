const SIMPLE_SECTIONS = [
  'orders', 'customers', 'products', 'shipping', 'returns', 'inbox',
  'support', 'campaigns', 'automations', 'reports', 'settings',
];

export function sectionAndCategoryFromPathname(pathname) {
  const [first, second] = pathname.split('/').filter(Boolean);
  if (first === 'accounting') return { section: 'Accounting', category: second };
  if (first === 'integrations') return { section: 'Integrations', category: second };
  if (SIMPLE_SECTIONS.includes(first)) return { section: first[0].toUpperCase() + first.slice(1), category: undefined };
  return { section: 'Dashboard', category: undefined };
}
