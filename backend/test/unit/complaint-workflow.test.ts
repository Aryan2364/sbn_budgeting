import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConflictException } from '@nestjs/common';

import { assertNotCreator, blocked, selfApprovalReason } from '../../src/access/approval';
import {
  ACTION_NAMES, NEEDS, PERMISSION_ACTIONS, allActions, checkAction,
  type ActionName, type ComplaintStatus, type Failure, type PermissionAction, type PermissionSubject, type Viewer,
} from '../../src/complaints/permissions';

/**
 * Access plan P5 ("Done when"): the complaint workflow layer, permission
 * x workflow (DECISIONS 27, plan 6.2, RESOLUTIONS C1, O6, O10 Q11).
 *
 * Every action x the permission held or refused x who is asking (right
 * person, wrong person, the approver who raised it, the approver who
 * resolved it) x every status x approval needed or not, against a
 * declarative statement of the rules. Both layers must pass; the
 * permission layer answers first; the workflow never grants what the
 * permission refused, and never looks at roles.
 */

const P = (id: string, name: string) => ({ id, name });
const SUPERVISOR = P('sup', 'Suresh Supervisor');
const MANAGER = P('mgr', 'Mahesh Manager');
const HOD = P('hod', 'Hema Hod');
const CEO = P('ceo', 'Chetan Ceo');
const APPROVER = P('apr', 'Anil Approver');
const RAISER = P('rsr', 'Rekha Raiser');
const OUTSIDER = P('out', 'Omar Outsider');

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'awaiting_approval', 'closed'];

/** Who is asking, and how the complaint names them. */
type Who = 'supervisor' | 'approver' | 'approverRaised' | 'approverResolved' | 'manager' | 'hod' | 'raiser' | 'outsider';
const WHO: Who[] = ['supervisor', 'approver', 'approverRaised', 'approverResolved', 'manager', 'hod', 'raiser', 'outsider'];

function subject(who: Who, status: ComplaintStatus, requiresApproval: boolean): PermissionSubject {
  return {
    status,
    requiresApproval,
    raisedBy: who === 'approverRaised' ? APPROVER : RAISER,
    supervisor: SUPERVISOR,
    manager: MANAGER,
    hod: HOD,
    ceo: CEO,
    approver: requiresApproval ? APPROVER : null,
    resolvedBy: who === 'approverResolved' ? APPROVER : status === 'awaiting_approval' || status === 'closed' ? SUPERVISOR : null,
  };
}

function idOf(who: Who): string {
  switch (who) {
    case 'supervisor': return SUPERVISOR.id;
    case 'approver':
    case 'approverRaised':
    case 'approverResolved': return APPROVER.id;
    case 'manager': return MANAGER.id;
    case 'hod': return HOD.id;
    case 'raiser': return RAISER.id;
    case 'outsider': return OUTSIDER.id;
  }
}

const REFUSED = 'You can do that only on complaints that name you.';

function viewer(who: Who, refused: PermissionAction | null): Viewer {
  const may = Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, a === refused ? REFUSED : true])) as Viewer['may'];
  return { id: idOf(who), may };
}

/** The rules, stated once and plainly (plan 6.2 "Stays workflow, never a role"). */
function expected(action: ActionName, who: Who, held: boolean, c: PermissionSubject): Failure | null {
  if (!held) return 'permission';
  const isSupervisor = who === 'supervisor';
  const isApprover = who === 'approver' || who === 'approverRaised' || who === 'approverResolved';
  switch (action) {
    case 'start':
      if (!isSupervisor) return 'person';
      return c.status === 'open' ? null : 'status';
    case 'resolve':
      if (!isSupervisor) return 'person';
      return c.status === 'open' || c.status === 'in_progress' ? null : 'status';
    case 'approve':
    case 'sendBack':
      if (!c.requiresApproval) return 'notApplicable';
      if (!isApprover) return 'person';
      if (who === 'approverRaised' || who === 'approverResolved') return 'self';
      return c.status === 'awaiting_approval' ? null : 'status';
    case 'reassign':
      // Reach (manager, HOD, or anyone at All) is the permission's scope (O6).
      return c.status === 'closed' ? 'status' : null;
    case 'comment':
      return null;
  }
}

describe('complaint workflow: permission x workflow (P5)', () => {
  it('every action x permission held or refused x who x status x approval matches the rules', () => {
    let cases = 0;
    for (const action of ACTION_NAMES) {
      for (const held of [true, false]) {
        for (const who of WHO) {
          for (const status of STATUSES) {
            for (const requiresApproval of [true, false]) {
              const c = subject(who, status, requiresApproval);
              const got = checkAction(action, viewer(who, held ? null : NEEDS[action]), c);
              const want = expected(action, who, held, c);
              const label = `${action} held=${held} ${who} ${status} approval=${requiresApproval}`;
              assert.equal(got.failure, want, label);
              assert.equal(got.allowed, want === null, label);
              assert.equal(got.reason === null, want === null, `${label}: a refusal always has a reason`);
              cases += 1;
            }
          }
        }
      }
    }
    assert.equal(cases, ACTION_NAMES.length * 2 * WHO.length * STATUSES.length * 2);
  });

  it('a refused permission blocks only the actions that need it', () => {
    const c = subject('supervisor', 'open', true);
    for (const refused of PERMISSION_ACTIONS) {
      const answers = allActions(viewer('supervisor', refused), c);
      for (const name of ACTION_NAMES) {
        if (NEEDS[name] === refused) assert.equal(answers[name].failure, 'permission', `${refused} -> ${name}`);
        else assert.notEqual(answers[name].failure, 'permission', `${refused} -/-> ${name}`);
      }
    }
  });

  it('C1: work is start and resolve; approve is approve and send back', () => {
    assert.deepEqual(
      ACTION_NAMES.filter((a) => NEEDS[a] === 'work'),
      ['start', 'resolve'],
    );
    assert.deepEqual(
      ACTION_NAMES.filter((a) => NEEDS[a] === 'approve'),
      ['approve', 'sendBack'],
    );
  });

  it('the approver who raised or resolved it is blocked with a plain reason (D6), on approve and send back', () => {
    const raised = subject('approverRaised', 'awaiting_approval', true);
    assert.equal(
      checkAction('approve', viewer('approverRaised', null), raised).reason,
      'You raised this complaint, so someone else must approve it.',
    );
    assert.equal(
      checkAction('sendBack', viewer('approverRaised', null), raised).reason,
      'You raised this complaint, so someone else must send it back.',
    );
    const resolved = subject('approverResolved', 'awaiting_approval', true);
    assert.equal(
      checkAction('approve', viewer('approverResolved', null), resolved).reason,
      'You resolved this complaint, so someone else must approve it.',
    );
    // The raiser who is NOT the approver is told who approves, not "you raised it".
    assert.equal(
      checkAction('approve', viewer('raiser', null), subject('raiser', 'awaiting_approval', true)).failure,
      'person',
    );
  });

  it('reassign refused names the people who can, never a role (D1)', () => {
    const c = subject('supervisor', 'open', true);
    const got = checkAction('reassign', viewer('supervisor', 'reassign'), c);
    assert.equal(got.failure, 'permission');
    assert.equal(got.reason, 'Only Mahesh Manager, the manager, or Hema Hod, the HOD, can reassign this.');
    assert.equal(
      checkAction('reassign', viewer('supervisor', 'reassign'), { ...c, hod: MANAGER }).reason,
      'Only Mahesh Manager, the manager, can reassign this.',
    );
    // Nobody named: the permission layer's own sentence.
    assert.equal(
      checkAction('reassign', viewer('supervisor', 'reassign'), { ...c, manager: null, hod: null }).reason,
      REFUSED,
    );
    for (const name of ACTION_NAMES) {
      for (const who of WHO) {
        for (const status of STATUSES) {
          for (const refused of [null, NEEDS[name]]) {
            const reason = checkAction(name, viewer(who, refused), subject(who, status, true)).reason ?? '';
            assert.ok(!/admin/i.test(reason), `${name} ${who} ${status}: "${reason}" names a role`);
          }
        }
      }
    }
  });

  it('the permission layer answers before the workflow: a refused key is never reported as a status', () => {
    const closed = subject('supervisor', 'closed', true);
    assert.equal(checkAction('resolve', viewer('supervisor', 'work'), closed).failure, 'permission');
    assert.equal(checkAction('resolve', viewer('supervisor', 'work'), closed).reason, REFUSED);
  });
});

describe('access/approval.ts: no self-approval (DECISIONS 19)', () => {
  const check = {
    record: 'expense',
    decide: 'approve it',
    makers: [{ id: 'u1', made: 'added' }, { id: null, made: 'paid' }, { id: 'u2', made: 'paid' }],
  };

  it('names the first way the caller made the record, and nothing for anyone else', () => {
    assert.equal(selfApprovalReason('u1', check), 'You added this expense, so someone else must approve it.');
    assert.equal(selfApprovalReason('u2', check), 'You paid this expense, so someone else must approve it.');
    assert.equal(selfApprovalReason('u3', check), null);
  });

  it('assertNotCreator answers 409 blocked with the reason (R7)', () => {
    assert.doesNotThrow(() => assertNotCreator({ userId: 'u3' }, check));
    assert.throws(
      () => assertNotCreator({ userId: 'u1' }, check),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.getStatus(), 409);
        assert.deepEqual(error.getResponse(), {
          error: 'blocked',
          reason: 'You added this expense, so someone else must approve it.',
          message: 'You added this expense, so someone else must approve it.',
        });
        return true;
      },
    );
    assert.equal(blocked('x').getStatus(), 409);
  });
});
