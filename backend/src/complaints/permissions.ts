/**
 * Who may do what to ONE complaint: the workflow layer (DECISIONS 27,
 * access plan 6.2, backend kit 6). The ONE function (CONTRACT section 3).
 *
 * Two layers, both must pass, in this order:
 *   1. Permission: may this person do this KIND of thing at all, on
 *      this complaint? The caller answers it from the access context and
 *      the complaint (the key at a scope covering it) and passes it in
 *      as `Viewer.may`. This file never sees roles, levels or "admin".
 *   2. Workflow: on THIS complaint, are you its supervisor, and does its
 *      status allow it? These rules live here, in code, and are never
 *      roles or designations.
 *
 * There is no approval step (owner decision, 5 Oct 2026): a complaint
 * goes open -> in progress -> resolved, and resolving closes it.
 *
 * The detail's per-action answers (`can`, and its `actions` alias) are
 * computed with it, and every action route re-checks with it after
 * locking the row. The two can therefore never disagree: a button the
 * detail shows enabled is a request the route accepts, and a disabled
 * button's tooltip is the same sentence the route refuses with.
 *
 * The kinds of "no", and the route's answer (plan 6.1.10):
 *   - `permission`: the permission layer refused (403, naming the key).
 *     The route's own scoped read has usually answered this already.
 *   - `person`: you are not the one who can do this. The reason names
 *     who can ("Only Ramesh Patel, the assigned supervisor, can resolve
 *     this"). 403 until P11 (legacy L1), then 409.
 *   - `status`: the complaint is not in a state where this applies. In
 *     the detail it explains the state; a route answers 409 with who
 *     moved it, because the caller's screen was stale.
 */

export type ComplaintStatus = 'open' | 'in_progress' | 'closed';

export type ActionName = 'start' | 'resolve' | 'reassign' | 'comment';

export const ACTION_NAMES: ActionName[] = ['start', 'resolve', 'reassign', 'comment'];

/** The permission actions of `complaints.complaints.*` the workflow acts on (RESOLUTIONS C1, O6). */
export type PermissionAction = 'comment' | 'work' | 'reassign';

export const PERMISSION_ACTIONS: PermissionAction[] = ['comment', 'work', 'reassign'];

/** Which permission each workflow action needs: `work` is start and resolve (C1). */
export const NEEDS: Readonly<Record<ActionName, PermissionAction>> = {
  start: 'work',
  resolve: 'work',
  reassign: 'reassign',
  comment: 'comment',
};

export interface Viewer {
  id: string;
  /**
   * The permission layer's answer for each action, already scoped to
   * THIS complaint by the caller: `true`, or the reason it is refused.
   * Reassign's scope encodes its reach (Own = the complaint's manager,
   * All = any complaint, O6), so the workflow adds only its status rule.
   */
  may: Readonly<Record<PermissionAction, true | string>>;
  /**
   * Whether each key is held at SOME scope. A refusal of a held key is a
   * scope miss on this complaint; of an unheld key, the key itself.
   */
  held: Readonly<Record<PermissionAction, boolean>>;
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface PermissionSubject {
  status: ComplaintStatus;
  supervisor: PersonRef;
  manager: PersonRef | null;
}

export type Failure = 'permission' | 'person' | 'status';

export interface ActionCheck {
  allowed: boolean;
  reason: string | null;
  failure: Failure | null;
}

const ALLOWED: ActionCheck = { allowed: true, reason: null, failure: null };

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  closed: 'closed',
};

export function checkAction(action: ActionName, viewer: Viewer, c: PermissionSubject): ActionCheck {
  // 1. The permission layer.
  const may = viewer.may[NEEDS[action]];
  if (may !== true) {
    // Reassign held, but not at a scope reaching this complaint: say who can.
    const who = action === 'reassign' && viewer.held.reassign ? c.manager : null;
    return permission(who ? `Only ${who.name}, the manager, can reassign this.` : may);
  }

  // 2. The workflow layer.
  const supervisor = viewer.id === c.supervisor.id;
  switch (action) {
    case 'start':
      if (!supervisor) return person(`Only ${c.supervisor.name}, the assigned supervisor, can start work on this`);
      if (c.status !== 'open') {
        return status(`This complaint is ${STATUS_LABEL[c.status]}, so it can't be started again`);
      }
      return ALLOWED;

    case 'resolve':
      if (!supervisor) return person(`Only ${c.supervisor.name}, the assigned supervisor, can resolve this`);
      if (c.status === 'closed') return status('This complaint is already closed');
      return ALLOWED;

    case 'reassign':
      if (c.status === 'closed') return status('This complaint is closed, so it can no longer be reassigned');
      return ALLOWED;

    case 'comment':
      // Visible by construction: the caller loaded it through the view scope.
      return ALLOWED;
  }
}

export function allActions(viewer: Viewer, c: PermissionSubject): Record<ActionName, ActionCheck> {
  const out = {} as Record<ActionName, ActionCheck>;
  for (const name of ACTION_NAMES) out[name] = checkAction(name, viewer, c);
  return out;
}

/** The permission layer's own sentence, already punctuated. */
function permission(reason: string): ActionCheck {
  return { allowed: false, reason, failure: 'permission' };
}
function person(reason: string): ActionCheck {
  return { allowed: false, reason: `${reason}.`, failure: 'person' };
}
function status(reason: string): ActionCheck {
  return { allowed: false, reason: `${reason}.`, failure: 'status' };
}
