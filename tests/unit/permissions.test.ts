import { describe, expect, it } from 'vitest';
import {
  can,
  isRole,
  permissions,
  rolePermissions,
  roles,
  type Permission,
} from '../../src/domain/permissions';

/** Independent copy of docs/04-business-rules.md §8, written out by hand. */
const expected: Record<string, { cashier: boolean; manager: boolean; owner: boolean }> = {
  'sales.create': { cashier: true, manager: true, owner: true },
  'sales.credit': { cashier: true, manager: true, owner: true },
  'sales.discount.limited': { cashier: true, manager: true, owner: true },
  'sales.discount.override': { cashier: false, manager: true, owner: true },
  'sales.price.override': { cashier: false, manager: true, owner: true },
  'sales.below_cost': { cashier: false, manager: true, owner: true },
  'sales.credit_limit.override': { cashier: false, manager: true, owner: true },
  'sales.return': { cashier: false, manager: true, owner: true },
  'sales.cancel.same_day': { cashier: false, manager: true, owner: true },
  'sales.cancel.any': { cashier: false, manager: false, owner: true },
  'purchases.manage': { cashier: false, manager: true, owner: true },
  'suppliers.pay': { cashier: false, manager: true, owner: true },
  'stock.adjust': { cashier: false, manager: true, owner: true },
  'stock.adjust.large': { cashier: false, manager: false, owner: true },
  'catalog.manage': { cashier: false, manager: true, owner: true },
  'cost.view': { cashier: false, manager: true, owner: true },
  'profit.view': { cashier: false, manager: true, owner: true },
  'reports.view': { cashier: false, manager: true, owner: true },
  'day.close': { cashier: false, manager: true, owner: true },
  'backup.create': { cashier: false, manager: true, owner: true },
  'backup.restore': { cashier: false, manager: false, owner: true },
  'audit.view': { cashier: false, manager: false, owner: true },
  'users.manage': { cashier: false, manager: false, owner: true },
  'settings.manage': { cashier: false, manager: false, owner: true },
  'license.manage': { cashier: false, manager: false, owner: true },
  'export.full': { cashier: false, manager: false, owner: true },
};

describe('permission matrix', () => {
  it('matches the written matrix exactly, for every role and permission', () => {
    expect(Object.keys(expected).sort()).toEqual([...permissions].sort());
    for (const permission of permissions) {
      const row = expected[permission];
      for (const role of roles) {
        expect(can(role, permission), `${role} ${permission}`).toBe(row?.[role]);
      }
    }
  });

  it('is a strict hierarchy: cashier ⊂ manager ⊂ owner', () => {
    const c = rolePermissions.cashier;
    const m = rolePermissions.manager;
    const o = rolePermissions.owner;
    for (const p of c) expect(m.has(p)).toBe(true);
    for (const p of m) expect(o.has(p)).toBe(true);
    expect(c.size).toBeLessThan(m.size);
    expect(m.size).toBeLessThan(o.size);
    expect(o.size).toBe(permissions.length);
  });

  it('keeps the dangerous permissions away from cashiers and managers', () => {
    const cashierDenied: Permission[] = [
      'cost.view',
      'profit.view',
      'sales.return',
      'backup.create',
      'users.manage',
    ];
    for (const p of cashierDenied) expect(can('cashier', p), p).toBe(false);
    const managerDenied: Permission[] = [
      'users.manage',
      'backup.restore',
      'audit.view',
      'export.full',
      'license.manage',
      'settings.manage',
    ];
    for (const p of managerDenied) expect(can('manager', p), p).toBe(false);
  });

  it('has no duplicate permission names and validates role names', () => {
    expect(new Set(permissions).size).toBe(permissions.length);
    expect(isRole('owner')).toBe(true);
    for (const bad of ['Owner', 'admin', '', null, undefined, 1, {}])
      expect(isRole(bad)).toBe(false);
  });
});
