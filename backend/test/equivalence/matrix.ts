import { createHash } from 'node:crypto';

import type { Client } from 'pg';

import type { DiscoveredRoute, HarnessApp } from '../support/app';
import { testTxIdle } from '../support/test-tx';
import { ROUTES, World, resolveQueries, type BodyContext, type Person, type Variant } from './cases';
import { USER_LABEL } from './fixtures';
import { actionsDifferInWordsOnly, withoutAdditiveKeys, withoutComplaintAdditions, withoutRecordCan } from './intended';
import { LegacyUndo, UNDONE_ROUTES, type LegacyWorld, type Why } from './legacy-approvals';
import { legacyActions, type LegacyViewer } from './legacy-complaint-actions';
import { legacySitesBody } from './legacy-complaint-messages';
import { screenMatrix, type ScreenMatrix } from './legacy-screen-rules';
import { sampleFor, type Sample } from './sampling';

/**
 * Runs every person x every route x every sampled record, and records
 * what each one is allowed to do and see.
 *
 * What a case records (plan §6.3.1):
 *   - every case: the HTTP status;
 *   - successful reads, also: the sorted id set over ALL pages, `total`,
 *     `aggregates`, the response's key sets (so amounts present or absent
 *     show), complaint `actions` allowed flags, and a digest of the body
 *     with the volatile fields removed.
 * Refusal message text is NOT recorded (D1).
 */

export interface CaseResult {
  status: number | 'NO-CASE' | 'ERROR';
  /** Relation classes of the target record(s), for reading a report. */
  classes?: string[];
  ids?: string[];
  total?: number;
  aggregates?: Record<string, string>;
  keys?: string[];
  itemKeys?: string[];
  actions?: Record<string, boolean>;
  contentType?: string;
  bytes?: number;
  digest?: string;
  /**
   * Not compared itself; intended.ts uses it to prove a digest
   * difference lies only where an intended difference says:
   *   - a read D8 or D9 changes (legacy-approvals.ts UNDONE_ROUTES): the
   *     digest of this run's body with D8 and D9 undone (`legacyWhy`
   *     says which was needed);
   *   - otherwise a body with an `actions` map (the complaint detail):
   *     its digest with `actions` as the baseline build would have
   *     computed it (legacy-complaint-actions.ts), D1; or D12 when the run's
   *     map differs from that only in its words (Gujarati, 7 Oct 2026);
   *   - the site picker (GET /complaints/sites): its digest with each
   *     row's `reason` in the baseline's English words, D12.
   */
  legacyDigest?: string;
  legacyWhy?: Why | 'D1' | 'D12';
  error?: string;
}

export interface MatrixUser {
  id: string | null;
  label: string;
  modules: Record<string, string>;
  canLogin: boolean;
}

export interface MatrixRun {
  routes: string[];
  users: MatrixUser[];
  /** Person -> what today's screens show them (legacy-screen-rules.ts). */
  screens: Record<string, ScreenMatrix>;
  cases: Record<string, CaseResult>;
}

/** Fields whose value depends on the clock, not on access. */
const VOLATILE_KEYS = new Set(['ageDays']);

const ANONYMOUS: MatrixUser = { id: null, label: '(signed out)', modules: {}, canLogin: false };

export async function loadUsers(db: Client): Promise<Array<MatrixUser & { person: Person | null }>> {
  const { rows } = await db.query<{
    id: string; name: string; email: string | null; phone: string | null; can_login: boolean;
    modules: Record<string, string>;
  }>(
    `select u.id, u.name, u.email, u.phone, u.can_login,
            coalesce((select json_object_agg(m.module, m.role order by m.module)
                      from user_module_access m where m.user_id = u.id), '{}'::json) as modules
     from users u order by u.id`,
  );
  return [
    { ...ANONYMOUS, person: null },
    ...rows.map((r) => ({
      id: r.id,
      label: USER_LABEL[r.id] ?? r.id,
      modules: r.modules,
      canLogin: r.can_login,
      person: { id: r.id, name: r.name, email: r.email, phone: r.phone },
    })),
  ];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex').slice(0, 16);
}

function itemId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  for (const k of ['id', 'siteId', 'costHeadId', 'period', 'value']) {
    if (o[k] !== undefined && o[k] !== null) return `${k}:${String(o[k])}`;
  }
  return null;
}

function keysOf(value: unknown): string[] | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : undefined;
}

function unionItemKeys(items: unknown[]): string[] {
  const set = new Set<string>();
  for (const item of items) for (const k of keysOf(item) ?? []) set.add(k);
  return [...set].sort();
}

/** The array of rows in a read response, wherever the endpoint puts it. */
function rowsOf(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const k of ['data', 'rows', 'items']) if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  return null;
}

interface Built {
  method: string;
  path: string;
  query: Record<string, string>;
  json?: unknown;
  form?: FormData;
}

async function send(
  harness: HarnessApp,
  token: string | null,
  req: Built,
): Promise<{ status: number; contentType: string; body: unknown; bytes: number }> {
  const url = new URL(harness.baseUrl + req.path);
  for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body: string | FormData | undefined;
  if (req.form) body = req.form;
  else if (req.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(req.json);
  }
  const res = await fetch(url, { method: req.method, headers, body });
  const contentType = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  // The transaction is rolled back after the response; wait for it so the
  // next case starts from the fixture state, with no locks held.
  await testTxIdle();
  let parsed: unknown = null;
  if (contentType.includes('json') && buf.length > 0) {
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch {
      parsed = null;
    }
  }
  return { status: res.status, contentType, body: parsed, bytes: buf.length };
}

/** Undoes D8 and D9 on one case's body, when the run has the world before 0013. */
type UndoFor = ((value: unknown) => Promise<{ value: unknown; why: Why } | null>) | null;

async function runCase(
  harness: HarnessApp,
  token: string | null,
  method: string,
  path: string,
  variant: Variant,
  ctx: BodyContext,
  legacyViewer: LegacyViewer | null,
  undo: UndoFor,
): Promise<CaseResult> {
  const query = { ...(variant.query ?? {}) };
  const built: Built = { method, path, query };
  if (variant.json) built.json = await variant.json(ctx);
  if (variant.multipart) {
    const mp = await variant.multipart(ctx);
    const form = new FormData();
    for (const [k, v] of Object.entries(mp.fields)) form.append(k, v);
    for (const f of mp.files) form.append(f.field, new Blob([f.data], { type: f.type }), f.filename);
    built.form = form;
  }

  if (method !== 'GET') {
    const res = await send(harness, token, built);
    return { status: res.status };
  }

  if (!variant.list) {
    const res = await send(harness, token, built);
    if (res.status < 200 || res.status >= 300) return { status: res.status };
    if (!res.contentType.includes('json')) {
      return { status: res.status, contentType: res.contentType.split(';')[0], bytes: res.bytes };
    }
    // D7 (intended.ts): keys a route gains, every record's `can`, and a
    // complaint's `title` are left out of the digest, so the rest must match.
    const out: CaseResult = {
      status: res.status,
      keys: keysOf(res.body),
      digest: digest(withoutComplaintAdditions(path, withoutRecordCan(withoutAdditiveKeys(path, res.body)))),
    };
    const rows = rowsOf(res.body);
    if (rows) {
      out.ids = rows.map(itemId).filter((x): x is string => x !== null).sort();
      out.itemKeys = unionItemKeys(rows);
    }
    const actions = (res.body as { actions?: Record<string, { allowed: boolean }> } | null)?.actions;
    if (actions && typeof actions === 'object') {
      out.actions = Object.fromEntries(
        Object.keys(actions).sort().map((k) => [k, Boolean(actions[k]?.allowed)]),
      );
    }
    const undone = undo ? await undo(res.body) : null;
    if (undone) {
      out.legacyDigest = digest(withoutComplaintAdditions(path, withoutRecordCan(withoutAdditiveKeys(path, undone.value))));
      out.legacyWhy = undone.why;
    } else if (out.actions && legacyViewer) {
      const body = res.body as Parameters<typeof legacyActions>[1] & Record<string, unknown>;
      const legacy = legacyActions(legacyViewer, body);
      out.legacyDigest = digest(
        withoutComplaintAdditions(
          path,
          withoutRecordCan(withoutAdditiveKeys(path, { ...body, actions: legacy })),
        ),
      );
      const runActions = body.actions as Parameters<typeof actionsDifferInWordsOnly>[0];
      out.legacyWhy = actionsDifferInWordsOnly(runActions, legacy) ? 'D12' : 'D1';
    } else if (path === '/api/complaints/sites') {
      // D12: the picker's `reason` in the old English words.
      const old = legacySitesBody(res.body);
      if (old) {
        out.legacyDigest = digest(withoutComplaintAdditions(path, withoutRecordCan(withoutAdditiveKeys(path, old))));
        out.legacyWhy = 'D12';
      }
    }
    return out;
  }

  // A paginated list: every page, at the largest page size.
  const all: unknown[] = [];
  let first: Record<string, unknown> | null = null;
  for (let page = 1; page < 10_000; page += 1) {
    built.query = { ...query, page: String(page), pageSize: '100' };
    const res = await send(harness, token, built);
    if (res.status < 200 || res.status >= 300) return { status: res.status };
    const body = res.body as Record<string, unknown>;
    first ??= body;
    all.push(...(rowsOf(body) ?? []));
    const totalPages = typeof body.totalPages === 'number' ? body.totalPages : 1;
    if (page >= totalPages) break;
  }
  const ids = all.map(itemId).filter((x): x is string => x !== null).sort();
  const sortedRows = [...all].sort((a, b) => (itemId(a) ?? '').localeCompare(itemId(b) ?? ''));
  const out: CaseResult = {
    status: 200,
    ids,
    keys: keysOf(first),
    itemKeys: unionItemKeys(all),
    // D7 (intended.ts): each row's `can` (and a complaint row's `title`)
    // is left out, so the rest must match.
    digest: digest(withoutComplaintAdditions(path, withoutRecordCan(sortedRows))),
  };
  if (first && typeof first.total === 'number') out.total = first.total;
  if (first && first.aggregates && typeof first.aggregates === 'object') {
    out.aggregates = first.aggregates as Record<string, string>;
  }
  const undone = undo ? await undo(sortedRows) : null;
  if (undone) {
    out.legacyDigest = digest(withoutComplaintAdditions(path, withoutRecordCan(undone.value)));
    out.legacyWhy = undone.why;
  }
  return out;
}

/** `GET /api/x/:id` + params -> `/api/x/<uuid>`. */
function fill(path: string, params: Record<string, string>): string {
  return path.replace(/:([A-Za-z]+)/g, (_m, name: string) => params[name] ?? `:${name}`);
}

export interface RunOptions {
  /** Only routes whose "METHOD /path" contains this text. */
  only?: string;
  /** Each person's sample (by id, '' signed out), drawn before migration 0013; else sampled now. */
  samples?: ReadonlyMap<string, Sample>;
  /** The complaint world before migration 0013, for the D8 and D9 reconstructions. */
  legacy?: LegacyWorld;
  onProgress?: (done: number, user: string) => void;
}

export async function runMatrix(
  harness: HarnessApp,
  routes: DiscoveredRoute[],
  db: Client,
  options: RunOptions = {},
): Promise<MatrixRun> {
  const world = new World(db);
  await resolveQueries(world);
  const undoer = options.legacy ? new LegacyUndo(options.legacy, db) : null;
  const undoable = new Set<string>(UNDONE_ROUTES);
  const users = await loadUsers(db);
  const routeKeys = routes.map((r) => `${r.method} ${r.path}`);
  const selected = routeKeys.filter((k) => !options.only || k.includes(options.only));
  const cases: Record<string, CaseResult> = {};

  let userIndex = 0;
  for (const user of users) {
    userIndex += 1;
    const sample: Sample = options.samples?.get(user.id ?? '') ?? (await sampleFor(db, user.id));
    const token = user.person ? harness.mintToken(user.person) : null;
    // Today's complaints level, for the frozen `actions` (legacy-complaint-actions.ts).
    const legacyViewer: LegacyViewer | null = user.id
      ? { id: user.id, complaintsAdmin: user.modules.complaints === 'admin' }
      : null;

    for (const routeKey of selected) {
      const [method, path] = routeKey.split(' ') as [string, string];
      const spec = ROUTES[routeKey];
      if (!spec) {
        cases[`${routeKey} |${user.label}`] = { status: 'NO-CASE' };
        continue;
      }
      // Each param's candidate records. `photo` expands to :id and :photoId.
      const targets: Array<{ params: Record<string, string>; label: string; classes: string[] }> = [];
      const paramEntries = Object.entries(spec.params ?? {});
      if (paramEntries.length === 0) {
        targets.push({ params: {}, label: '', classes: [] });
      } else {
        const [name, type] = paramEntries[0]!;
        for (const rec of sample[type]) {
          const params: Record<string, string> =
            type === 'photo'
              ? { id: rec.id.split('/')[0]!, photoId: rec.id.split('/')[1]! }
              : { [name]: rec.id };
          targets.push({ params, label: rec.id, classes: rec.classes });
        }
      }

      for (const variant of spec.variants) {
        const routeVariant = `${routeKey}${variant.name ? ` [${variant.name}]` : ''}`;
        const undo: UndoFor =
          undoer && legacyViewer && undoable.has(routeVariant)
            ? (value) => undoer.undo(routeVariant, legacyViewer, value)
            : null;
        for (const target of targets) {
          const key =
            `${routeKey}${variant.name ? ` [${variant.name}]` : ''} |${user.label}` +
            (target.label ? `|${target.label}` : '');
          try {
            const result = await runCase(harness, token, method, fill(path, target.params), variant, {
              world,
              user: user.person,
              params: target.params,
            }, legacyViewer, undo);
            if (target.classes.length > 0) result.classes = target.classes;
            cases[key] = result;
          } catch (error) {
            cases[key] = {
              status: 'ERROR',
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
      }
    }
    options.onProgress?.(userIndex, user.label);
  }

  const screens: Record<string, ScreenMatrix> = {};
  for (const u of users) {
    // A person who cannot sign in never reaches a screen: same as signed out.
    screens[u.label] = screenMatrix(u.id && u.canLogin ? u.modules : null);
  }

  return {
    routes: routeKeys,
    users: users.map(({ person: _p, ...u }) => u),
    screens,
    cases: Object.fromEntries(Object.entries(cases).sort(([a], [b]) => a.localeCompare(b))),
  };
}
