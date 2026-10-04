import { selfApprovalReason } from '../access/approval';

/**
 * Who may do what to ONE complaint: the workflow layer (DECISIONS 27,
 * access plan 6.2, backend kit 6). The ONE function (CONTRACT section 3).
 *
 * Two layers, both must pass, in this order:
 *   1. Permission: may this person do this KIND of thing at all, on
 *      this complaint? The caller answers it from the access context and
 *      the complaint (the key at a scope covering it) and passes it in
 *      as `Viewer.may`. This file never sees roles, levels or "admin".
 *   2. Workflow: on THIS complaint, are you the person the action is
 *      for (the supervisor, the approver), may you approve it at all
 *      (not its raiser or resolver), and does its status allow it?
 *      These rules live here, in code, and are never roles.
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
 *   - `self`: you are the approver but you raised or resolved it
 *     (DECISIONS 19, O10 Q11). 409 `{ error: 'blocked' }` (R7, D6).
 *   - `status`: the complaint is not in a state where this applies. In
 *     the detail it explains the state; a route answers 409 with who
 *     moved it, because the caller's screen was stale.
 *   - `notApplicable`: the action never applies to this complaint (e.g.
 *     approving one that needs no approval). 422 until P11 (legacy L2).
 */

export type ComplaintStatus = 'open' | 'in_progress' | 'awaiting_approval' | 'closed';

export type ActionName = 'start' | 'resolve' | 'approve' | 'sendBack' | 'reassign' | 'comment';

export const ACTION_NAMES: ActionName[] = [
  'start', 'resolve', 'approve', 'sendBack', 'reassign', 'comment',
];

/** The permission actions of `complaints.complaints.*` the workflow acts on (RESOLUTIONS C1, O6). */
export type PermissionAction = 'comment' | 'work' | 'approve' | 'reassign';

export const PERMISSION_ACTIONS: PermissionAction[] = ['comment', 'work', 'approve', 'reassign'];

/** Which permission each workflow action needs: `work` is start and resolve, `approve` is approve and send back (C1). */
export const NEEDS: Readonly<Record<ActionName, PermissionAction>> = {
  start: 'work',
  resolve: 'work',
  approve: 'approve',
  sendBack: 'approve',
  reassign: 'reassign',
  comment: 'comment',
};

export interface Viewer {
  id: string;
  /**
   * The permission layer's answer for each action, already scoped to
   * THIS complaint by the caller: `true`, or the reason it is refused.
   * Reassign's scope encodes its reach (Own = the complaint's manager or
   * HOD, All = any complaint, O6), so the workflow adds only its status
   * rule on top.
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
  requiresApproval: boolean;
  raisedBy: PersonRef;
  supervisor: PersonRef;
  manager: PersonRef | null;
  hod: PersonRef | null;
  ceo: PersonRef | null;
  approver: PersonRef | null;
  /** Who resolved it last; cleared by a send back. */
  resolvedBy: PersonRef | null;
}

export type Failure = 'permission' | 'person' | 'self' | 'status' | 'notApplicable';

export interface ActionCheck {
  allowed: boolean;
  reason: string | null;
  failure: Failure | null;
}

const ALLOWED: ActionCheck = { allowed: true, reason: null, failure: null };

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  awaiting_approval: 'awaiting approval',
  closed: 'closed',
};

export function checkAction(action: ActionName, viewer: Viewer, c: PermissionSubject): ActionCheck {
  const is = (p: PersonRef | null): boolean => p?.id === viewer.id;
  const state = STATUS_LABEL[c.status];

  // 1. The permission layer.
  const may = viewer.may[NEEDS[action]];
  if (may !== true) {
    // Reassign held, but not at a scope reaching this complaint: say who can.
    const scopeMiss = action === 'reassign' && viewer.held.reassign;
    return permission(scopeMiss ? (reassignersReason(c) ?? may) : may);
  }

  // 2. The workflow layer.
  switch (action) {
    case 'start': {
      if (!is(c.supervisor)) {
        return person(`Only ${c.supervisor.name}, the assigned supervisor, can start work on this`);
      }
      if (c.status !== 'open') {
        return status(`This complaint is ${state}, so it can't be started again`);
      }
      return ALLOWED;
    }

    case 'resolve': {
      if (!is(c.supervisor)) {
        return person(`Only ${c.supervisor.name}, the assigned supervisor, can resolve this`);
      }
      if (c.status !== 'open' && c.status !== 'in_progress') {
        return status(
          c.status === 'closed'
            ? 'This complaint is already closed'
            : 'This complaint is already resolved and waiting for approval',
        );
      }
      return ALLOWED;
    }

    case 'approve':
    case 'sendBack': {
      const verb = action === 'approve' ? 'approve this' : 'send this back';
      if (!c.requiresApproval || !c.approver) {
        return notApplicable(
          `This category needs no approval, so resolving closes the complaint directly`,
        );
      }
      if (!is(c.approver)) {
        return person(`Only ${c.approver.name}, the approver, can ${verb}`);
      }
      // You are the approver, and not its raiser or resolver (D6).
      const self = selfApprovalReason(viewer.id, {
        record: 'complaint',
        decide: action === 'approve' ? 'approve it' : 'send it back',
        makers: [
          { id: c.raisedBy.id, made: 'raised' },
          { id: c.resolvedBy?.id, made: 'resolved' },
        ],
      });
      if (self) return { allowed: false, reason: self, failure: 'self' };
      if (c.status !== 'awaiting_approval') {
        return status(
          c.status === 'closed'
            ? 'This complaint is already closed'
            : `This complaint is ${state}. It can be ${action === 'approve' ? 'approved' : 'sent back'} once the supervisor resolves it`,
        );
      }
      return ALLOWED;
    }

    case 'reassign': {
      if (c.status === 'closed') {
        return status('This complaint is closed, so it can no longer be reassigned');
      }
      return ALLOWED;
    }

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

/**
 * Who can reassign THIS complaint by being named on it (reassign at Own
 * reaches its manager and HOD, O6), by name, never by role (plan 6.2,
 * D1): "Only Ramesh Patel, the manager, or Asha Rao, the HOD, can
 * reassign this." Null when it names neither.
 */
function reassignersReason(c: PermissionSubject): string | null {
  const who = [
    c.manager ? `${c.manager.name}, the manager` : null,
    c.hod && c.hod.id !== c.manager?.id ? `${c.hod.name}, the HOD` : null,
  ].filter((w): w is string => w !== null);
  return who.length > 0 ? `Only ${who.join(', or ')}, can reassign this.` : null;
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
function notApplicable(reason: string): ActionCheck {
  return { allowed: false, reason: `${reason}.`, failure: 'notApplicable' };
}
