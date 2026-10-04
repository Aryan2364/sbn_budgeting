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
 * new-system routes (permission.guard.ts NEW_SYSTEM_PREFIXES), so the
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
// Shadow disagreements (plan P2b-P9): the new route guard runs beside
// the old one and logs every request on which the two disagree
// (src/access/permission.guard.ts). With the decision 23 mapping
// applied (plan 6.3.1), every such line must be one of the intended
// differences below, matched by id and matcher, faithful to plan
// 6.3.3. Anything else is unplanned and fails the run.
// ---------------------------------------------------------------------

/** One `ACCESS-SHADOW` line, parsed. */
export interface ShadowLine {
  method: string;
  /** The concrete request path, ids filled in. */
  path: string;
  user: string;
  old: 'allow' | 'deny';
  next: 'allow' | 'deny';
  /** Present when the new guard denies: the key it wanted. */
  permission?: string;
  raw: string;
}

const SHADOW_RE = /^(\S+) (\S+) user=(\S+) old=(allow|deny) new=(allow|deny)(?: permission=(\S+))?$/;

export function parseShadowLine(line: string): ShadowLine | null {
  const m = SHADOW_RE.exec(line);
  if (!m) return null;
  return {
    method: m[1]!,
    path: m[2]!,
    user: m[3]!,
    old: m[4] as 'allow' | 'deny',
    next: m[5] as 'allow' | 'deny',
    permission: m[6],
    raw: line,
  };
}

/**
 * D3: the full master lists need `manage` from P9; everyone else uses
 * /pick/... Route template -> the manage key the new guard asks for.
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

export interface ShadowWorld {
  /**
   * The route template a concrete request hit ("GET /api/cost-heads/:id"),
   * and the module of the key its declaration names. Null if no route matches.
   */
  routeOf(method: string, path: string): { route: string; module: string | null } | null;
  /**
   * D2's people, from the mapping report (plan 5.4 items 2 and 3): each
   * platform admin Admin gives more than they had, and the modules they
   * gain ('budget', 'complaints').
   */
  adminGains: ReadonlyMap<string, ReadonlySet<string>>;
  /** D4's people: no user_module_access row today. */
  noModuleRows: ReadonlySet<string>;
}

/** The intended difference this shadow line is, or null when it is unplanned. */
export function shadowIdFor(l: ShadowLine, world: ShadowWorld): string | null {
  const hit = world.routeOf(l.method, l.path);
  if (!hit) return null;

  // D2: a platform admin maps to Admin and gains the modules they lacked:
  // old deny -> new allow, on those modules' routes, for those people only.
  if (l.old === 'deny' && l.next === 'allow') {
    const gains = world.adminGains.get(l.user);
    if (gains && hit.module && gains.has(hit.module)) return 'D2';
    return null;
  }

  // From here the new guard denies what the old one allowed.
  if (l.old !== 'allow' || l.next !== 'deny') return null;

  // D3: GETs of the full master lists by non-managers (the new guard asks for manage).
  const d3Key = D3_MASTER_READS[hit.route];
  if (d3Key && l.permission === d3Key) return 'D3';

  // D4: /users/picker for people with no module rows today.
  if (hit.route === D4_ROUTE && l.permission === D4_KEY && world.noModuleRows.has(l.user)) return 'D4';

  return null;
}

export interface ShadowMatch {
  unmatched: ShadowLine[];
  /** Intended id -> how many lines it explained. */
  matched: Record<string, number>;
  /** Intended id -> the people it touched. */
  people: Record<string, Set<string>>;
  /** Lines the parser did not understand (always unplanned). */
  unparsed: string[];
}

export function matchShadow(lines: readonly string[], world: ShadowWorld): ShadowMatch {
  const out: ShadowMatch = { unmatched: [], matched: {}, people: {}, unparsed: [] };
  for (const raw of lines) {
    const l = parseShadowLine(raw);
    if (!l) {
      out.unparsed.push(raw);
      continue;
    }
    const id = shadowIdFor(l, world);
    if (!id) {
      out.unmatched.push(l);
      continue;
    }
    out.matched[id] = (out.matched[id] ?? 0) + 1;
    (out.people[id] ??= new Set()).add(l.user);
  }
  return out;
}

/** The shadow ids this phase expects to see (plan 6.3.2: every listed entry appears). */
export const EXPECTED_SHADOW_IDS = ['D2', 'D3', 'D4'] as const;

/** Route template matching for ShadowWorld.routeOf. A static segment beats a parameter. */
export function routeMatcher(
  routes: ReadonlyArray<{ method: string; path: string; declaredModule: string | null }>,
): ShadowWorld['routeOf'] {
  const compiled = routes.map((r) => ({
    ...r,
    params: (r.path.match(/:/g) ?? []).length,
    re: new RegExp(`^${r.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]+/g, '[^/]+')}$`),
  }));
  return (method, path) => {
    const hits = compiled.filter((r) => r.method === method && r.re.test(path)).sort((a, b) => a.params - b.params);
    const best = hits[0];
    return best ? { route: `${best.method} ${best.path}`, module: best.declaredModule } : null;
  };
}
