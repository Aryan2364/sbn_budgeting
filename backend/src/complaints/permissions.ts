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
 *     who can ("ફક્ત સોંપાયેલા સુપરવાઇઝર Ramesh Patel જ આ ફરિયાદ
 *     ઉકેલી શકે છે."). 403 until P11 (legacy L1), then 409.
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

/**
 * The refusal sentences, in Gujarati (owner decision, 7 Oct 2026: the
 * whole Complaints area is Gujarati). Each names the person who CAN act,
 * never a role (D1). `person()` and `status()` add the full stop.
 */
const SAYS = {
  onlyManagerReassigns: (manager: string) => `ફક્ત મેનેજર ${manager} જ આ ફરિયાદ બીજાને સોંપી શકે છે.`,
  onlySupervisorStarts: (supervisor: string) =>
    `ફક્ત સોંપાયેલા સુપરવાઇઝર ${supervisor} જ આ ફરિયાદ પર કામ શરૂ કરી શકે છે`,
  onlySupervisorResolves: (supervisor: string) =>
    `ફક્ત સોંપાયેલા સુપરવાઇઝર ${supervisor} જ આ ફરિયાદ ઉકેલી શકે છે`,
  /** Start refused by status; `open` never is (start is allowed there). */
  cannotStartAgain: {
    open: 'આ ફરિયાદ ખુલ્લી છે',
    in_progress: 'આ ફરિયાદ પર કામ પહેલેથી ચાલુ છે, તેથી ફરીથી શરૂ કરી શકાય નહીં',
    closed: 'આ ફરિયાદ બંધ છે, તેથી તેના પર ફરીથી કામ શરૂ કરી શકાય નહીં',
  } satisfies Record<ComplaintStatus, string>,
  alreadyClosed: 'આ ફરિયાદ પહેલેથી બંધ છે',
  closedNoReassign: 'આ ફરિયાદ બંધ છે, તેથી હવે બીજાને સોંપી શકાય નહીં',
} as const;

export function checkAction(action: ActionName, viewer: Viewer, c: PermissionSubject): ActionCheck {
  // 1. The permission layer.
  const may = viewer.may[NEEDS[action]];
  if (may !== true) {
    // Reassign held, but not at a scope reaching this complaint: say who can.
    const who = action === 'reassign' && viewer.held.reassign ? c.manager : null;
    return permission(who ? SAYS.onlyManagerReassigns(who.name) : may);
  }

  // 2. The workflow layer.
  const supervisor = viewer.id === c.supervisor.id;
  switch (action) {
    case 'start':
      if (!supervisor) return person(SAYS.onlySupervisorStarts(c.supervisor.name));
      if (c.status !== 'open') return status(SAYS.cannotStartAgain[c.status]);
      return ALLOWED;

    case 'resolve':
      if (!supervisor) return person(SAYS.onlySupervisorResolves(c.supervisor.name));
      if (c.status === 'closed') return status(SAYS.alreadyClosed);
      return ALLOWED;

    case 'reassign':
      if (c.status === 'closed') return status(SAYS.closedNoReassign);
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
