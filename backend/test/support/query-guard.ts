import type { Pool, PoolClient } from 'pg';

/**
 * The test-time query guard (access plan 6.1.4, R11.6, R11.12; backend
 * kit 5.4). The scope check is this guard plus self-check A3's grep;
 * there is no boot-time list registry.
 *
 * Every statement the app sends is inspected. A statement whose `from`,
 * `join` or `update` names a GUARDED table must carry `/*scope:` (from
 * scopeWhere) or `/*scope-exempt: <reason>*\/`, or it is a violation:
 *   - 'throw' mode: the query fails with the SQL, so the test fails;
 *   - 'record' mode: the statement runs and is recorded, for a report.
 *
 * It is deliberately crude: text, not a parser. A false alarm costs one
 * reviewed marker; a silent miss costs a data leak.
 *
 * Installed by src/db/pool.ts under NODE_ENV=test only: `enableQueryGuard`
 * registers a hook on a global that getPool() runs on the new pool.
 * `installQueryGuard` wraps a pool the test made itself.
 */

/** Every scopable table, plus users (R11.6): a list of people leaks contact details. */
export const GUARDED_TABLES = [
  'sites',
  'projects',
  'expenses',
  'site_budgets',
  'variance',
  'variance_cell',
  'complaints',
  'complaint_photos',
  'complaint_events',
  'users',
] as const;

const TOUCHES_GUARDED = new RegExp(
  `\\b(?:from|join|update)\\s+(?:only\\s+)?(?:"?[a-z_][a-z0-9_]*"?\\.)?"?(${GUARDED_TABLES.join('|')})"?(?![a-z0-9_.])`,
  'i',
);
const SCOPED = /\/\*scope:[a-z0-9_.]+\*\//;
const EXEMPT = /\/\*scope-exempt:\s*[A-Za-z][^*]*\*\//;

export type GuardMode = 'throw' | 'record';

export interface Violation {
  /** The guarded table the statement names. */
  table: string;
  sql: string;
}

/** Pure: the violation in one statement, or null. */
export function checkStatement(sql: string): Violation | null {
  const hit = TOUCHES_GUARDED.exec(sql);
  if (!hit) return null;
  if (SCOPED.test(sql) || EXEMPT.test(sql)) return null;
  return { table: hit[1]!.toLowerCase(), sql: sql.replace(/\s+/g, ' ').trim() };
}

export class QueryGuardError extends Error {
  constructor(readonly violation: Violation) {
    super(
      `Query guard: a statement reads "${violation.table}" without a scope marker. ` +
        `Use scopeWhere (or runListQuery with a scope), or add /*scope-exempt: <reason>*/.\n  ${violation.sql}`,
    );
    this.name = 'QueryGuardError';
  }
}

const recorded: Violation[] = [];

/** Violations recorded in 'record' mode, oldest first. */
export function queryGuardViolations(): readonly Violation[] {
  return recorded;
}

export function resetQueryGuard(): void {
  recorded.length = 0;
}

type AnyFn = (...args: unknown[]) => unknown;

function textOf(arg: unknown): string | null {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && typeof (arg as { text?: unknown }).text === 'string') {
    return (arg as { text: string }).text;
  }
  return null;
}

const wrapped = new WeakSet<object>();

function wrapQuery(target: { query: unknown }, mode: GuardMode): void {
  if (wrapped.has(target)) return;
  wrapped.add(target);
  const original = (target.query as AnyFn).bind(target);
  target.query = (...args: unknown[]) => {
    const text = textOf(args[0]);
    const violation = text ? checkStatement(text) : null;
    if (violation) {
      if (mode === 'record') {
        recorded.push(violation);
      } else {
        const error = new QueryGuardError(violation);
        const callback = args.find((a) => typeof a === 'function') as ((e: Error) => void) | undefined;
        if (callback) {
          process.nextTick(() => callback(error));
          return undefined;
        }
        return Promise.reject(error);
      }
    }
    return original(...args);
  };
}

/** Wraps `pool` and every client it hands out. Idempotent. */
export function installQueryGuard(pool: Pool, mode: GuardMode): void {
  if (wrapped.has(pool)) return;
  wrapped.add(pool);
  const connect = (pool.connect as AnyFn).bind(pool);
  (pool as unknown as { connect: AnyFn }).connect = (...args: unknown[]) => {
    const callback = args[0];
    if (typeof callback === 'function') {
      // pg-pool's own pool.query() connects this way.
      return connect((err: unknown, client: PoolClient | undefined, release: unknown) => {
        if (client) wrapQuery(client as unknown as { query: unknown }, mode);
        (callback as AnyFn)(err, client, release);
      });
    }
    return (connect() as Promise<PoolClient>).then((client) => {
      wrapQuery(client as unknown as { query: unknown }, mode);
      return client;
    });
  };
  // pool.query connects through this.connect, so its statements are
  // checked on the client; nothing is checked twice.
}

const TEST_POOL_HOOKS = Symbol.for('sadbhavna.testPoolHooks');

/**
 * Makes src/db/pool.ts install the guard on the app's pool when it is
 * created. Sets NODE_ENV=test, the flag pool.ts reads. Call before the
 * app first touches the database.
 */
export function enableQueryGuard(mode: GuardMode): void {
  process.env.NODE_ENV = 'test';
  const g = globalThis as Record<symbol, unknown>;
  const hooks = (g[TEST_POOL_HOOKS] as Array<(p: Pool) => void> | undefined) ?? [];
  hooks.push((p) => installQueryGuard(p, mode));
  g[TEST_POOL_HOOKS] = hooks;
}
