import type { ModuleCatalogue } from './types';

/**
 * Settings, module `platform` (access plan section 5.3.3). No see amounts.
 *
 * Routes (put on the handlers in P2b):
 *   people.view    GET /users, GET /users/:id
 *   people.create  POST /users, POST /users/import/*
 *   people.edit    PATCH /users/:id (except active and reportsToId,
 *                  which need access.rights.manage, O8)
 *   people.delete  DELETE /users/:id
 *   designations.manage, locations.manage  their master routes
 *
 * The Picks (pick/platform-pick.controller.ts, R11.7):
 *   /pick/platform/people        id, name, designationName (O10 Q7);
 *                                narrowing filters designationId,
 *                                canReceive (active and can sign in) and
 *                                holds (holds that permission key; the
 *                                reassign dialog asks for
 *                                complaints.complaints.work).
 *   /pick/platform/designations  id, name, isActive (with
 *                                includeInactive=true). No logic
 *                                branches on a designation (owner, 5 Oct 2026).
 *   /pick/platform/locations     id, name, isActive (likewise).
 * GET /users/picker stays an alias of /pick/platform/people until P11.
 */
export const platformCatalogue = {
  module: 'platform',
  label: 'Settings',
  sections: [
    {
      key: 'people',
      label: 'People',
      record: 'person',
      pick: { fields: ['id', 'name', 'designationName'] },
      actions: [
        { key: 'view', label: 'view people', short: 'View' },
        { key: 'create', label: 'add people', short: 'Add' },
        { key: 'edit', label: 'edit people', short: 'Edit' },
        { key: 'delete', label: 'delete people', short: 'Delete' },
      ],
    },
    {
      key: 'designations',
      label: 'Designations',
      record: 'master',
      pick: { everyone: true, fields: ['id', 'name', 'isActive'] },
      actions: [{ key: 'manage', label: 'manage designations', short: 'Manage' }],
    },
    {
      key: 'locations',
      label: 'Locations',
      record: 'master',
      pick: { everyone: true, fields: ['id', 'name', 'isActive'] },
      actions: [{ key: 'manage', label: 'manage locations', short: 'Manage' }],
    },
  ],
} as const satisfies ModuleCatalogue;
