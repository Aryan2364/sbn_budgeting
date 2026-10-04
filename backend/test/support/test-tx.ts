import { AsyncLocalStorage } from 'node:async_hooks';

import type { Pool, PoolClient, QueryResult } from 'pg';

/**
 * Transaction-per-request, for tests only (plan §6.3.1, P0).
 *
 * Every HTTP request the harness sends runs inside ONE database
 * transaction on ONE connection, rolled back when the response ends. A
 * write case therefore runs for real (guards, pipes, the handler's own
 * record checks, constraints) and leaves nothing behind, so every case
 * sees the same starting data and the order of cases does not matter.
 *
 * How the app's own SQL is mapped onto that one transaction:
 *
 * - `pool.query(...)` (autocommit in production) runs inside its own
 *   SAVEPOINT. A failing statement is rolled back to it, so later
 *   statements in the same request still run, exactly as a failed
 *   autocommit statement leaves the next one unaffected.
 * - `pool.connect()` hands out a stand-in client on the same
 *   connection. Its `begin` / `commit` / `rollback` become `savepoint` /
 *   `release savepoint` / `rollback to savepoint`; `release()` does
 *   nothing. Inside that pseudo-transaction a failed statement aborts
 *   it, as a real one would.
 * - All statements of one request are serialised (a request may fire
 *   queries with Promise.all; one connection runs one at a time anyway,
 *   and the savepoint bracketing must not interleave).
 *
 * Nothing in src/ knows about this. The harness patches the pool
 * singleton's instance methods before the app handles a request.
 */

type QueryArgs = [text: string | { text: string; values?: unknown[] }, values?: unknown[]];

class RequestTx {
  private client: PoolClient | null = null;
  private opening: Promise<PoolClient> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private savepoints = 0;
  private finished = false;

  constructor(private readonly connect: () => Promise<PoolClient>) {}

  private async conn(): Promise<PoolClient> {
    if (this.client) return this.client;
    if (!this.opening) {
      this.opening = (async () => {
        const client = await this.connect();
        await client.query('begin');
        this.client = client;
        return client;
      })();
    }
    return this.opening;
  }

  /** Serialises `work` behind everything already queued for this request. */
  private run<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.finished) {
      return Promise.reject(new Error('test-tx: query after the request finished'));
    }
    const next = this.chain.then(async () => work(await this.conn()));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private nextSavepoint(prefix: string): string {
    this.savepoints += 1;
    return `${prefix}_${this.savepoints}`;
  }

  /** `pool.query`: one statement, bracketed by its own savepoint. */
  poolQuery(args: QueryArgs): Promise<QueryResult> {
    return this.run(async (client) => {
      const sp = this.nextSavepoint('harness_q');
      await client.query(`savepoint ${sp}`);
      try {
        const result = await (client.query as (...a: unknown[]) => Promise<QueryResult>)(...args);
        await client.query(`release savepoint ${sp}`);
        return result;
      } catch (error) {
        await client.query(`rollback to savepoint ${sp}`);
        await client.query(`release savepoint ${sp}`);
        throw error;
      }
    });
  }

  /** `pool.connect`: a stand-in client whose transaction is a savepoint. */
  standInClient(): PoolClient {
    const open: string[] = [];
    const query = (...args: QueryArgs): Promise<QueryResult> => {
      const text = typeof args[0] === 'string' ? args[0] : args[0].text;
      const verb = text.trim().replace(/;$/, '').toLowerCase();
      if (verb === 'begin' || verb === 'start transaction') {
        const sp = this.nextSavepoint('harness_tx');
        open.push(sp);
        return this.run((c) => c.query(`savepoint ${sp}`));
      }
      if (verb === 'commit' || verb === 'end') {
        const sp = open.pop();
        if (!sp) return Promise.reject(new Error('test-tx: commit without begin'));
        return this.run((c) => c.query(`release savepoint ${sp}`));
      }
      if (verb === 'rollback') {
        const sp = open.pop();
        if (!sp) return Promise.reject(new Error('test-tx: rollback without begin'));
        return this.run(async (c) => {
          await c.query(`rollback to savepoint ${sp}`);
          return c.query(`release savepoint ${sp}`);
        });
      }
      return this.run(
        (c) => (c.query as (...a: unknown[]) => Promise<QueryResult>)(...args),
      );
    };
    return { query, release: () => undefined } as unknown as PoolClient;
  }

  /** Rolls everything back and returns the connection. Idempotent. */
  async finish(): Promise<void> {
    if (this.finished) return;
    // Let anything already queued settle first.
    await this.chain;
    this.finished = true;
    const client = this.client ?? (this.opening ? await this.opening.catch(() => null) : null);
    if (!client) return;
    try {
      await client.query('rollback');
      client.release();
    } catch (error) {
      client.release(error instanceof Error ? error : true);
    }
  }
}

const storage = new AsyncLocalStorage<RequestTx>();
let open = 0;
let idleWaiters: Array<() => void> = [];
let installedOn: Pool | null = null;
let originalConnect: (() => Promise<PoolClient>) | null = null;

function settle(): void {
  open -= 1;
  if (open === 0) {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
  }
}

/**
 * Patches `pool` so that inside `runInRequestTx` every query goes to the
 * request's transaction. Outside one, the pool behaves normally.
 */
export function installTestTx(pool: Pool): void {
  if (installedOn === pool) return;
  if (installedOn) throw new Error('test-tx: already installed on another pool');
  installedOn = pool;

  const origQuery = pool.query.bind(pool) as (...a: unknown[]) => Promise<QueryResult>;
  const origConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  originalConnect = origConnect;

  (pool as unknown as { query: unknown }).query = (...args: QueryArgs) => {
    const tx = storage.getStore();
    if (!tx) return origQuery(...args);
    return tx.poolQuery(args);
  };
  (pool as unknown as { connect: unknown }).connect = (...args: unknown[]) => {
    const tx = storage.getStore();
    if (!tx) return (origConnect as (...a: unknown[]) => Promise<PoolClient>)(...args);
    return Promise.resolve(tx.standInClient());
  };
}

/**
 * Express-style middleware: the rest of the request runs inside a fresh
 * transaction, rolled back once the response has gone.
 */
export function testTxMiddleware() {
  return (
    _req: unknown,
    res: { once(event: 'close' | 'finish', fn: () => void): void },
    next: () => void,
  ): void => {
    if (!originalConnect) throw new Error('test-tx: installTestTx was not called');
    const tx = new RequestTx(originalConnect);
    open += 1;
    let done = false;
    const end = (): void => {
      if (done) return;
      done = true;
      tx.finish().finally(settle);
    };
    res.once('finish', end);
    res.once('close', end);
    storage.run(tx, next);
  };
}

/** Same thing for code outside HTTP (unit tests). */
export async function runInRequestTx<T>(work: () => Promise<T>): Promise<T> {
  if (!originalConnect) throw new Error('test-tx: installTestTx was not called');
  const tx = new RequestTx(originalConnect);
  open += 1;
  try {
    return await storage.run(tx, work);
  } finally {
    await tx.finish().finally(settle);
  }
}

/** Resolves once every request's transaction has been rolled back. */
export function testTxIdle(): Promise<void> {
  if (open === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}
