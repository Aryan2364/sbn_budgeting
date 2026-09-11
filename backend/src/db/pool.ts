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
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
