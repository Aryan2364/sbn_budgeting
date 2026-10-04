import type { AccessCatalogue } from './types';

/**
 * The kit's own `access` catalogue (backend kit 3.2, plan 5.3.4): one
 * module-wide key, `access.rights.manage`, "manage roles and people's
 * access".
 *
 * Held ONLY by Admin, computed, so it is never stored in
 * role_permissions and never offered on an ordinary role (revised O1,
 * kit 40.3 rule 13). Routes: every /access/* route, plus the access
 * fields of PATCH /users/:id (active, reportsToId; O8).
 *
 * `access` is a reserved module name: no product catalogue may use it.
 */
export const accessCatalogue = {
  module: 'access',
  label: 'Access',
  sections: [
    {
      key: 'rights',
      label: 'Access',
      record: 'none',
      actions: [{ key: 'manage', label: "manage roles and people's access", short: 'Manage' }],
    },
  ],
} as const satisfies AccessCatalogue;

export const ACCESS_MANAGE_KEY = 'access.rights.manage' as const;
