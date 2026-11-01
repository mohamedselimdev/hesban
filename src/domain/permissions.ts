export const roles = ['owner', 'manager', 'cashier'] as const;
export type Role = (typeof roles)[number];

/**
 * Every action the application can authorise. Enforced in the main process before a command
 * runs; the user interface only hides what a role cannot do.
 */
export const permissions = [
  'sales.create',
  'sales.credit',
  'sales.discount.limited',
  'sales.discount.override',
  'sales.price.override',
  'sales.below_cost',
  'sales.credit_limit.override',
  'sales.return',
  'sales.cancel.same_day',
  'sales.cancel.any',
  'purchases.manage',
  'suppliers.pay',
  'stock.adjust',
  'stock.adjust.large',
  'catalog.manage',
  'cost.view',
  'profit.view',
  'reports.view',
  'day.close',
  'backup.create',
  'backup.restore',
  'audit.view',
  'users.manage',
  'settings.manage',
  'license.manage',
  'export.full',
] as const;
export type Permission = (typeof permissions)[number];

const cashier: readonly Permission[] = ['sales.create', 'sales.credit', 'sales.discount.limited'];

const manager: readonly Permission[] = [
  ...cashier,
  'sales.discount.override',
  'sales.price.override',
  'sales.below_cost',
  'sales.credit_limit.override',
  'sales.return',
  'sales.cancel.same_day',
  'purchases.manage',
  'suppliers.pay',
  'stock.adjust',
  'catalog.manage',
  'cost.view',
  'profit.view',
  'reports.view',
  'day.close',
  'backup.create',
];

const owner: readonly Permission[] = permissions;

/** Role → permissions, mirroring the matrix in docs/04-business-rules.md §8. */
export const rolePermissions: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(owner),
  manager: new Set(manager),
  cashier: new Set(cashier),
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roles as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
