import { MembershipRole } from '@prisma/client';

export const PERMISSIONS = [
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.cancel',
  'customers.read',
  'customers.update',
  'products.read',
  'products.create',
  'products.update',
  'products.delete',
  'shipping.read',
  'shipping.book',
  'shipping.cancel',
  'communications.read',
  'communications.send',
  'campaigns.read',
  'campaigns.create',
  'campaigns.send',
  'integrations.read',
  'integrations.manage',
  'tickets.read',
  'tickets.update',
  'reports.read',
  'automations.read',
  'automations.manage',
  'settings.manage',
  'exports.create',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_PERMISSIONS: Permission[] = [
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.cancel',
  'customers.read',
  'customers.update',
  'products.read',
  'products.create',
  'products.update',
  'products.delete',
  'shipping.read',
  'shipping.book',
  'shipping.cancel',
  'communications.read',
  'communications.send',
  'campaigns.read',
  'campaigns.create',
  'campaigns.send',
  'tickets.read',
  'tickets.update',
  'reports.read',
  'automations.read',
  'automations.manage',
];

export const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  SALES_AGENT: ['orders.read', 'orders.create', 'orders.update', 'customers.read', 'customers.update', 'products.read', 'communications.read', 'communications.send', 'campaigns.read', 'campaigns.create', 'tickets.read'],
  SUPPORT_AGENT: ['customers.read', 'customers.update', 'communications.read', 'communications.send', 'campaigns.read', 'tickets.read', 'tickets.update'],
  OPERATIONS_AGENT: ['orders.read', 'orders.update', 'orders.cancel', 'products.read', 'shipping.read', 'shipping.book', 'shipping.cancel', 'integrations.read', 'tickets.read', 'reports.read'],
  VIEWER: ['orders.read', 'customers.read', 'shipping.read', 'communications.read', 'campaigns.read', 'integrations.read', 'tickets.read', 'reports.read'],
};

export function permissionsForRole(role: MembershipRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
