import { Pool, types } from 'pg';

/**
 * MONEY IS bigint PAISE, END TO END.
 *
 * node-postgres hands `bigint` (OID 20) back as a **string** by default,
 * and that default is load-bearing here rather than an inconvenience to
 * work around. A paise amount can exceed Number.MAX_SAFE_INTEGER long
 * before the money does — 1,71,60,000 rupees is 1,716,000,000 paise, and
 * a portfolio of those adds up — and the moment one becomes a JS
 * `number` it is silently approximate.
 *
 * So: the parser below is set EXPLICITLY, not left to the default, so
 * that nobody can turn it off from a config file without reading this.
 * Amounts travel as strings from Postgres, through the API, into JSON.
 * Nothing in this service adds two of them together. All budget and
 * variance arithmetic happens in SQL (see migrations/0002_variance.sql).
 */
const PG_INT8 = 20;
const PG_NUMERIC = 1700;

types.setTypeParser(PG_INT8, (value: string) => value);
types.setTypeParser(PG_NUMERIC, (value: string) => value);

/**
 * `date` (OID 1082) is handed back as a JS Date by default, which then
 * gets stamped with the server's timezone and can slip a day on the way
 * to JSON. A plantation start date and an expense date are calendar
 * days, not instants, so they stay as the `YYYY-MM-DD` text Postgres
 * produced.
 */
const PG_DATE = 1082;
types.setTypeParser(PG_DATE, (value: string) => value);

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env and fill it in.',
      );
    }
    /**
     * Every one of these bounds an unbounded wait. node-postgres ships
     * with `connectionTimeoutMillis` unset, `statement_timeout: false`
     * and `query_timeout: false`, so out of the box a request that
     * stalls while connecting never fails — it simply never returns.
     * The browser's fetch has no timeout either, so the screen waits
     * forever. That is what a "cold first request hangs, refresh works"
     * report looks like from the inside, and it is why the fix belongs
     * here and not only in the loading state that displays it.
     *
     * `keepAlive` is the one that addresses the cause rather than the
     * symptom. Idle TCP flows through a NAT or security group get
     * dropped silently after a few minutes; the pool keeps handing out
     * a socket it believes is open, and the first query after a quiet
     * period goes nowhere. Keepalive probes every 30s hold the flow
     * open, comfortably inside the usual 350s idle window and inside
     * this server's own tcp_keepalives_idle of 300s.
     */
    pool = new Pool({
      connectionString,
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      query_timeout: 15_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
