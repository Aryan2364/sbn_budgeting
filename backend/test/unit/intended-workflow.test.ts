import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import { intendedIdFor, missingD6, type IntendedWorld } from '../equivalence/intended';
import { legacyActions } from '../equivalence/legacy-complaint-actions';

/**
 * D1 and D6 on the complaint workflow (plan 6.2, 6.3.3; P5): matched
 * by id and matcher, never by loosening the comparison.
 */
const K = 'kkkk';
const OTHER = 'oooo';
const world = (legacyDigest?: string): IntendedWorld => ({
  runCases: { [`GET /api/complaints/:id |approver|${K}`]: { legacyDigest }, [`GET /api/complaints/:id |raiser|${OTHER}`]: { legacyDigest } },
  selfApprovals: new Map([[`approver|${K}`, 'awaiting_approval']]),
});
const diff = (key: string, field: Difference['field'], baseline: unknown, run: unknown): Difference => ({
  key, kind: 'field', field, baseline, run,
});
const flags = (approve: boolean, sendBack = approve) => ({
  approve, comment: true, reassign: false, resolve: false, sendBack, start: false,
});

describe('intended differences D1 and D6 (P5)', () => {
  it('D6: approve and send back 200 -> 409, only for the approver on a listed complaint', () => {
    const w = world();
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/approve |approver|${K}`, 'status', 200, 409), w), 'D6');
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/send-back |approver|${K}`, 'status', 200, 409), w), 'D6');
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/approve |approver|${OTHER}`, 'status', 200, 409), w), null);
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/approve |hod|${K}`, 'status', 200, 409), w), null);
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/approve |approver|${K}`, 'status', 200, 403), w), null);
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/start |approver|${K}`, 'status', 200, 409), w), null);
    assert.equal(intendedIdFor(diff(`POST /api/complaints/:id/approve |approver|${K}`, 'status', 200, 409)), null, 'no world, no match');
  });

  it("D6: the detail's approve and send back flags turn off, and nothing else moves", () => {
    const w = world();
    const key = `GET /api/complaints/:id |approver|${K}`;
    assert.equal(intendedIdFor(diff(key, 'actions', flags(true), flags(false)), w), 'D6');
    assert.equal(intendedIdFor(diff(key, 'actions', flags(true), { ...flags(false), comment: false }), w), null);
    assert.equal(intendedIdFor(diff(key, 'actions', flags(false), flags(true)), w), null);
  });

  it('D1/D6: a detail digest differs only in `actions` when the legacy digest equals the baseline', () => {
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |raiser|${OTHER}`, 'digest', 'base', 'new'), world('base')), 'D1');
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |approver|${K}`, 'digest', 'base', 'new'), world('base')), 'D6');
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |raiser|${OTHER}`, 'digest', 'base', 'new'), world('other')), null);
    assert.equal(intendedIdFor(diff(`GET /api/complaints/:id |raiser|${OTHER}`, 'digest', 'base', 'new'), world()), null);
    assert.equal(intendedIdFor(diff(`GET /api/complaints |raiser`, 'digest', 'base', 'new'), world('base')), null);
  });

  it("D6's count: every listed waiting complaint must show both changes", () => {
    const w = world();
    const both = [
      diff(`POST /api/complaints/:id/approve |approver|${K}`, 'status', 200, 409),
      diff(`POST /api/complaints/:id/send-back |approver|${K}`, 'status', 200, 409),
    ];
    assert.deepEqual(missingD6(both, w), []);
    assert.equal(missingD6(both.slice(0, 1), w).length, 1);
  });

  it('the frozen legacy `actions` still says what the baseline build said', () => {
    const p = (id: string) => ({ id, name: id.toUpperCase() });
    const c = {
      status: 'awaiting_approval' as const, requiresApproval: true, raisedBy: p('a'), supervisor: p('s'),
      manager: p('m'), hod: p('h'), ceo: null, approver: p('a'),
    };
    const member = legacyActions({ id: 'a', complaintsAdmin: false }, c);
    assert.equal(member.approve.allowed, true, 'today the raiser-approver may approve');
    assert.equal(member.reassign.reason, 'Only M (manager) or H (HOD), or a complaints admin, can reassign this.');
    assert.equal(legacyActions({ id: 'x', complaintsAdmin: true }, c).reassign.allowed, true);
  });
});
