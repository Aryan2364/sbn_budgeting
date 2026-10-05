import type { ModuleCatalogue } from './types';

/**
 * Complaints (access plan section 5.3.2, corrected by RESOLUTIONS C1).
 * No see amounts.
 *
 * The workflow layer (plan section 6.2) sits on top of these keys and
 * still decides, per complaint, whether this person is its supervisor.
 * A key only says the person may do the kind of thing. There is no
 * approval step (owner decision, 5 Oct 2026): resolving closes it.
 *
 * Routes (put on the handlers in P2b):
 *   view      GET /complaints, /counts, /summary, /:id, /:id/photos/:photoId
 *   raise     GET /complaints/sites, POST /complaints
 *   comment   POST /:id/comments
 *   work      POST /:id/start, /:id/resolve
 *   reassign  POST /:id/reassign
 *   categories.manage  GET/POST/PATCH/DELETE /complaint-categories[/:id]
 *
 * There is ONE reassign key (O6). At Own it reaches the complaints where
 * you are the manager (ownColumns); at All it reaches every complaint.
 */
export const complaintsCatalogue = {
  module: 'complaints',
  label: 'Complaints',
  sections: [
    {
      key: 'complaints',
      label: 'Complaints',
      record: 'complaint',
      actions: [
        { key: 'view', label: 'view complaints', short: 'View' },
        {
          key: 'raise',
          label: 'raise complaints',
          short: 'Raise',
          // Anyone raising a complaint chooses from every site (decision
          // 12's own example, O5): the site is checked against this Pick.
          needs: [{ pick: 'budget.sites', scope: 'all' }],
          createSiteFrom: 'pick',
        },
        { key: 'comment', label: 'comment on complaints', short: 'Comment' },
        {
          key: 'work',
          label: 'start and resolve complaints assigned to them',
          short: 'Work',
        },
        {
          key: 'reassign',
          label: 'reassign complaints',
          short: 'Reassign',
          ownColumns: ['manager_id'],
          // Choosing the new supervisor means choosing from everyone.
          needs: [{ pick: 'platform.people', scope: 'all' }],
        },
      ],
    },
    {
      key: 'categories',
      label: 'Categories',
      record: 'master',
      // The raise form chooses from it; the list filter keeps retired
      // categories findable (GET /pick/complaints/categories).
      pick: { everyone: true, fields: ['id', 'name', 'isActive'] },
      actions: [{ key: 'manage', label: 'manage complaint categories', short: 'Manage' }],
    },
  ],
} as const satisfies ModuleCatalogue;
