import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import { intendedIdFor, missingApprovals, type IntendedWorld } from '../equivalence/intended';
import { legacyActions } from '../equivalence/legacy-complaint-actions';

/**
 * The complaint workflow's intended differences, matched by id and
 * matcher, never by loosening the comparison:
 *   D1 (P5)  refusal reasons stop naming a role;
 *   D8 (A1, A2; migration 0013)  approvals removed, no routing by designation;
 *   D9 (A3)  a complaints member views and comments at Team.
 * D6 is retired with D8: its two routes are gone.
 */
const K = 'kkkk'; // a complaint 0013 closed
const T = 'tttt'; // a complaint the member newly sees (D9)
const O = 'oooo'; // an ordinary complaint

const world = (
  cases: Record<string, { base?: unknown; run?: unknown; legacyDigest?: string; legacyWhy?: string; baseIds?: string[]; runIds?: string[] }> = {},
): IntendedWorld => ({
  runCases: Object.fromEntries(
    Object.entries(cases).map(([k, c]) => [k, { status: c.run, legacyDigest: c.legacyDigest, legacyWhy: c.legacyWhy, ids: c.runIds }]),
  ),
  baselineCases: Object.fromEntries(Object.entries(cases).map(([k, c]) => [k, { status: c.base, ids: c.baseIds }])),
  approvals: {
    migrated: new Set([K]),
    hodOnly: new Set([`hod|${O}`]),
    extras: new Map([['approver', new Set([T])]]),
    losses: new Map(),
  },
});
const diff = (key: string, field: Difference['field'], baseline: unknown, run: unknown): Difference => ({
  key, kind: 'field', field, baseline, run,
});
const flags = (reassign: boolean, extra: Record<string, boolean> = {}) => ({
  comment: true, reassign, resolve: false, start: false, ...extra,
});

describe('intended differences D1, D8 and D9 (complaint workflow)', () => {
  it('D8: the approve and send-back routes and every one of their cases are gone; nothing else is', () => {
    const w = world();
    assert.equal(intendedIdFor({ key: 'POST /api/complaints/:id/approve', kind: 'route-only-in-baseline' }, w), 'D8');
    assert.equal(intendedIdFor({ key: `POST /api/complaints/:id/send-back |approver|${K}`, kind: 'case-only-in-baseline' }, w), 'D8');
    assert.equal(intendedIdFor({ key: 'POST /api/complaints/:id/start', kind: 'route-only-in-baseline' }, w), null);
    assert.equal(intendedIdFor({ key: `POST /api/complaints/:id/comments |raiser|${O}`, kind: 'case-only-in-baseline' }, w), null);
  });

  it('D8: the Approval tab answers 400 where it answered 200, and only that', () => {
    const key = 'GET /api/complaints [tab-approval] |approver';
    assert.equal(intendedIdFor(diff(key, 'status', 200, 400), world({ [key]: { base: 200, run: 400 } })), 'D8');
    assert.equal(intendedIdFor(diff(key, 'digest', 'x', undefined), world({ [key]: { base: 200, run: 400 } })), 'D8');
    assert.equal(intendedIdFor(diff(key, 'status', 200, 403), world({ [key]: { base: 200, run: 403 } })), null);
    const all = 'GET /api/complaints [tab-all] |approver';
    assert.equal(intendedIdFor(diff(all, 'status', 200, 400), world({ [all]: { base: 200, run: 400 } })), null);
  });

  it('D8: exactly the dropped keys are gone (with D7 adding `can`, and `title` from 0014)', () => {
    const w = world();
    const detail = `GET /api/complaints/:id |raiser|${O}`;
    const base = ['actions', 'approver', 'ceo', 'hod', 'id', 'requiresApproval', 'status'];
    assert.equal(intendedIdFor(diff(detail, 'keys', base, ['actions', 'can', 'id', 'status', 'title']), w), 'D8');
    assert.equal(intendedIdFor(diff(detail, 'keys', base, ['actions', 'can', 'hod', 'id', 'status', 'title']), w), null, 'one kept');
    assert.equal(intendedIdFor(diff(detail, 'keys', base, ['actions', 'can', 'status', 'title']), w), null, 'one more lost');
    const counts = 'GET /api/complaints/counts |raiser';
    assert.equal(intendedIdFor(diff(counts, 'keys', ['all', 'approval', 'assigned', 'raised'], ['all', 'assigned', 'raised']), w), 'D8');
    const cats = 'GET /api/complaint-categories |complaints_admin';
    assert.equal(
      intendedIdFor(diff(cats, 'itemKeys', ['approverDesignation', 'id', 'name', 'requiresApproval'], ['id', 'name']), w),
      'D8',
    );
    assert.equal(intendedIdFor(diff('GET /api/sites |raiser', 'itemKeys', ['hod', 'id'], ['id']), w), null);
  });

  it("D8: the detail's approve and send back flags go, and only reassign may turn off, and only where 0013 says", () => {
    const w = world();
    const old = (reassign: boolean) => flags(reassign, { approve: false, sendBack: false });
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |raiser|${O}`, 'actions', old(false), flags(false)), w), 'D8');
    // Closed by 0013: reassign off.
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |manager|${K}`, 'actions', old(true), flags(false)), w), 'D8');
    // The HOD who could reassign only as HOD: off.
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |hod|${O}`, 'actions', old(true), flags(false)), w), 'D8');
    // Anyone else losing reassign, or any other flag moving: not D8.
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |manager|${O}`, 'actions', old(true), flags(false)), w), null);
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |manager|${K}`, 'actions', old(false), flags(true)), w), null);
    assert.equal(
      intendedIdFor(diff(`GET /api/complaints/:id |manager|${K}`, 'actions', old(true), { ...flags(false), comment: false }), w),
      null,
    );
  });

  it('D8: reassign a complaint 0013 closed (200 -> 409), or as its HOD only (-> 403); nothing else', () => {
    const r = 'POST /api/complaints/:id/reassign [to-another-supervisor]';
    const at = (who: string, base: number, run: number) => {
      const key = `${r} |${who}`;
      return intendedIdFor(diff(key, 'status', base, run), world({ [key]: { base, run } }));
    };
    assert.equal(at(`manager|${K}`, 200, 409), 'D8');
    assert.equal(at(`hod|${O}`, 200, 403), 'D8');
    assert.equal(at(`hod|${O}`, 409, 403), 'D8');
    assert.equal(at(`manager|${O}`, 200, 409), null);
    assert.equal(at(`manager|${O}`, 200, 403), null);
    assert.equal(at(`manager|${K}`, 200, 403), null);
  });

  it('D9: a member newly sees a team complaint (404 -> 200, or 403 for an action at Own), only that one', () => {
    const at = (key: string, base: number, run: number) =>
      intendedIdFor(diff(key, 'status', base, run), world({ [key]: { base, run } }));
    assert.equal(at(`GET /api/complaints/:id |approver|${T}`, 404, 200), 'D9');
    assert.equal(at(`POST /api/complaints/:id/comments |approver|${T}`, 404, 200), 'D9');
    assert.equal(at(`POST /api/complaints/:id/start |approver|${T}`, 404, 403), 'D9');
    assert.equal(at(`POST /api/complaints/:id/start |approver|${T}`, 404, 409), null, 'not an answer at Own');
    assert.equal(at(`GET /api/complaints/:id |approver|${O}`, 404, 200), null, 'not one D9 lists');
    assert.equal(at(`GET /api/complaints/:id |raiser|${T}`, 404, 200), null, 'not for this person');
  });

  it('D9: a list gains exactly the newly seen ids, and its total moves by that', () => {
    const key = 'GET /api/complaints [tab-all] |approver';
    const w = world({ [key]: { base: 200, run: 200, baseIds: [`id:${O}`], runIds: [`id:${O}`, `id:${T}`] } });
    assert.equal(intendedIdFor(diff(key, 'ids', [`id:${O}`], [`id:${O}`, `id:${T}`]), w), 'D9');
    assert.equal(intendedIdFor(diff(key, 'total', 1, 2), w), 'D9');
    assert.equal(intendedIdFor(diff(key, 'total', 1, 3), w), null);
    const wrong = world({ [key]: { base: 200, run: 200, baseIds: [`id:${O}`], runIds: [`id:${O}`, `id:${K}`] } });
    assert.equal(intendedIdFor(diff(key, 'ids', [`id:${O}`], [`id:${O}`, `id:${K}`]), wrong), null);
  });

  it('D1/D8/D9: a digest differs only where the undone body says, when its digest is the baseline', () => {
    const key = `GET /api/complaints/:id |raiser|${O}`;
    const w = (legacyDigest: string | undefined, legacyWhy: string) =>
      world({ [key]: { base: 200, run: 200, legacyDigest, legacyWhy } });
    assert.equal(intendedIdFor(diff(key, 'digest', 'base', 'new'), w('base', 'D8')), 'D8');
    assert.equal(intendedIdFor(diff(key, 'digest', 'base', 'new'), w('base', 'D1')), 'D1');
    assert.equal(intendedIdFor(diff(key, 'digest', 'base', 'new'), w('other', 'D8')), null);
    assert.equal(intendedIdFor(diff(key, 'digest', 'base', 'new'), w(undefined, 'D8')), null);
  });

  it('D8 must appear, and D9 for every member who newly sees a complaint', () => {
    const w = world();
    const removed: Difference = { key: 'POST /api/complaints/:id/approve', kind: 'route-only-in-baseline' };
    const seen = `GET /api/complaints/:id |approver|${T}`;
    const sees = diff(seen, 'status', 404, 200);
    const both = world({ [seen]: { base: 404, run: 200 } });
    assert.deepEqual(missingApprovals([removed, sees], both), []);
    assert.deepEqual(missingApprovals([sees], both), ['expected intended difference D8 never appeared']);
    assert.deepEqual(missingApprovals([removed], w), ['D9 lists approver (sees 1 more), but nothing changed for them']);
  });

  it('the frozen legacy `actions` still says what the baseline build said', () => {
    const p = (id: string) => ({ id, name: id.toUpperCase() });
    const c = {
      status: 'awaiting_approval' as const, requiresApproval: true, raisedBy: p('a'), supervisor: p('s'),
      manager: p('m'), hod: p('h'), ceo: null, approver: p('a'),
    };
    const member = legacyActions({ id: 'a', complaintsAdmin: false }, c);
    assert.equal(member.approve.allowed, true, 'the baseline let the raiser-approver approve');
    assert.equal(member.reassign.reason, 'Only M (manager) or H (HOD), or a complaints admin, can reassign this.');
    assert.equal(legacyActions({ id: 'x', complaintsAdmin: true }, c).reassign.allowed, true);
  });
});
