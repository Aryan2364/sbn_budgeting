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
// D1 and D6 on the complaint workflow (plan 6.2, 6.3.3; P5)
// ---------------------------------------------------------------------

/**
 * What the D1 and D6 matchers need beyond the differing field itself.
 * Without it they match nothing.
 */
export interface IntendedWorld {
  /** The run's cases by key, for `legacyDigest` (matrix.ts, legacy-complaint-actions.ts). */
  runCases: Readonly<Record<string, { legacyDigest?: string }>>;
  /**
   * D6's complaints: every complaint whose approver raised or resolved
   * it, as "<user label>|<complaint id>" (the approver's case suffix)
   * -> its status.
   */
  selfApprovals: ReadonlyMap<string, string>;
  /**
   * The baseline's cases by key, for the switch-over matchers (D2, D3,
   * D4), which judge a whole case by its two statuses. Without it they
   * match nothing.
   */
  baselineCases?: Readonly<Record<string, { status: unknown }>>;
  /** The switch-over's people and routes (D2, D4). Without it D2 and D4 match nothing. */
  switchOver?: SwitchWorld;
}

export const D6_ACTION_ROUTES: readonly string[] = [
  'POST /api/complaints/:id/approve',
  'POST /api/complaints/:id/send-back',
];
export const COMPLAINT_DETAIL_ROUTE = 'GET /api/complaints/:id';
/** The `actions` entries D6 may turn from allowed to refused; every other entry must be unchanged. */
const D6_ACTIONS = ['approve', 'sendBack'];

/** "POST /api/x/:id [variant] |user|target" -> the route and "user|target". */
function splitKey(key: string): { route: string; who: string } {
  const at = key.indexOf(' |');
  const head = at < 0 ? key : key.slice(0, at);
  const [method, path] = head.split(' ');
  return { route: `${method} ${path}`, who: at < 0 ? '' : key.slice(at + 2) };
}

/**
 * D6: the approver may not approve or send back a complaint they raised
 * (O10 Q11) or resolved (DECISIONS 19): 409 where today is 200, and the
 * detail's `actions` say so. Only on D6's complaints, only for their
 * approver, and only approve and send back.
 */
function d6IdFor(d: Difference, world: IntendedWorld): string | null {
  const { route, who } = splitKey(d.key);
  if (!world.selfApprovals.has(who)) return null;
  if (d.field === 'status' && D6_ACTION_ROUTES.includes(route)) {
    return d.baseline === 200 && d.run === 409 ? 'D6' : null;
  }
  if (d.field === 'actions' && route === COMPLAINT_DETAIL_ROUTE) {
    const a = d.baseline as Record<string, boolean> | undefined;
    const b = d.run as Record<string, boolean> | undefined;
    if (!a || !b || !same(Object.keys(a).sort(), Object.keys(b).sort())) return null;
    let changed = false;
    for (const k of Object.keys(a)) {
      if (a[k] === b[k]) continue;
      if (!D6_ACTIONS.includes(k) || a[k] !== true || b[k] !== false) return null;
      changed = true;
    }
    return changed ? 'D6' : null;
  }
  return null;
}

/**
 * A complaint detail whose body differs from the baseline ONLY in its
 * `actions` map: with `actions` as the baseline build would have
 * computed it, the digest is the baseline's exactly. The allowed flags
 * are compared on their own (the `actions` field, D6 only), so what is
 * left is refusal wording, which D1 says is not compared (reasons stop
 * naming a role, plan 6.2), and D6's own new sentence.
 */
function actionsOnlyIdFor(d: Difference, world: IntendedWorld): string | null {
  if (d.field !== 'digest') return null;
  const { route, who } = splitKey(d.key);
  if (route !== COMPLAINT_DETAIL_ROUTE) return null;
  const legacy = world.runCases[d.key]?.legacyDigest;
  if (!legacy || legacy !== d.baseline) return null;
  return world.selfApprovals.has(who) ? 'D6' : 'D1';
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

/** The id of the intended difference this one is, or null when it is unexplained. */
export function intendedIdFor(d: Difference, world?: IntendedWorld): string | null {
  if ((d.kind === 'route-only-in-run' || d.kind === 'case-only-in-run') && isNewSystemRoute(d.key)) return 'D7';
  if (d.kind === 'field' && world) {
    const id = switchOverIdFor(d, world);
    if (id) return id;
  }
  const d5 = d5IdFor(d);
  if (d5) return d5;
  if (d.kind === 'field' && world) {
    const id = d6IdFor(d, world) ?? actionsOnlyIdFor(d, world);
    if (id) return id;
  }
  if (d.kind !== 'field' || (d.field !== 'keys' && d.field !== 'itemKeys')) return null;
  const route = d.key.split(' |')[0] ?? '';
  const [method, path] = route.split(' ');
  if (method !== 'GET' || !path) return null;
  if (!Array.isArray(d.baseline) || !Array.isArray(d.run)) return null;
  const base = d.baseline as string[];
  // Rows or a detail gaining exactly `can` (the per-record answers).
  if (!base.includes(D7_RECORD_KEY) && same([...base, D7_RECORD_KEY].sort(), d.run)) return 'D7';
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

/**
 * D6's count (plan 6.3.2: a stated count must match): every complaint
 * waiting for approval whose approver raised or resolved it must show
 * the 200 -> 409 on BOTH approve and send back, for that approver.
 * Returns one line per one that does not.
 */
export function missingD6(diffs: readonly Difference[], world: IntendedWorld): string[] {
  const seen = new Set(
    diffs.filter((d) => d6IdFor(d, world) === 'D6' && d.field === 'status').map((d) => {
      const { route, who } = splitKey(d.key);
      return `${route} |${who}`;
    }),
  );
  const missing: string[] = [];
  for (const [who, status] of world.selfApprovals) {
    if (status !== 'awaiting_approval') continue;
    for (const route of D6_ACTION_ROUTES) {
      if (!seen.has(`${route} |${who}`)) missing.push(`D6 lists ${route} |${who}, but it did not change to 409`);
    }
  }
  return missing;
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
 * already carried D1, D5, D6 and D7): only D2, D3 and D4 may differ.
 * Anything else, including a difference that would be D1, D6 or D7
 * against the old baseline, is unmatched.
 */
export function matchSwitchOnly(diffs: readonly Difference[], world: IntendedWorld): Matched {
  const unmatched: Difference[] = [];
  const matched: Record<string, number> = {};
  for (const d of diffs) {
    const id = switchOverIdFor(d, world);
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
