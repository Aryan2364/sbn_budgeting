/**
 * A FROZEN copy of the complaint detail's `actions` map as the baseline
 * build computed it (src/complaints/permissions.ts before access plan
 * P5, with `toViewer`'s `modules.complaints === 'admin'`). Test-only, and
 * never edited to follow the live code: like legacy-screen-rules.ts, it
 * is a record of what the old build answered.
 *
 * Why it exists: the baseline stores a digest of each complaint detail,
 * and that body includes `actions`, refusal sentences and all. P5 makes
 * two planned changes to `actions` (plan 6.3.3): reasons stop naming a
 * role (D1), and the approver may not approve or send back a complaint
 * they raised or resolved (D6). The run therefore also records
 * `legacyDigest`: the digest of the same body with `actions` replaced by
 * what the baseline build would have put there. When that equals the
 * baseline digest, every byte outside `actions` is unchanged, and the
 * `actions` allowed flags are still compared on their own (`actions`
 * field, matched only by D6). Nothing is loosened.
 */

type Status = 'open' | 'in_progress' | 'awaiting_approval' | 'closed';
type ActionName = 'start' | 'resolve' | 'approve' | 'sendBack' | 'reassign' | 'comment';

const ACTION_NAMES: ActionName[] = ['start', 'resolve', 'approve', 'sendBack', 'reassign', 'comment'];

interface PersonRef {
  id: string;
  name: string;
}

export interface LegacyViewer {
  id: string;
  /** Today's level: user_module_access complaints = 'admin'. */
  complaintsAdmin: boolean;
}

interface Subject {
  status: Status;
  requiresApproval: boolean;
  raisedBy: PersonRef;
  supervisor: PersonRef;
  manager: PersonRef | null;
  hod: PersonRef | null;
  ceo: PersonRef | null;
  approver: PersonRef | null;
}

interface Answer {
  allowed: boolean;
  reason: string | null;
}

const OK: Answer = { allowed: true, reason: null };
const no = (reason: string): Answer => ({ allowed: false, reason: `${reason}.` });

const STATUS_LABEL: Record<Status, string> = {
  open: 'open',
  in_progress: 'in progress',
  awaiting_approval: 'awaiting approval',
  closed: 'closed',
};

function canSee(viewer: LegacyViewer, c: Subject): boolean {
  if (viewer.complaintsAdmin) return true;
  return [c.raisedBy, c.supervisor, c.manager, c.hod, c.ceo, c.approver].some((p) => p?.id === viewer.id);
}

function check(action: ActionName, viewer: LegacyViewer, c: Subject): Answer {
  const is = (p: PersonRef | null): boolean => p?.id === viewer.id;
  const state = STATUS_LABEL[c.status];
  switch (action) {
    case 'start':
      if (!is(c.supervisor)) return no(`Only ${c.supervisor.name}, the assigned supervisor, can start work on this`);
      if (c.status !== 'open') return no(`This complaint is ${state}, so it can't be started again`);
      return OK;
    case 'resolve':
      if (!is(c.supervisor)) return no(`Only ${c.supervisor.name}, the assigned supervisor, can resolve this`);
      if (c.status !== 'open' && c.status !== 'in_progress') {
        return no(
          c.status === 'closed'
            ? 'This complaint is already closed'
            : 'This complaint is already resolved and waiting for approval',
        );
      }
      return OK;
    case 'approve':
    case 'sendBack': {
      const verb = action === 'approve' ? 'approve this' : 'send this back';
      if (!c.requiresApproval || !c.approver) {
        return no('This category needs no approval, so resolving closes the complaint directly');
      }
      if (!is(c.approver)) return no(`Only ${c.approver.name}, the approver, can ${verb}`);
      if (c.status !== 'awaiting_approval') {
        return no(
          c.status === 'closed'
            ? 'This complaint is already closed'
            : `This complaint is ${state}. It can be ${action === 'approve' ? 'approved' : 'sent back'} once the supervisor resolves it`,
        );
      }
      return OK;
    }
    case 'reassign': {
      if (!viewer.complaintsAdmin && !is(c.manager) && !is(c.hod)) {
        const who = [
          c.manager ? `${c.manager.name} (manager)` : null,
          c.hod && c.hod.id !== c.manager?.id ? `${c.hod.name} (HOD)` : null,
        ].filter(Boolean);
        return no(
          who.length > 0
            ? `Only ${who.join(' or ')}, or a complaints admin, can reassign this`
            : 'Only a complaints admin can reassign this',
        );
      }
      if (c.status === 'closed') return no('This complaint is closed, so it can no longer be reassigned');
      return OK;
    }
    case 'comment':
      return canSee(viewer, c) ? OK : no('Only people this complaint was sent to can comment on it');
  }
}

/** The `actions` map the baseline build would have sent for this complaint detail body. */
export function legacyActions(viewer: LegacyViewer, detail: Subject): Record<ActionName, Answer> {
  const out = {} as Record<ActionName, Answer>;
  for (const name of ACTION_NAMES) out[name] = check(name, viewer, detail);
  return out;
}
