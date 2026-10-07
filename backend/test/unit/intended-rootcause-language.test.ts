import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import {
  D13_CASE,
  D13_RESOLVE_CASE,
  actionsDifferInWordsOnly,
  intendedIdFor,
  matchSwitchOnly,
  missingLanguage,
  missingRootCause,
  withoutComplaintAdditions,
  type IntendedWorld,
} from '../equivalence/intended';
import { legacyNoSupervisorReason, legacySitesBody } from '../equivalence/legacy-complaint-messages';
import { noSupervisorReason } from '../../src/complaints/messages';

/**
 * Owner decisions, 7 Oct 2026:
 *   D7  the complaint detail gains `rootCause` (migration 0015): additive
 *       only, on the detail only, and left out of its digest only;
 *   D12 complaint sentences are Gujarati: only WORDS change, matched only
 *       where a successful complaint body carries sentences, by rebuilding
 *       it in the old words and requiring the baseline's digest;
 *   D13 resolving without a root cause is refused (422): an ADDED case,
 *       matched only against the same person's full resolve.
 */

const C = '30000000-0000-4000-8000-000000000001';
const DETAIL = `GET /api/complaints/:id |raiser|${C}`;

describe('intended difference D7: the detail gains `rootCause`', () => {
  const keys = (key: string, baseline: string[], run: string[]): Difference => ({
    key, kind: 'field', field: 'keys', baseline, run: [...run].sort(),
  });

  it('the detail gaining `can`, `title` and `rootCause` is D7; the list never gains `rootCause`', () => {
    assert.equal(intendedIdFor(keys(DETAIL, ['actions', 'id'], ['actions', 'can', 'id', 'rootCause', 'title'])), 'D7');
    const list: Difference = {
      key: 'GET /api/complaints [tab-all] |raiser', kind: 'field', field: 'itemKeys',
      baseline: ['id'], run: ['can', 'id', 'rootCause', 'title'],
    };
    assert.equal(intendedIdFor(list), null);
    assert.equal(intendedIdFor(keys('GET /api/complaints/summary |raiser', ['a'], ['a', 'rootCause'])), null);
  });

  it('the digest drops `rootCause` on the detail only', () => {
    const detail = { id: '1', title: 'T', rootCause: 'R', resolutionNote: 'N' };
    assert.deepEqual(withoutComplaintAdditions(`/api/complaints/${C}`, detail), { id: '1', resolutionNote: 'N' });
    assert.deepEqual(withoutComplaintAdditions('/api/complaints', [detail]), [{ id: '1', rootCause: 'R', resolutionNote: 'N' }]);
    assert.deepEqual(withoutComplaintAdditions('/api/complaints/summary', detail), detail);
  });
});

describe('intended difference D12: complaint sentences in Gujarati', () => {
  const digest = (key: string, baseline: string, run: string): Difference => ({
    key, kind: 'field', field: 'digest', baseline, run,
  });
  const world = (key: string, c: { legacyDigest?: string; legacyWhy?: string; status?: number }): IntendedWorld => ({
    runCases: { [key]: c },
  });
  const SITES = 'GET /api/complaints/sites |raiser';

  it('a sites body whose rebuilt words give the baseline digest is D12', () => {
    const w = world(SITES, { legacyDigest: 'old', legacyWhy: 'D12', status: 200 });
    assert.equal(intendedIdFor(digest(SITES, 'old', 'new'), w), 'D12');
    assert.deepEqual(missingLanguage([digest(SITES, 'old', 'new')], w), []);
    assert.equal(matchSwitchOnly([digest(SITES, 'old', 'new')], w).unmatched.length, 0);
  });

  it('nothing wider: another digest, another route, another field, or no rebuild never matches', () => {
    const w = world(SITES, { legacyDigest: 'old', legacyWhy: 'D12', status: 200 });
    assert.equal(intendedIdFor(digest(SITES, 'other', 'new'), w), null, 'rebuilt body is not the baseline');
    const elsewhere = 'GET /api/sites |raiser';
    assert.equal(intendedIdFor(digest(elsewhere, 'old', 'new'), world(elsewhere, { legacyDigest: 'old', legacyWhy: 'D12' })), null);
    const status: Difference = { key: SITES, kind: 'field', field: 'status', baseline: 200, run: 403 };
    assert.equal(intendedIdFor(status, w), null);
    assert.equal(intendedIdFor(digest(SITES, 'old', 'new'), world(SITES, {})), null);
    // A rebuilt body the baseline also answered 200 that then does not
    // show as D12 is reported; one the baseline refused (D2's) is not D12's.
    assert.equal(missingLanguage([], { ...w, baselineCases: { [SITES]: { status: 200 } } }).length, 1);
    assert.equal(missingLanguage([], { ...w, baselineCases: { [SITES]: { status: 403 } } }).length, 0);
  });

  it('a detail map differs in words only: same keys, same flags, Gujarati where the old had a sentence', () => {
    const legacy = { start: { allowed: false, reason: 'Only X can.' }, comment: { allowed: true, reason: null } };
    assert.equal(
      actionsDifferInWordsOnly({ start: { allowed: false, reason: 'ફક્ત X જ.' }, comment: { allowed: true, reason: null } }, legacy),
      true,
    );
    // A flag flipped, a key gone, English changed, or nothing changed: not D12.
    assert.equal(
      actionsDifferInWordsOnly({ start: { allowed: true, reason: null }, comment: { allowed: true, reason: null } }, legacy),
      false,
    );
    assert.equal(actionsDifferInWordsOnly({ start: { allowed: false, reason: 'ફક્ત X જ.' } }, legacy), false);
    assert.equal(
      actionsDifferInWordsOnly({ start: { allowed: false, reason: 'Only Y can.' }, comment: { allowed: true, reason: null } }, legacy),
      false,
    );
    assert.equal(actionsDifferInWordsOnly(legacy, legacy), false);
  });

  it('the picker body is rebuilt with the frozen English sentence, and only its reasons change', () => {
    const body = {
      data: [
        { id: 'a', name: 'Vesu', canReceive: false, reason: noSupervisorReason('Vesu') },
        { id: 'b', name: 'Pal', canReceive: true, reason: null },
      ],
    };
    assert.deepEqual(legacySitesBody(body), {
      data: [
        { id: 'a', name: 'Vesu', canReceive: false, reason: legacyNoSupervisorReason('Vesu') },
        { id: 'b', name: 'Pal', canReceive: true, reason: null },
      ],
    });
    assert.equal(legacySitesBody({ data: [body.data[1]] }), null, 'nothing to rebuild');
    assert.match(noSupervisorReason('Vesu'), /[઀-૿]/);
  });
});

describe('intended difference D13: resolving needs a root cause', () => {
  const added = (who: string): Difference => ({ key: `${D13_CASE} |${who}`, kind: 'case-only-in-run' });
  const world = (full: number, without: number, who = `raiser|${C}`): IntendedWorld => ({
    runCases: {
      [`${D13_RESOLVE_CASE} |${who}`]: { status: full },
      [`${D13_CASE} |${who}`]: { status: without },
    },
  });

  it('422 where the full resolve succeeds, or the same refusal, is D13', () => {
    assert.equal(intendedIdFor(added(`supervisor|${C}`), world(200, 422, `supervisor|${C}`)), 'D13');
    assert.equal(intendedIdFor(added(`raiser|${C}`), world(403, 403)), 'D13');
    assert.equal(intendedIdFor(added(`raiser|${C}`), world(409, 409)), 'D13');
    assert.equal(matchSwitchOnly([added(`raiser|${C}`)], world(404, 404)).unmatched.length, 0);
  });

  it('anything else never matches: success without one, a different refusal, a missing case, a field', () => {
    assert.equal(intendedIdFor(added(`raiser|${C}`), world(200, 200)), null, 'resolved without a root cause');
    assert.equal(intendedIdFor(added(`raiser|${C}`), world(403, 422)), null);
    assert.equal(intendedIdFor(added(`raiser|${C}`)), null, 'needs the run');
    assert.equal(intendedIdFor({ key: `${D13_CASE} |raiser|${C}`, kind: 'case-only-in-baseline' }, world(200, 422)), null);
    const field: Difference = { key: `${D13_CASE} |raiser|${C}`, kind: 'field', field: 'status', baseline: 200, run: 422 };
    assert.equal(intendedIdFor(field, world(200, 422)), null);
  });

  it('must appear: someone who may resolve is refused for the root cause', () => {
    const who = `supervisor|${C}`;
    assert.deepEqual(missingRootCause([added(who)], world(200, 422, who)), []);
    assert.equal(missingRootCause([added(`raiser|${C}`)], world(403, 403)).length, 1);
  });
});
