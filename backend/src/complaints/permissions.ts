/**
 * Who may do what to a complaint — the ONE function (CONTRACT section 3).
 *
 * `ComplaintDetail.actions` is computed with it, and every action route
 * re-checks with it after locking the row. The two can therefore never
 * disagree: a button the detail shows enabled is a request the route
 * accepts, and a disabled button's tooltip is the same sentence the
 * route would refuse with.
 *
 * Two different kinds of "no":
 *   - `person`: you are not the one who can do this. The reason names
 *     who can ("Only Ramesh Patel, the assigned supervisor, can resolve
 *     this"). A route answers 403.
 *   - `status`: the complaint is not in a state where this applies. In
 *     the detail it explains the state; a route answers 409 with who
 *     moved it, because the caller's screen was stale.
 *   - `notApplicable`: the action never applies to this complaint (e.g.
 *     approving one that needs no approval). A route answers 422.
 */

export type ComplaintStatus = 'open' | 'in_progress' | 'awaiting_approval' | 'closed';

export type ActionName = 'start' | 'resolve' | 'approve' | 'sendBack' | 'reassign' | 'comment';

export const ACTION_NAMES: ActionName[] = [
  'start', 'resolve', 'approve', 'sendBack', 'reassign', 'comment',
];

export interface Viewer {
  id: string;
  isComplaintsAdmin: boolean;
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
}

export interface ActionCheck {
  allowed: boolean;
  reason: string | null;
  failure: 'person' | 'status' | 'notApplicable' | null;
}

const ALLOWED: ActionCheck = { allowed: true, reason: null, failure: null };

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  awaiting_approval: 'awaiting approval',
  closed: 'closed',
};

/** Visibility (CONTRACT section 3): admin, or named anywhere on the snapshot. */
export function canSee(viewer: Viewer, c: PermissionSubject): boolean {
  if (viewer.isComplaintsAdmin) return true;
  return [c.raisedBy, c.supervisor, c.manager, c.hod, c.ceo, c.approver].some(
    (p) => p?.id === viewer.id,
  );
}

export function checkAction(action: ActionName, viewer: Viewer, c: PermissionSubject): ActionCheck {
  const is = (p: PersonRef | null): boolean => p?.id === viewer.id;
  const state = STATUS_LABEL[c.status];

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
      if (!viewer.isComplaintsAdmin && !is(c.manager) && !is(c.hod)) {
        const who = [
          c.manager ? `${c.manager.name} (manager)` : null,
          c.hod && c.hod.id !== c.manager?.id ? `${c.hod.name} (HOD)` : null,
        ].filter(Boolean);
        return person(
          who.length > 0
            ? `Only ${who.join(' or ')}, or a complaints admin, can reassign this`
            : 'Only a complaints admin can reassign this',
        );
      }
      if (c.status === 'closed') {
        return status('This complaint is closed, so it can no longer be reassigned');
      }
      return ALLOWED;
    }

    case 'comment': {
      if (!canSee(viewer, c)) {
        return person('Only people this complaint was sent to can comment on it');
      }
      return ALLOWED;
    }
  }
}

export function allActions(
  viewer: Viewer,
  c: PermissionSubject,
): Record<ActionName, { allowed: boolean; reason: string | null }> {
  const out = {} as Record<ActionName, { allowed: boolean; reason: string | null }>;
  for (const name of ACTION_NAMES) {
    const { allowed, reason } = checkAction(name, viewer, c);
    out[name] = { allowed, reason };
  }
  return out;
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
