'use client';

import Link from 'next/link';
import VendorsPanel from './accounting/VendorsPanel';
import PurchaseOrdersPanel from './accounting/PurchaseOrdersPanel';
import ExpensesPanel from './accounting/ExpensesPanel';

const cards = [
  { key: 'vendors', href: '/accounting/vendors', icon: '🏭', title: 'Vendors', copy: 'Add and manage the vendors you buy from.' },
  { key: 'purchase-orders', href: '/accounting/purchase-orders', icon: '📦', title: 'Purchase orders', copy: 'Record orders you place with vendors, with line items and totals.' },
  { key: 'expenses', href: '/accounting/expenses', icon: '🧾', title: 'Expenses', copy: 'Track bilty, transportation, and other costs — optionally linked to a purchase order.' },
];

export default function AccountingContent({ category }) {
  if (category === 'vendors') return <VendorsPanel />;
  if (category === 'purchase-orders') return <PurchaseOrdersPanel />;
  if (category === 'expenses') return <ExpensesPanel />;
  return <AccountingHub />;
}

function AccountingHub() {
  return (
    <div className="integration-hub">
      {cards.map((card) => (
        <Link className="integration-hub-card" href={card.href} key={card.key}>
          <span className="integration-hub-icon">{card.icon}</span>
          <div>
            <h2>{card.title}</h2>
            <p>{card.copy}</p>
          </div>
          <span className="text-link">Open →</span>
        </Link>
      ))}
    </div>
  );
}
