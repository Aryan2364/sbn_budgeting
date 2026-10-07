import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ACTION_NAMES, NEEDS, PERMISSION_ACTIONS, allActions, checkAction,
  type ActionName, type ComplaintStatus, type Failure, type PermissionAction, type PermissionSubject, type Viewer,
} from '../../src/complaints/permissions';

/**
 * Access plan P5 ("Done when"), as simplified by the owner on 5 Oct 2026
 * (no approval step, RESOLUTIONS A1): the complaint workflow layer,
 * permission x workflow (DECISIONS 27, plan 6.2, RESOLUTIONS C1, O6).
 *
 * Every action x the permission held or refused x who is asking x every
 * status, against a declarative statement of the rules. Both layers must
 * pass; the permission layer answers first; the workflow never grants
 * what the permission refused, and never looks at roles or designations.
 */

const P = (id: string, name: string) => ({ id, name });
const SUPERVISOR = P('sup', 'Suresh Supervisor');
const MANAGER = P('mgr', 'Mahesh Manager');
const OUTSIDER = P('out', 'Omar Outsider');

const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'closed'];

/** Who is asking. */
type Who = 'supervisor' | 'manager' | 'outsider';
const WHO: Who[] = ['supervisor', 'manager', 'outsider'];
const ID: Record<Who, string> = { supervisor: SUPERVISOR.id, manager: MANAGER.id, outsider: OUTSIDER.id };

function subject(status: ComplaintStatus): PermissionSubject {
  return { status, supervisor: SUPERVISOR, manager: MANAGER };
}

const REFUSED = 'You can do that only on complaints that name you.';

/** `refused` is held at a scope that misses this complaint, or with `unheld`, not held at all. */
function viewer(who: Who, refused: PermissionAction | null, unheld = false): Viewer {
  const may = Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, a === refused ? REFUSED : true])) as Viewer['may'];
  const held = Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, !(unheld && a === refused)])) as Viewer['held'];
  return { id: ID[who], may, held };
}

/** The rules, stated once and plainly (plan 6.2 "Stays workflow, never a role"). */
function expected(action: ActionName, who: Who, held: boolean, c: PermissionSubject): Failure | null {
  if (!held) return 'permission';
  switch (action) {
    case 'start':
      if (who !== 'supervisor') return 'person';
      return c.status === 'open' ? null : 'status';
    case 'resolve':
      if (who !== 'supervisor') return 'person';
      return c.status === 'closed' ? 'status' : null;
    case 'reassign':
      // Reach (the manager, or anyone at All) is the permission's scope (O6).
      return c.status === 'closed' ? 'status' : null;
    case 'comment':
      return null;
  }
}

describe('complaint workflow: permission x workflow (P5, A1)', () => {
  it('every action x permission held or refused x who x status matches the rules', () => {
    let cases = 0;
    for (const action of ACTION_NAMES) {
      for (const held of [true, false]) {
        for (const who of WHO) {
          for (const status of STATUSES) {
            const c = subject(status);
            const got = checkAction(action, viewer(who, held ? null : NEEDS[action]), c);
            const want = expected(action, who, held, c);
            const label = `${action} held=${held} ${who} ${status}`;
            assert.equal(got.failure, want, label);
            assert.equal(got.allowed, want === null, label);
            assert.equal(got.reason === null, want === null, `${label}: a refusal always has a reason`);
            cases += 1;
          }
        }
      }
    }
    assert.equal(cases, ACTION_NAMES.length * 2 * WHO.length * STATUSES.length);
  });

  it('a refused permission blocks only the actions that need it', () => {
    const c = subject('open');
    for (const refused of PERMISSION_ACTIONS) {
      const answers = allActions(viewer('supervisor', refused), c);
      for (const name of ACTION_NAMES) {
        if (NEEDS[name] === refused) assert.equal(answers[name].failure, 'permission', `${refused} -> ${name}`);
        else assert.notEqual(answers[name].failure, 'permission', `${refused} -/-> ${name}`);
      }
    }
  });

  it('C1: work is start and resolve; there is no approve or send back (A1)', () => {
    assert.deepEqual(ACTION_NAMES.filter((a) => NEEDS[a] === 'work'), ['start', 'resolve']);
    assert.deepEqual([...ACTION_NAMES].sort(), ['comment', 'reassign', 'resolve', 'start']);
    assert.deepEqual([...PERMISSION_ACTIONS].sort(), ['comment', 'reassign', 'work']);
  });

  it('resolving is allowed from open and in progress, and closes it (no waiting state)', () => {
    assert.equal(checkAction('resolve', viewer('supervisor', null), subject('open')).allowed, true);
    assert.equal(checkAction('resolve', viewer('supervisor', null), subject('in_progress')).allowed, true);
    assert.equal(
      checkAction('resolve', viewer('supervisor', null), subject('closed')).reason,
      // Gujarati (owner, 7 Oct 2026): "This complaint is already closed."
      'આ ફરિયાદ પહેલેથી બંધ છે.',
    );
  });

  it('reassign refused names the manager who can, never a role or designation (D1, A2)', () => {
    const c = subject('open');
    const got = checkAction('reassign', viewer('supervisor', 'reassign'), c);
    assert.equal(got.failure, 'permission');
    // "Only Mahesh Manager, the manager, can reassign this." (Gujarati, owner, 7 Oct 2026)
    assert.equal(got.reason, 'ફક્ત મેનેજર Mahesh Manager જ આ ફરિયાદ બીજાને સોંપી શકે છે.');
    // No manager named, or the key not held at all: the permission layer's own sentence.
    assert.equal(checkAction('reassign', viewer('supervisor', 'reassign'), { ...c, manager: null }).reason, REFUSED);
    assert.equal(checkAction('reassign', viewer('supervisor', 'reassign', true), c).reason, REFUSED);
    for (const name of ACTION_NAMES) {
      for (const who of WHO) {
        for (const status of STATUSES) {
          for (const refused of [null, NEEDS[name]]) {
            const reason = checkAction(name, viewer(who, refused), subject(status)).reason ?? '';
            assert.ok(!/admin|HOD|CEO|approv/i.test(reason), `${name} ${who} ${status}: "${reason}" names a role`);
          }
        }
      }
    }
  });

  it('the permission layer answers before the workflow: a refused key is never reported as a status', () => {
    const closed = subject('closed');
    assert.equal(checkAction('resolve', viewer('supervisor', 'work'), closed).failure, 'permission');
    assert.equal(checkAction('resolve', viewer('supervisor', 'work'), closed).reason, REFUSED);
  });
});
