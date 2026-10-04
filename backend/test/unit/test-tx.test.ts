import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Pool } from 'pg';

import { prepareTestEnv } from '../support/test-env';
import { recreateTestDatabase } from '../support/test-db';
import { installTestTx, runInRequestTx } from '../support/test-tx';

/**
 * The transaction-per-request wrapper is what makes the baseline's
 * write cases safe and order-independent, so its semantics are pinned
 * here: everything is rolled back, a failed autocommit statement does
 * not poison the rest of the request, and an app transaction inside the
 * request behaves like a real one (savepoints).
 */

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe('test-tx (transaction per request)', { skip: enabled ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let pool: Pool;
  const count = async (): Promise<number> => {
    const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from harness_tx_probe');
    return rows[0]!.n;
  };

  before(async () => {
    prepareTestEnv();
    await recreateTestDatabase({ drop: false });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPool } = require('../../src/db/pool') as typeof import('../../src/db/pool');
    pool = getPool();
    installTestTx(pool);
    await pool.query('drop table if exists harness_tx_probe');
    await pool.query('create table harness_tx_probe (v text not null unique)');
  });

  after(async () => {
    await pool.query('drop table if exists harness_tx_probe');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await (require('../../src/db/pool') as typeof import('../../src/db/pool')).closePool();
  });

  it('rolls back every write made during the request', async () => {
    await runInRequestTx(async () => {
      await pool.query(`insert into harness_tx_probe values ('a')`);
      assert.equal(await count(), 1);
    });
    assert.equal(await count(), 0);
  });

  it('a failed pool.query does not abort the rest of the request', async () => {
    await runInRequestTx(async () => {
      await pool.query(`insert into harness_tx_probe values ('a')`);
      await assert.rejects(pool.query(`insert into harness_tx_probe values ('a')`), /duplicate key/);
      await pool.query(`insert into harness_tx_probe values ('b')`);
      assert.equal(await count(), 2);
    });
    assert.equal(await count(), 0);
  });

  it("an app transaction's rollback undoes only its own work", async () => {
    await runInRequestTx(async () => {
      await pool.query(`insert into harness_tx_probe values ('outside')`);
      const client = await pool.connect();
      await client.query('begin');
      await client.query(`insert into harness_tx_probe values ('inside')`);
      await assert.rejects(client.query(`insert into harness_tx_probe values ('inside')`));
      await client.query('rollback');
      client.release();
      const { rows } = await pool.query<{ v: string }>('select v from harness_tx_probe order by v');
      assert.deepEqual(rows.map((r) => r.v), ['outside']);
    });
    assert.equal(await count(), 0);
  });

  it("an app transaction's commit is visible to the request, then rolled back", async () => {
    await runInRequestTx(async () => {
      const client = await pool.connect();
      await client.query('begin');
      await client.query(`insert into harness_tx_probe values ('c')`);
      await client.query('commit');
      client.release();
      assert.equal(await count(), 1);
    });
    assert.equal(await count(), 0);
  });

  it('serialises concurrent queries from one request', async () => {
    await runInRequestTx(async () => {
      await Promise.all(
        ['p', 'q', 'r', 's'].map((v) => pool.query(`insert into harness_tx_probe values ($1)`, [v])),
      );
      assert.equal(await count(), 4);
    });
    assert.equal(await count(), 0);
  });

  it('leaves the pool untouched outside a request', async () => {
    await pool.query(`insert into harness_tx_probe values ('kept')`);
    assert.equal(await count(), 1);
    await pool.query('delete from harness_tx_probe');
  });
});
