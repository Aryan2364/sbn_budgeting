import type { Difference } from './compare';

/**
 * Intended differences (access plan 6.3.3), matched by id and matcher,
 * never by loosening the comparison. Only the entries a phase has
 * actually shipped are here; each later phase adds its own BEFORE the
 * change that causes it, with the owner's agreement.
 *
 * D7 (from P2a): `GET /auth/me` gains `access`. Additive only:
 *   - the response's top-level keys may gain exactly the listed keys;
 *   - the digest is taken with those keys removed (matrix.ts), so the
 *     rest of the body must still match the baseline exactly, and no
 *     digest difference is excused here;
 *   - the status must not change.
 */

/** Response keys a route gains under D7, by request path (no params). */
export const D7_ADDITIVE_KEYS: Readonly<Record<string, readonly string[]>> = {
  '/api/auth/me': ['access'],
};

/** The body with D7's additive keys removed, for the digest. */
export function withoutAdditiveKeys(path: string, body: unknown): unknown {
  const extra = D7_ADDITIVE_KEYS[path];
  if (!extra || !body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) if (!extra.includes(k)) out[k] = v;
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * D7: the `/pick/*` and `/access/*` routes exist (plan 6.3.3). They are
 * routes that exist only in the new system, so the
 * baseline has neither the route nor its cases. Only ADDED routes and
 * cases under these prefixes match; one missing from a run never does.
 */
export const D7_NEW_ROUTE_PREFIXES: readonly string[] = ['/api/pick/', '/api/access/'];

function isNewSystemRoute(key: string): boolean {
  const path = (key.split(' |')[0] ?? '').split(' ')[1] ?? '';
  return D7_NEW_ROUTE_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * D7: every list row and every record detail gains `can`, the
 * per-record answers (plan 6.1.4 item 6, 6.3.3). Additive only:
 *   - a GET's `keys` (a detail) or `itemKeys` (list rows) may gain
 *     exactly `can` and nothing else;
 *   - the digest is taken with `can` removed (matrix.ts), so the rest
 *     of the body, and every row, must still match the baseline exactly;
 *   - ids, totals, aggregates and the status must not change.
 * The baseline has no `can` key anywhere, so stripping it hides nothing
 * the old build sent.
 */
export const D7_RECORD_KEY = 'can';

function withoutCanKey(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (k !== D7_RECORD_KEY) out[k] = v;
  return out;
}

/** A body or a list of rows with D7's `can` removed: from the record itself and from each of its rows. */
export function withoutRecordCan(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(withoutCanKey);
  const out = withoutCanKey(body);
  if (!out || typeof out !== 'object') return out;
  const o = out as Record<string, unknown>;
  for (const k of ['data', 'rows', 'items']) if (Array.isArray(o[k])) o[k] = (o[k] as unknown[]).map(withoutCanKey);
  return o;
}

// ---------------------------------------------------------------------
// The complaint workflow: D1 (P5), D8 and D9 (owner decisions A1-A3,
// 5 Oct 2026, migration 0013). D6 (the approver may not approve what
// they raised or resolved) is RETIRED with D8: its two routes no longer
// exist, so its cases are D8's route removals.
// ---------------------------------------------------------------------

/**
 * What the D1, D8 and D9 matchers need beyond the differing field
 * itself. Without it they match nothing.
 */
export interface IntendedWorld {
  /** The run's cases by key: `legacyDigest`, `legacyWhy`, ids and statuses (matrix.ts). */
  runCases: Readonly<Record<string, { legacyDigest?: string; legacyWhy?: string; status?: unknown; ids?: string[] }>>;
  /**
   * The baseline's cases by key, for the matchers that judge a whole
   * case by its two statuses (D2, D3, D4, D8, D9). Without it they match
   * nothing.
   */
  baselineCases?: Readonly<Record<string, { status: unknown; ids?: string[] }>>;
  /** The switch-over's people and routes (D2, D4). Without it D2 and D4 match nothing. */
  switchOver?: SwitchWorld;
  /** D8's and D9's facts, from the complaint world before migration 0013. Without it they match only route removals. */
  approvals?: ApprovalsWorld;
}

/** legacy-approvals.ts's record, keyed by case label ("<user label>|<complaint id>"). */
export interface ApprovalsWorld {
  /** Complaint ids migration 0013 closed (they were waiting for approval). */
  migrated: ReadonlySet<string>;
  /** "label|complaintId": a complaints member named its HOD, not its manager (D8: reassign by designation gone). */
  hodOnly: ReadonlySet<string>;
  /** Person label -> complaint ids they newly see (D9). */
  extras: ReadonlyMap<string, ReadonlySet<string>>;
  /** Person label -> complaint ids they no longer see (D9). */
  losses: ReadonlyMap<string, ReadonlySet<string>>;
}

/** D8: the routes A1 removed. Their route and every one of their cases are D8. */
export const D8_REMOVED_ROUTES: readonly string[] = [
  'POST /api/complaints/:id/approve',
  'POST /api/complaints/:id/send-back',
];

/** D8: the case that asks for a tab A1 removed: 200 before, 400 now. */
export const D8_GONE_CASES: readonly string[] = ['GET /api/complaints [tab-approval]'];

/** D8: the response keys (a detail's `keys`, a list's `itemKeys`) 0013 dropped, per route. */
export const D8_REMOVED_KEYS: Readonly<Record<string, readonly string[]>> = {
  'GET /api/complaints/:id': ['approver', 'ceo', 'hod', 'requiresApproval'],
  'GET /api/complaints/counts': ['approval'],
  'GET /api/complaint-categories': ['approverDesignation', 'requiresApproval'],
  'GET /api/complaint-categories/:id': ['approverDesignation', 'requiresApproval'],
};

/** D8: the detail's `actions` entries A1 removed. */
const D8_ACTIONS = ['approve', 'sendBack'];

export const COMPLAINT_DETAIL_ROUTE = 'GET /api/complaints/:id';
const REASSIGN_CASE = 'POST /api/complaints/:id/reassign [to-another-supervisor]';

/** "POST /api/x/:id [variant] |user|target" -> the route, the case (route + variant) and "user|target". */
function splitKey(key: string): { route: string; kase: string; who: string } {
  const at = key.indexOf(' |');
  const head = at < 0 ? key : key.slice(0, at);
  const [method, path] = head.split(' ');
  return { route: `${method} ${path}`, kase: head, who: at < 0 ? '' : key.slice(at + 2) };
}

/** "label|complaintId" -> its parts. */
function whoParts(who: string): { label: string; target: string } {
  const [label = '', target = ''] = who.split('|');
  return { label, target };
}

/**
 * The digest of a read that differs only where an intended difference
 * says: with D8 and D9 undone on the run's own body (legacy-approvals.ts),
 * or, for a complaint detail with no such record, with `actions` as the
 * baseline build computed it (D1: reasons stop naming a role; refusal
 * wording is not compared, plan 6.2), the digest is the baseline's
 * exactly. `legacyWhy` says which was needed.
 */
function legacyDigestIdFor(d: Difference, world: IntendedWorld): string | null {
  if (d.field !== 'digest') return null;
  const c = world.runCases[d.key];
  if (!c?.legacyDigest || c.legacyDigest !== d.baseline) return null;
  // D12 is named by languageIdFor alone, which also checks the route.
  if (c.legacyWhy === 'D12') return null;
  return c.legacyWhy ?? null;
}

/** D8 on the keys of a detail or the item keys of a list: exactly the dropped keys gone (and D7's `can` added). */
function d8KeysIdFor(d: Difference, route: string): string | null {
  if (d.field !== 'keys' && d.field !== 'itemKeys') return null;
  const removed = D8_REMOVED_KEYS[route];
  if (!removed || !Array.isArray(d.baseline) || !Array.isArray(d.run)) return null;
  const base = d.baseline as string[];
  const run = d.run as string[];
  if (!removed.every((k) => base.includes(k))) return null;
  const expected = withTitle(route, base.filter((k) => !removed.includes(k)));
  if (run.includes(D7_RECORD_KEY) && !base.includes(D7_RECORD_KEY)) expected.push(D7_RECORD_KEY);
  return same(expected.sort(), run) ? 'D8' : null;
}

/**
 * D8 on a complaint detail's `actions` flags: approve and send back are
 * gone, and every other flag is unchanged, except reassign turning off
 * on a complaint 0013 closed, or for a member who reached it only as its
 * HOD (reassign at Own is the complaint's manager now, A2).
 */
function d8ActionsIdFor(d: Difference, a: ApprovalsWorld, who: string): string | null {
  if (d.field !== 'actions') return null;
  const base = d.baseline as Record<string, boolean> | undefined;
  const run = d.run as Record<string, boolean> | undefined;
  if (!base || !run) return null;
  const expectedKeys = Object.keys(base).filter((k) => !D8_ACTIONS.includes(k)).sort();
  if (!same(expectedKeys, Object.keys(run).sort())) return null;
  const { target } = whoParts(who);
  for (const k of expectedKeys) {
    if (base[k] === run[k]) continue;
    const reassignOff = k === 'reassign' && base[k] === true && run[k] === false;
    if (!reassignOff || !(a.migrated.has(target) || a.hodOnly.has(who))) return null;
  }
  return 'D8';
}

/** D8 on an action's status: reassigning a complaint 0013 closed (200 -> 409), or as its HOD only (-> 403). */
function d8ReassignIdFor(kase: string, who: string, st: { base: unknown; run: unknown }, a: ApprovalsWorld): string | null {
  if (kase !== REASSIGN_CASE) return null;
  const { target } = whoParts(who);
  if (a.migrated.has(target) && st.base === 200 && st.run === 409) return 'D8';
  if (a.hodOnly.has(who) && (st.base === 200 || st.base === 409) && st.run === 403) return 'D8';
  return null;
}

const D9_SEES_NOW = new Set<unknown>([200, 403]);

/**
 * D9 on one case about one complaint: a member newly sees it (404 before;
 * now the answer of someone who can see it: 200, or 403 for an action
 * their Own scope does not reach), or no longer does (-> 404). Every
 * field of such a case is D9.
 */
function d9CaseIdFor(who: string, st: { base: unknown; run: unknown }, a: ApprovalsWorld): string | null {
  const { label, target } = whoParts(who);
  if (a.extras.get(label)?.has(target)) return st.base === 404 && D9_SEES_NOW.has(st.run) ? 'D9' : null;
  if (a.losses.get(label)?.has(target)) return D9_SEES_NOW.has(st.base) && st.run === 404 ? 'D9' : null;
  return null;
}

/**
 * D9 on a complaint list's ids and total: the ids gained are complaints
 * the member newly sees, the ids lost ones they no longer see, and the
 * total moves by exactly that.
 */
function d9ListIdFor(d: Difference, world: IntendedWorld, route: string, who: string, a: ApprovalsWorld): string | null {
  if (route !== 'GET /api/complaints' || (d.field !== 'ids' && d.field !== 'total')) return null;
  const base = new Set(world.baselineCases?.[d.key]?.ids ?? []);
  const run = new Set(world.runCases[d.key]?.ids ?? []);
  const { label } = whoParts(who);
  const extras = a.extras.get(label) ?? new Set<string>();
  const losses = a.losses.get(label) ?? new Set<string>();
  const gained = [...run].filter((id) => !base.has(id));
  const lost = [...base].filter((id) => !run.has(id));
  if (!gained.length && !lost.length) return null;
  const ok =
    gained.every((id) => extras.has(id.replace(/^id:/, ''))) && lost.every((id) => losses.has(id.replace(/^id:/, '')));
  if (!ok) return null;
  if (d.field === 'total') return (d.run as number) - (d.baseline as number) === gained.length - lost.length ? 'D9' : null;
  return 'D9';
}

/** D8 or D9 for one difference, or null. */
export function approvalsIdFor(d: Difference, world: IntendedWorld): string | null {
  const { route, kase, who } = splitKey(d.key);
  if (d.kind === 'route-only-in-baseline' || d.kind === 'case-only-in-baseline') {
    return D8_REMOVED_ROUTES.includes(route) ? 'D8' : null;
  }
  if (d.kind !== 'field') return null;
  const st = statuses(d, world);
  if (D8_GONE_CASES.includes(kase)) return st?.base === 200 && st.run === 400 ? 'D8' : null;
  const a = world.approvals;
  if (a && st && st.base !== st.run) {
    return d9CaseIdFor(who, st, a) ?? d8ReassignIdFor(kase, who, st, a);
  }
  return (
    d8KeysIdFor(d, route) ??
    legacyDigestIdFor(d, world) ??
    (a && route === COMPLAINT_DETAIL_ROUTE ? d8ActionsIdFor(d, a, who) : null) ??
    (a ? d9ListIdFor(d, world, route, who, a) : null)
  );
}

/**
 * Plan 6.3.2, every listed entry appears: D8 (the removed routes are in
 * every baseline) and, for each member who newly sees a complaint, D9.
 */
export function missingApprovals(diffs: readonly Difference[], world: IntendedWorld): string[] {
  const seen = new Set<string>();
  const d9People = new Set<string>();
  for (const d of diffs) {
    const id = approvalsIdFor(d, world);
    if (!id) continue;
    seen.add(id);
    if (id === 'D9') d9People.add(whoParts(splitKey(d.key).who).label);
  }
  const out: string[] = [];
  if (!seen.has('D8')) out.push('expected intended difference D8 never appeared');
  for (const [label, extras] of world.approvals?.extras ?? []) {
    if (extras.size && !d9People.has(label)) out.push(`D9 lists ${label} (sees ${extras.size} more), but nothing changed for them`);
  }
  return out;
}

/**
 * D5 (plan 6.3.3; P6): "You can't remove your own platform admin" (422)
 * becomes the last-holder rule. Removing your own Admin is allowed (200)
 * while another active Admin exists, and refused (409) when you are the
 * last. Only the case that sends `modules: { platform: null }` answered
 * 422 before, and only for the caller's own record (the handler's one
 * 422 for a modules-only body), so the matcher is that case and that
 * change of status, nothing wider.
 */
export const D5_CASE = 'PATCH /api/users/:id [remove-platform-admin]';

function d5IdFor(d: Difference): string | null {
  if (d.kind !== 'field' || d.field !== 'status') return null;
  if ((d.key.split(' |')[0] ?? '') !== D5_CASE) return null;
  return d.baseline === 422 && (d.run === 200 || d.run === 409) ? 'D5' : null;
}

// ---------------------------------------------------------------------
// The complaint title (owner decision, 6 Oct 2026; migration 0014).
//
// D7 (additive, like `can`): a complaint list row and a complaint detail
// gain `title`, the complaint's short title. Additive only:
//   - a GET's `keys` (the detail) or `itemKeys` (the list rows) may gain
//     exactly `title` (beside D7's `can` and D8's removals) and nothing
//     else, on exactly these two routes;
//   - the digest is taken with `title` removed from those two routes'
//     bodies only (matrix.ts), so every other field, description and
//     complainant included, must still match the baseline exactly.
// The baseline has no `title` key on either route, so stripping it hides
// nothing the old build sent.
//
// D11: the complainant's name, phone and description are optional. A
// raise that leaves them out (or sends them blank) is answered as the
// full raise is, where the old build refused it (400). The baseline has
// no such case, so they are cases ADDED to the run, matched by name, and
// only when their status equals the same person's full raise in the run.
// ---------------------------------------------------------------------

/** D7: the key complaint rows and details gain (migration 0014). */
export const D7_TITLE_KEY = 'title';

/**
 * D7 (owner decision, 7 Oct 2026; migration 0015): the complaint detail
 * gains `rootCause`, why the problem happened, written when resolving.
 * Additive exactly like `title`: the detail's `keys` may gain it, it is
 * left out of the detail's digest only, and the baseline has no such key.
 */
export const D7_ROOT_CAUSE_KEY = 'rootCause';

/** D7: the routes (method + template) whose records gain `title`. */
export const D7_TITLE_ROUTES: readonly string[] = ['GET /api/complaints', 'GET /api/complaints/:id'];

/** D7: the keys complaint records gain, per route: `title` on both, `rootCause` on the detail. */
export const D7_COMPLAINT_KEYS: Readonly<Record<string, readonly string[]>> = {
  'GET /api/complaints': [D7_TITLE_KEY],
  'GET /api/complaints/:id': [D7_TITLE_KEY, D7_ROOT_CAUSE_KEY],
};

/** The list's request path, and the detail's (`/api/complaints/<uuid>`). */
const LIST_PATH = /^\/api\/complaints$/;
const DETAIL_PATH = /^\/api\/complaints\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withoutKeys(value: unknown, drop: readonly string[]): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!drop.includes(k)) out[k] = v;
  return out;
}

/**
 * The body with D7's complaint additions removed, for the digest:
 * `title` from each complaint row, and `title` and `rootCause` from a
 * complaint detail, on those two routes only. Any other path's body is
 * returned untouched.
 */
export function withoutComplaintAdditions(path: string, body: unknown): unknown {
  const drop = LIST_PATH.test(path)
    ? D7_COMPLAINT_KEYS['GET /api/complaints']!
    : DETAIL_PATH.test(path)
      ? D7_COMPLAINT_KEYS['GET /api/complaints/:id']!
      : null;
  if (!drop) return body;
  if (Array.isArray(body)) return body.map((r) => withoutKeys(r, drop));
  const out = withoutKeys(body, drop);
  if (!out || typeof out !== 'object') return out;
  const o = out as Record<string, unknown>;
  for (const k of ['data', 'rows', 'items']) if (Array.isArray(o[k])) o[k] = (o[k] as unknown[]).map((r) => withoutKeys(r, drop));
  return o;
}

/** Keys as the run should have them on `route`: plus D7's complaint additions on those two routes. */
function withTitle(route: string, keys: readonly string[]): string[] {
  const add = (D7_COMPLAINT_KEYS[route] ?? []).filter((k) => !keys.includes(k));
  return [...keys, ...add];
}

/**
 * D7 for a titled route's `keys` / `itemKeys` that gained exactly its
 * complaint additions (`title`, and `rootCause` on the detail), against
 * a build that already sent `can`, e.g. a pre-switch snapshot.
 */
function titleOnlyIdFor(d: Difference): string | null {
  if (d.kind !== 'field' || (d.field !== 'keys' && d.field !== 'itemKeys')) return null;
  const { route } = splitKey(d.key);
  if (!D7_TITLE_ROUTES.includes(route)) return null;
  if (!Array.isArray(d.baseline) || !Array.isArray(d.run)) return null;
  const base = d.baseline as string[];
  if (base.includes(D7_TITLE_KEY)) return null;
  return same(withTitle(route, base).sort(), d.run) ? 'D7' : null;
}

/** D11: the full raise case each D11 case is judged against. */
export const D11_RAISE_CASE = 'POST /api/complaints';

/** D11: the raise cases with no complainant name, phone or description (cases.ts). */
export const D11_CASES: readonly string[] = [
  'POST /api/complaints [without-optional-fields]',
  'POST /api/complaints [optional-fields-blank]',
];

/**
 * D11 for one difference: one of D11's cases, ADDED to the run, whose
 * status is the same person's full raise status in this run (201 to
 * whoever may raise; the same refusal to whoever may not). Nothing else:
 * not a field difference, not a case missing from the run, not another
 * route's case.
 */
export function optionalFieldsIdFor(d: Difference, world?: IntendedWorld): string | null {
  if (d.kind !== 'case-only-in-run' || !world) return null;
  const { kase, who } = splitKey(d.key);
  if (!D11_CASES.includes(kase)) return null;
  const full = world.runCases[`${D11_RAISE_CASE} |${who}`];
  const run = world.runCases[d.key];
  if (!full || !run || full.status === undefined) return null;
  return run.status === full.status ? 'D11' : null;
}

/**
 * Plan 6.3.2, every listed entry appears: D11's cases are in every run,
 * and in each, someone who may raise must have had it succeed (201).
 */
export function missingOptionalFields(diffs: readonly Difference[], world: IntendedWorld): string[] {
  const out: string[] = [];
  for (const kase of D11_CASES) {
    const hits = diffs.filter((d) => splitKey(d.key).kase === kase && optionalFieldsIdFor(d, world) === 'D11');
    if (!hits.some((d) => world.runCases[d.key]?.status === 201)) {
      out.push(`D11 lists ${kase}, but no raise without the optional fields succeeded`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// D12 (owner decision, 7 Oct 2026): the Complaints area speaks Gujarati.
//
// Every sentence the complaint routes send a person is now Gujarati:
// refusals, field errors, the workflow's reasons, the site picker's
// `reason`, notifications. Only WORDS change: every status code, every
// field, every flag stays as it was.
//
// Most of it never reaches the comparison: the harness records no
// refusal text (matrix.ts; D1), so a refusal's new words cannot differ.
// Two successful reads carry sentences in their bodies, and only there
// is D12 matched, by rebuilding the body with the old English words and
// requiring the baseline's digest exactly (`legacyDigest`, `legacyWhy`):
//   GET /api/complaints/sites  each row's `reason` replaced by the frozen
//       English sentence (legacy-complaint-messages.ts);
//   GET /api/complaints/:id   `actions` reasons: the run's map is
//       replaced by the frozen baseline map (legacy-complaint-actions.ts),
//       as D1 does, and D12 is named only when the run's map differs from
//       it in reason WORDS alone (same keys, same allowed flags). On the
//       fixtures every detail is already rebuilt by D8 (legacy-
//       approvals.ts puts the frozen `actions` back wholesale), so its
//       Gujarati reasons sit inside D8's proof and are counted there;
//       this branch serves a run whose complaints D8 does not know.
// Nothing else: another route, a flag, a status or a key never matches.
//
// D13 (owner decision, 7 Oct 2026; migration 0015): resolving needs a
// root cause. A resolve without one is refused (422) where the full
// resolve succeeds. The baseline has no such case, so it is a case ADDED
// to the run, matched by name, only when it answers 422 where the same
// person's full resolve of the same complaint answers 200, and otherwise
// exactly as that full resolve does (refused first by permission,
// workflow or status). The full resolve case now sends a root cause, a
// request field like the raise's title, so its answers stand.
// ---------------------------------------------------------------------

/** D12: the routes whose successful bodies carry sentences, rebuilt in the old words. */
export const D12_ROUTES: readonly string[] = ['GET /api/complaints/:id', 'GET /api/complaints/sites'];

/** Gujarati script: a sentence written for the Complaints area since D12. */
export function isGujarati(text: unknown): boolean {
  return typeof text === 'string' && /[\u0A80-\u0AFF]/.test(text);
}

/**
 * D12 on a complaint detail's `actions`: the run's map against the
 * frozen baseline map. True only when they have the same actions with
 * the same allowed flags, and every reason that differs is a Gujarati
 * sentence where the baseline had a sentence too.
 */
export function actionsDifferInWordsOnly(
  run: Readonly<Record<string, { allowed: boolean; reason: string | null }>>,
  legacy: Readonly<Record<string, { allowed: boolean; reason: string | null }>>,
): boolean {
  const names = Object.keys(legacy).sort();
  if (!same(names, Object.keys(run).sort())) return false;
  let differs = false;
  for (const name of names) {
    const a = run[name]!;
    const b = legacy[name]!;
    if (a.allowed !== b.allowed) return false;
    if (a.reason === b.reason) continue;
    if (a.reason === null || b.reason === null || !isGujarati(a.reason)) return false;
    differs = true;
  }
  return differs;
}

/** D12 for a digest difference: rebuilt in the old words, the body is the baseline's exactly. */
function languageIdFor(d: Difference, world: IntendedWorld): string | null {
  if (d.kind !== 'field' || d.field !== 'digest') return null;
  const c = world.runCases[d.key];
  if (c?.legacyWhy !== 'D12' || !c.legacyDigest || c.legacyDigest !== d.baseline) return null;
  return D12_ROUTES.includes(splitKey(d.key).route) ? 'D12' : null;
}

/**
 * Plan 6.3.2: every case the run rebuilt for D12 (a body whose words
 * changed) that the baseline also answered 200 must show as a D12
 * difference: its rebuilt body is the baseline's, its own is not. (A
 * case the baseline refused, D2's for instance, has no baseline body to
 * compare and is that entry's.) One line per miss.
 */
export function missingLanguage(diffs: readonly Difference[], world: IntendedWorld): string[] {
  const seen = new Set(diffs.filter((d) => languageIdFor(d, world) === 'D12').map((d) => d.key));
  return Object.entries(world.runCases)
    .filter(
      ([key, c]) =>
        c.legacyWhy === 'D12' &&
        D12_ROUTES.includes(splitKey(key).route) &&
        c.status === 200 &&
        world.baselineCases?.[key]?.status === 200 &&
        !seen.has(key),
    )
    .map(([key]) => `D12 rebuilt ${key} in the old words, but it did not match the baseline`);
}

/** D13: the full resolve case each D13 case is judged against. */
export const D13_RESOLVE_CASE = 'POST /api/complaints/:id/resolve [note-and-photo]';

/** D13: the resolve case without a root cause (cases.ts). */
export const D13_CASE = 'POST /api/complaints/:id/resolve [without-root-cause]';

/**
 * D13 for one difference: the case without a root cause, ADDED to the
 * run, answering 422 where the same person's full resolve of the same
 * complaint answers 200, or else exactly as that one does. Nothing else.
 */
export function rootCauseIdFor(d: Difference, world?: IntendedWorld): string | null {
  if (d.kind !== 'case-only-in-run' || !world) return null;
  const { kase, who } = splitKey(d.key);
  if (kase !== D13_CASE) return null;
  const full = world.runCases[`${D13_RESOLVE_CASE} |${who}`];
  const run = world.runCases[d.key];
  if (!full || !run || full.status === undefined) return null;
  if (full.status === 200) return run.status === 422 ? 'D13' : null;
  return run.status === full.status ? 'D13' : null;
}

/** Plan 6.3.2: D13's case is in every run, and someone who may resolve must have been refused for the root cause. */
export function missingRootCause(diffs: readonly Difference[], world: IntendedWorld): string[] {
  const hits = diffs.filter((d) => rootCauseIdFor(d, world) === 'D13');
  return hits.some((d) => world.runCases[d.key]?.status === 422)
    ? []
    : [`D13 lists ${D13_CASE}, but no resolve without a root cause was refused for it`];
}

// ---------------------------------------------------------------------
// D10 (owner decision, 6 Oct 2026): two report routes no screen calls
// are removed. GET /reports/variance/periods (static period labels; the
// frontend keeps its own, lib/periods.ts) and GET /reports/variance/
// sites/:siteId (the old one-site report; the site page's Variance tab
// reads head-periods). Removal only: the route itself and its cases
// MISSING from a run match, for exactly these two routes. A case added
// under them, or any field that differs, never does.
// ---------------------------------------------------------------------

/** D10: the routes removed as unused. Their route and every one of their cases are D10. */
export const D10_REMOVED_ROUTES: readonly string[] = [
  'GET /api/reports/variance/periods',
  'GET /api/reports/variance/sites/:siteId',
];

/** D10 for one difference: a removed route, or one of its cases, missing from the run. */
export function removedRouteIdFor(d: Difference): string | null {
  if (d.kind !== 'route-only-in-baseline' && d.kind !== 'case-only-in-baseline') return null;
  return D10_REMOVED_ROUTES.includes(splitKey(d.key).route) ? 'D10' : null;
}

/**
 * Plan 6.3.2, every listed entry appears: each D10 route is in every
 * baseline, so each must show as removed. One line per miss.
 */
export function missingRemovals(diffs: readonly Difference[]): string[] {
  const gone = new Set(
    diffs.filter((d) => d.kind === 'route-only-in-baseline' && removedRouteIdFor(d)).map((d) => d.key),
  );
  return D10_REMOVED_ROUTES.filter((r) => !gone.has(r)).map(
    (r) => `D10 lists ${r} as removed, but the comparison did not find it gone`,
  );
}

/** The id of the intended difference this one is, or null when it is unexplained. */
export function intendedIdFor(d: Difference, world?: IntendedWorld): string | null {
  if ((d.kind === 'route-only-in-run' || d.kind === 'case-only-in-run') && isNewSystemRoute(d.key)) return 'D7';
  if (d.kind === 'field' && world) {
    const id = switchOverIdFor(d, world);
    if (id) return id;
  }
  const d5 = d5IdFor(d);
  if (d5) return d5;
  const d10 = removedRouteIdFor(d);
  if (d10) return d10;
  const d11 = optionalFieldsIdFor(d, world);
  if (d11) return d11;
  const d13 = rootCauseIdFor(d, world);
  if (d13) return d13;
  if (world) {
    const d12 = languageIdFor(d, world);
    if (d12) return d12;
    const id = approvalsIdFor(d, world);
    if (id) return id;
  }
  if (d.kind !== 'field' || (d.field !== 'keys' && d.field !== 'itemKeys')) return null;
  const route = d.key.split(' |')[0] ?? '';
  const [method, path] = route.split(' ');
  if (method !== 'GET' || !path) return null;
  if (!Array.isArray(d.baseline) || !Array.isArray(d.run)) return null;
  const base = d.baseline as string[];
  // Rows or a detail gaining exactly `can` (the per-record answers), and
  // `title` on the two complaint routes (migration 0014).
  if (!base.includes(D7_RECORD_KEY) && same(withTitle(`${method} ${path}`, [...base, D7_RECORD_KEY]).sort(), d.run)) {
    return 'D7';
  }
  const titled = titleOnlyIdFor(d);
  if (titled) return titled;
  if (d.field !== 'keys') return null;
  const extra = D7_ADDITIVE_KEYS[path];
  if (!extra) return null;
  const expected = [...base, ...extra].sort();
  return same(expected, d.run) ? 'D7' : null;
}

export interface Matched {
  unmatched: Difference[];
  /** Intended id -> how many differences it explained. */
  matched: Record<string, number>;
}

export function matchIntended(diffs: readonly Difference[], world?: IntendedWorld): Matched {
  const unmatched: Difference[] = [];
  const matched: Record<string, number> = {};
  for (const d of diffs) {
    const id = intendedIdFor(d, world);
    if (id) matched[id] = (matched[id] ?? 0) + 1;
    else unmatched.push(d);
  }
  return { unmatched, matched };
}

// ---------------------------------------------------------------------
// The switch-over (plan P9, 6.3.3): D2, D3 and D4.
//
// From P2b to P9 the new route guard ran in SHADOW beside the old one,
// and these three were matched as disagreements in its log. P9 deleted
// the old guard: the permission guard now decides, so they show as
// differences from the baseline instead. The baseline is NOT re-recorded
// (it stays the reference, the old build's answers); each is matched
// here by id and matcher, case by case, on the case's two statuses.
// ---------------------------------------------------------------------

/**
 * D3: the full master lists need `manage` from P9; everyone else uses
 * /pick/... Route template -> the manage key the guard asks for.
 * `site-locations` is the locations alias (plan 5.3.3).
 */
export const D3_MASTER_READS: Readonly<Record<string, string>> = {
  'GET /api/cost-heads': 'budget.cost_heads.manage',
  'GET /api/cost-heads/:id': 'budget.cost_heads.manage',
  'GET /api/complaint-categories': 'complaints.categories.manage',
  'GET /api/complaint-categories/:id': 'complaints.categories.manage',
  'GET /api/designations': 'platform.designations.manage',
  'GET /api/designations/:id': 'platform.designations.manage',
  'GET /api/locations': 'platform.locations.manage',
  'GET /api/locations/:id': 'platform.locations.manage',
  'GET /api/site-locations': 'platform.locations.manage',
  'GET /api/site-locations/:id': 'platform.locations.manage',
};

/** D4: the people picker is decided by platform.people.pick (alias of /pick/platform/people until P11). */
export const D4_ROUTE = 'GET /api/users/picker';
export const D4_KEY = 'platform.people.pick';

export interface SwitchWorld {
  /**
   * D2's people, from the mapping report (plan 5.4 items 2 and 3), by
   * their case label: each platform admin Admin gives more than they
   * had, and the modules they gain ('budget', 'complaints').
   */
  d2Gains: ReadonlyMap<string, ReadonlySet<string>>;
  /** D4's people, by case label: no user_module_access row today. */
  noModuleRows: ReadonlySet<string>;
  /** "GET /api/cost-heads/:id" -> the module of the key its declaration names, or null. */
  moduleOf(route: string): string | null;
}

/** The case's two statuses, or null when either side is missing. */
function statuses(d: Difference, world: IntendedWorld): { base: unknown; run: unknown } | null {
  const base = world.baselineCases?.[d.key];
  const run = world.runCases[d.key] as { status?: unknown } | undefined;
  return base && run ? { base: base.status, run: run.status } : null;
}

/** "user|target" -> the user's case label. */
const personOf = (who: string): string => who.split('|')[0] ?? '';

const REFUSED = new Set<unknown>([403, 404]);

/**
 * D2: a platform admin maps to Admin and gains what they lacked, on the
 * gained modules' routes, for the people the mapping report names only.
 * A case they were refused (403, or 404 out of scope) and now get any
 * other answer short of a server error is D2 in every field. A case they already reached and
 * still reach with the same status may only WIDEN: no id lost, and the
 * totals, aggregates, flags and body that follow.
 */
function d2IdFor(d: Difference, world: IntendedWorld, route: string, who: string): string | null {
  const sw = world.switchOver;
  const gains = sw?.d2Gains.get(personOf(who));
  const module = sw?.moduleOf(route) ?? null;
  if (!gains || !module || !gains.has(module)) return null;
  const st = statuses(d, world);
  if (!st) return null;
  // Refused before; now any answer the route gives a holder, including
  // today's workflow refusals (409, 422), but never a server error.
  if (REFUSED.has(st.base)) return st.run !== st.base && typeof st.run === 'number' && st.run < 500 ? 'D2' : null;
  if (st.run !== st.base || d.field === 'status') return null;
  if (d.field === 'ids') {
    const after = new Set((d.run as string[] | undefined) ?? []);
    return ((d.baseline as string[] | undefined) ?? []).every((id) => after.has(id)) ? 'D2' : null;
  }
  return 'D2';
}

/** D3: a master list GET answered 200 in the baseline, now 403 (the guard asks for manage). */
function d3IdFor(d: Difference, world: IntendedWorld, route: string): string | null {
  if (!D3_MASTER_READS[route]) return null;
  const st = statuses(d, world);
  return st?.base === 200 && st.run === 403 ? 'D3' : null;
}

/** D4: the picker answered 200 to someone with no module rows today, now 403. */
function d4IdFor(d: Difference, world: IntendedWorld, route: string, who: string): string | null {
  if (route !== D4_ROUTE || !world.switchOver?.noModuleRows.has(personOf(who))) return null;
  const st = statuses(d, world);
  return st?.base === 200 && st.run === 403 ? 'D4' : null;
}

/** D2, D3 or D4 for one field difference, or null. */
export function switchOverIdFor(d: Difference, world: IntendedWorld): string | null {
  if (d.kind !== 'field') return null;
  const { route, who } = splitKey(d.key);
  return d2IdFor(d, world, route, who) ?? d3IdFor(d, world, route) ?? d4IdFor(d, world, route, who);
}

/**
 * Against a PRE-SWITCH build's answers (a shadow-mode build, which
 * already carried D1, D5, D6 and D7): only D2, D3 and D4 may differ, and
 * D8, D9 and D10, which came after that build (migration 0013; the
 * removed report routes), the complaint title's D7 (`title` only)
 * and D11 (migration 0014), and D12 and D13 with the root cause's D7
 * (7 Oct 2026; migration 0015). Anything
 * else, including a difference that would be D1 or D7 against the old
 * baseline, is unmatched.
 */
export function matchSwitchOnly(diffs: readonly Difference[], world: IntendedWorld): Matched {
  const unmatched: Difference[] = [];
  const matched: Record<string, number> = {};
  for (const d of diffs) {
    const id =
      switchOverIdFor(d, world) ??
      approvalsIdFor(d, world) ??
      removedRouteIdFor(d) ??
      titleOnlyIdFor(d) ??
      optionalFieldsIdFor(d, world) ??
      languageIdFor(d, world) ??
      rootCauseIdFor(d, world);
    if (id) matched[id] = (matched[id] ?? 0) + 1;
    else unmatched.push(d);
  }
  return { unmatched, matched };
}

/**
 * Plan 6.3.2: every listed entry appears. D2, D3 and D4 must each match
 * at least one difference when their population is not empty, and every
 * person D2 names must show at least one. One line per miss.
 *   d2People   D2's people (case labels) who can sign in;
 *   d3Expected someone who can sign in holds no master's manage key;
 *   d4Expected someone who can sign in has no module rows.
 */
export function missingSwitchOver(
  diffs: readonly Difference[],
  world: IntendedWorld,
  expect: { d2People: readonly string[]; d3Expected: boolean; d4Expected: boolean },
): string[] {
  const seen: Record<string, number> = {};
  const d2Seen = new Set<string>();
  for (const d of diffs) {
    const id = switchOverIdFor(d, world);
    if (!id) continue;
    seen[id] = (seen[id] ?? 0) + 1;
    if (id === 'D2') d2Seen.add(personOf(splitKey(d.key).who));
  }
  const out: string[] = [];
  if (expect.d2People.length && !seen.D2) out.push('expected intended difference D2 never appeared');
  if (expect.d3Expected && !seen.D3) out.push('expected intended difference D3 never appeared');
  if (expect.d4Expected && !seen.D4) out.push('expected intended difference D4 never appeared');
  for (const p of expect.d2People) {
    if (!d2Seen.has(p)) out.push(`D2 lists ${p} (mapping report), but they gained nothing`);
  }
  return out;
}

/**
 * Route template -> the module of its declaration, from the harness's
 * discovered routes (support/app.ts `declaredModule`).
 */
export function moduleLookup(
  routes: ReadonlyArray<{ method: string; path: string; declaredModule: string | null }>,
): SwitchWorld['moduleOf'] {
  const byRoute = new Map(routes.map((r) => [`${r.method} ${r.path}`, r.declaredModule]));
  return (route) => byRoute.get(route) ?? null;
}
