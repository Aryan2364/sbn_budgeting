import type { ModuleCatalogue } from './types';

/**
 * Complaints (access plan section 5.3.2, corrected by RESOLUTIONS C1).
 * No see amounts.
 *
 * The workflow layer (plan section 6.2) sits on top of these keys and
 * still decides, per complaint, whether this person is the supervisor
 * or the approver. A key only says the person may do the kind of thing.
 *
 * Routes (put on the handlers in P2b):
 *   view      GET /complaints, /counts, /summary, /:id, /:id/photos/:photoId
 *   raise     GET /complaints/sites, POST /complaints
 *   comment   POST /:id/comments
 *   work      POST /:id/start, /:id/resolve
 *   approve   POST /:id/approve, /:id/send-back   (C1)
 *   reassign  POST /:id/reassign
 *   categories.manage  GET/POST/PATCH/DELETE /complaint-categories[/:id]
 *
 * There is ONE reassign key (O6). At Own it reaches the complaints where
 * you are the manager or HOD (ownColumns), which is today's member rule;
 * at All it reaches every complaint, today's admin rule.
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
          key: 'approve',
          label: 'approve or send back complaints',
          short: 'Approve',
        },
        {
          key: 'reassign',
          label: 'reassign complaints',
          short: 'Reassign',
          ownColumns: ['manager_id', 'hod_id'],
          // Choosing the new supervisor means choosing from everyone.
          needs: [{ pick: 'platform.people', scope: 'all' }],
        },
      ],
    },
    {
      key: 'categories',
      label: 'Categories',
      record: 'master',
      // The raise form tells the raiser whether closing needs approval,
      // and by whom, before they submit; the list filter keeps retired
      // categories findable (GET /pick/complaints/categories).
      pick: {
        everyone: true,
        fields: ['id', 'name', 'isActive', 'requiresApproval', 'approverDesignation'],
      },
      actions: [{ key: 'manage', label: 'manage complaint categories', short: 'Manage' }],
    },
  ],
} as const satisfies ModuleCatalogue;
