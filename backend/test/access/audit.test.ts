import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SKIP_REASON, count, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * access_audit is append-only, enforced by the database (decision 20,
 * R9, plan 5.1.7 and self-check A11). The triggers are statement-level,
 * so even a statement that matches no row is refused.
 */
describe('access_audit is append-only', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;

  before(async () => {
    db = await openScratchDatabase('audit');
  });

  after(async () => {
    await db?.close();
  });

  it('accepts inserts, without foreign keys (any ids)', async () => {
    await db.client.query(
      `insert into access_audit (actor_id, actor_name, action, target_type, target_id, target_name, role_id, role_name)
       values (gen_random_uuid(), 'Somebody Deleted', 'user.role_added', 'user', gen_random_uuid(), 'Nobody', gen_random_uuid(), 'Gone')`,
    );
    assert.ok((await count(db.client, 'select count(*) from access_audit')) >= 1);
  });

  for (const sql of [
    'update access_audit set note = note where false',
    'delete from access_audit where false',
    `update access_audit set note = 'rewritten'`,
    'delete from access_audit',
    'truncate access_audit',
  ]) {
    it(`refuses: ${sql}`, async () => {
      await assert.rejects(db.client.query(sql), /access_audit is append-only/);
    });
  }

  it('the rows are still there', async () => {
    assert.ok((await count(db.client, 'select count(*) from access_audit')) >= 6);
    assert.equal(await count(db.client, `select count(*) from access_audit where note = 'rewritten'`), 0);
  });
});
