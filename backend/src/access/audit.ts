import type { ClientBase } from 'pg';

import { SCOPES, type Scope } from './catalogue';

/**
 * Writing the access history (access plan 5.1.7, R9, backend kit 4.5).
 *
 * Every access write calls `writeAudit` with ITS OWN transaction's
 * client, before it commits, so a change and its history row commit or
 * roll back together. Never call it with the pool, and never after the
 * commit.
 *
 * The table is append-only (the database refuses UPDATE, DELETE and
 * TRUNCATE) and has no foreign keys: ids are kept for filtering, and the
 * names beside them are snapshots taken now, so history reads as it was
 * even after a person or role is renamed or deleted.
 *
 * The actions are fixed. Each has one History summary (kit 40.10 rule 3):
 *
 *   role.created / role.deleted        target role
 *   role.renamed                       target role (name or description)
 *   role.permissions_changed           target role; before/after are the
 *                                      FULL set, Picks included
 *   user.role_added / user.role_removed  target user; `role` is the role
 *   user.units_changed                 target user; before/after full sets
 *   user.reports_to_changed            target user
 *   user.activated / user.deactivated  target user
 *   unit.lead_changed                  target the site; people's ids and
 *                                      names in before/after
 */

export const AUDIT_ACTIONS = [
  'role.created',
  'role.deleted',
  'role.renamed',
  'role.permissions_changed',
  'user.role_added',
  'user.role_removed',
  'user.units_changed',
  'user.reports_to_changed',
  'user.activated',
  'user.deactivated',
  'unit.lead_changed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTargetType = 'role' | 'user' | 'unit';

/** Who made the change. `id: null` is the system (a migration or the mapping re-sync). */
export interface AuditActor {
  id: string | null;
  name: string;
}

export interface AuditNamed {
  id: string;
  name: string;
}

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  /** The role, person or site changed. Its type follows from the action. */
  target: AuditNamed;
  /** The role concerned: required on role.* and user.role_*; what History's "Affected role" reads. */
  role?: AuditNamed;
  /** Null (omitted) on create. */
  before?: unknown;
  /** Null (omitted) on delete. */
  after?: unknown;
  note?: string;
}

/** The target type each action is recorded against. */
export function targetTypeOf(action: AuditAction): AuditTargetType {
  return action.slice(0, action.indexOf('.')) as AuditTargetType;
}

function needsRole(action: AuditAction): boolean {
  return action.startsWith('role.') || action === 'user.role_added' || action === 'user.role_removed';
}

/** Throws on an entry the History screen could not read. */
export function assertAuditEntry(entry: AuditEntry): void {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(entry.action)) {
    throw new Error(`Unknown access audit action "${entry.action}".`);
  }
  if (!entry.actor.name.trim()) throw new Error('An access audit row needs the actor\'s name.');
  if (!entry.target.id || !entry.target.name.trim()) {
    throw new Error(`An access audit row (${entry.action}) needs the target's id and name.`);
  }
  if (needsRole(entry.action) && (!entry.role?.id || !entry.role.name.trim())) {
    throw new Error(`An access audit row (${entry.action}) needs the role's id and name.`);
  }
}

/** Casts for the eleven inserted columns, in order. */
const COLUMN_CASTS = ['::uuid', '', '', '', '::uuid', '', '::uuid', '', '::jsonb', '::jsonb', ''] as const;

/**
 * Inserts the rows, in the caller's transaction. Returns how many were
 * written. One statement however many rows.
 */
export async function writeAudit(
  db: Pick<ClientBase, 'query'>,
  entries: AuditEntry | readonly AuditEntry[],
): Promise<number> {
  const list = Array.isArray(entries) ? (entries as readonly AuditEntry[]) : [entries as AuditEntry];
  if (list.length === 0) return 0;
  const values: unknown[] = [];
  const tuples: string[] = [];
  for (const e of list) {
    assertAuditEntry(e);
    const row = [
      e.actor.id,
      e.actor.name,
      e.action,
      targetTypeOf(e.action),
      e.target.id,
      e.target.name,
      e.role?.id ?? null,
      e.role?.name ?? null,
      e.before === undefined || e.before === null ? null : JSON.stringify(e.before),
      e.after === undefined || e.after === null ? null : JSON.stringify(e.after),
      e.note ?? null,
    ];
    const base = values.length;
    values.push(...row);
    tuples.push(`(${COLUMN_CASTS.map((cast, i) => `$${base + i + 1}${cast}`).join(', ')})`);
  }
  await db.query(
    `insert into access_audit (actor_id, actor_name, action, target_type, target_id, target_name,
                               role_id, role_name, before, after, note)
     values ${tuples.join(', ')}`,
    values,
  );
  return list.length;
}

/**
 * A role's full permission set as History stores it on both sides of
 * role.permissions_changed: `{ permissions: { 'budget.expenses.edit': ['own'] } }`,
 * keys sorted, scopes in R1 order.
 */
export function permissionsSnapshot(
  rows: ReadonlyArray<{ key: string; scope: Scope }>,
): { permissions: Record<string, Scope[]> } {
  const out: Record<string, Scope[]> = {};
  for (const r of [...rows].sort((a, b) => a.key.localeCompare(b.key))) {
    const scopes = (out[r.key] ??= []);
    if (!scopes.includes(r.scope)) scopes.push(r.scope);
  }
  for (const scopes of Object.values(out)) scopes.sort((a, b) => SCOPES.indexOf(a) - SCOPES.indexOf(b));
  return { permissions: out };
}
