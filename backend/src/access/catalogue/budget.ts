import type { ModuleCatalogue } from './types';

/**
 * Budget (access plan section 5.3.1). Has see amounts.
 *
 * Needs: a Pick need with no scope takes the needing permission's scope
 * (decision 12); `scope: 'all'` is a wider scope declared in code.
 * `{ amounts: true }` is O9: the permission makes no sense without
 * budget.amounts.see, so ticking it adds see amounts with a notice.
 *
 * Routes (put on the handlers in P2b):
 *   projects.view     GET /projects, GET /projects/:id
 *   projects.create   POST /projects
 *   projects.edit     PATCH /projects/:id, POST /projects/:id/unlink-sites
 *   projects.delete   DELETE /projects/:id
 *   sites.view        GET /sites, GET /sites/:id
 *   sites.create      POST /sites
 *   sites.edit        PATCH /sites/:id, DELETE /sites/:id/project
 *   sites.change_people  the people half of POST/PATCH /sites (security fix 4)
 *   sites.delete      DELETE /sites/:id
 *   budgets.view      GET /sites/:siteId/budget
 *   budgets.edit      PUT /sites/:siteId/budget
 *   expenses.*        GET/POST/PATCH/DELETE /expenses[/:id]
 *   cost_heads.manage GET/POST/PATCH/DELETE /cost-heads[/:id]
 *   reports.view      GET /reports/variance/*
 */
export const budgetCatalogue = {
  module: 'budget',
  label: 'Budget',
  seeAmounts: {
    covers: 'cost, budgets',
    stripSuffixes: ['Paise'],
    stripKeys: ['spentPct', 'variancePct', 'overBudget'],
  },
  sections: [
    {
      key: 'projects',
      label: 'Projects',
      record: 'project',
      // donorName: the site form defaults a new site's donor from its project (P7 inventory).
      pick: { fields: ['id', 'name', 'donorName'] },
      actions: [
        { key: 'view', label: 'view projects', short: 'View' },
        { key: 'create', label: 'add projects', short: 'Add', needs: [{ pick: 'budget.sites' }] },
        { key: 'edit', label: 'edit projects', short: 'Edit', needs: [{ pick: 'budget.sites' }] },
        { key: 'delete', label: 'delete projects', short: 'Delete' },
      ],
    },
    {
      key: 'sites',
      label: 'Sites',
      record: 'site',
      // projectId: the report scope narrows sites by project. The two dates: the
      // expense form derives the period from them (P7 inventory).
      pick: { fields: ['id', 'name', 'projectId', 'plantationStartDate', 'plantationCompleteDate'] },
      actions: [
        { key: 'view', label: 'view sites', short: 'View', needs: [{ pick: 'budget.projects' }] },
        { key: 'create', label: 'add sites', short: 'Add', needs: [{ pick: 'budget.projects' }] },
        { key: 'edit', label: 'edit sites', short: 'Edit', needs: [{ pick: 'budget.projects' }] },
        {
          key: 'change_people',
          label: "change a site's manager or supervisor",
          short: 'Change people',
          needs: [{ pick: 'platform.people', scope: 'all' }],
        },
        { key: 'delete', label: 'delete sites', short: 'Delete' },
      ],
    },
    {
      key: 'budgets',
      label: 'Budgets',
      record: 'site_budget',
      actions: [
        { key: 'view', label: 'view budgets', short: 'View', needs: [{ amounts: true }] },
        { key: 'edit', label: 'edit budgets', short: 'Edit', needs: [{ amounts: true }] },
      ],
    },
    {
      key: 'expenses',
      label: 'Expenses',
      record: 'expense',
      actions: [
        {
          key: 'view',
          label: 'view expenses',
          short: 'View',
          needs: [{ pick: 'budget.sites' }, { pick: 'budget.projects' }],
        },
        {
          key: 'create',
          label: 'add expenses',
          short: 'Add',
          needs: [{ pick: 'budget.sites' }, { amounts: true }],
        },
        {
          key: 'edit',
          label: 'edit expenses',
          short: 'Edit',
          needs: [{ pick: 'budget.sites' }, { amounts: true }],
        },
        { key: 'delete', label: 'delete expenses', short: 'Delete' },
      ],
    },
    {
      key: 'cost_heads',
      label: 'Cost heads',
      record: 'master',
      // sortOrder: the sheet's own order, which the grid and the expense form list by.
      // isActive: the budget grid offers active heads only.
      pick: { everyone: true, fields: ['id', 'name', 'sortOrder', 'isActive'] },
      actions: [{ key: 'manage', label: 'manage cost heads', short: 'Manage' }],
    },
    {
      key: 'reports',
      label: 'Reports',
      record: 'variance',
      actions: [
        {
          key: 'view',
          label: 'view reports',
          short: 'View',
          needs: [
            { amounts: true },
            { pick: 'budget.sites' },
            { pick: 'budget.projects' },
            { pick: 'platform.people' },
          ],
        },
      ],
    },
  ],
} as const satisfies ModuleCatalogue;
