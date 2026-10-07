import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * The complaint title (owner decision, 6 Oct 2026; migration 0014),
 * through the REAL routes on the P0 fixtures:
 *   - 0014 gives every existing complaint a title from its description
 *     (first non-blank line, trimmed, at most 120 characters) and makes
 *     description, complainant name and phone optional;
 *   - raising needs a title (1-120 characters, trimmed), a site and a
 *     category; description, complainant name and phone are optional,
 *     blank is stored as null, and a phone that IS given must still be a
 *     full 10-digit number;
 *   - list rows and the detail carry `title`, and list search finds it.
 */

const LONG = 'x'.repeat(130);

describe('complaint title and optional fields (migration 0014)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;
  let F: typeof import('../equivalence/fixtures');
  let NAMES: Record<string, string>;

  async function send(user: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const id = F.U[user as keyof typeof F.U];
    const headers: Record<string, string> = {
      authorization: `Bearer ${harness.mintToken({ id, name: NAMES[id]! })}`,
    };
    const form = body instanceof FormData;
    if (body !== undefined && !form) headers['content-type'] = 'application/json';
    const res = await fetch(`${harness.baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
    });
    const { testTxIdle } = await import('../support/test-tx');
    const text = await res.text();
    await testTxIdle();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  const raise = (fields: Record<string, unknown>) =>
    send('raiser', 'POST', '/complaints', { siteId: F.S.a, categoryId: F.CC.pd_approval, ...fields });

  before(async () => {
    // The fixtures at their own schema, then descriptions that test the
    // backfill, then 0014 and everything after it.
    db = await openScratchDatabase('title', { fixtures: true, stopAtFixtureSchema: true });
    F = await import('../equivalence/fixtures');
    await db.client.query(`update complaints set description = $2 where id = $1`, [
      F.K.open,
      '\n   First line of it   \nSecond line',
    ]);
    await db.client.query(`update complaints set description = $2 where id = $1`, [F.K.in_progress, LONG]);
    await db.client.query(`update complaints set description = '   ' where id = $1`, [F.K.closed]);
    await db.migrate();
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });

    const { rows } = await db.client.query<{ id: string; name: string }>('select id, name from users');
    NAMES = Object.fromEntries(rows.map((r) => [r.id, r.name]));

    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    const { startHarnessApp } = await import('../support/app');
    harness = await startHarnessApp({ queryGuard: 'throw' });
  });

  after(async () => {
    await harness?.close();
    await db?.close();
  });

  it('0014 backfills every title from the description, and loosens the three columns', async () => {
    const { rows } = await db.client.query<{ id: string; title: string; description: string | null }>(
      `select id, title, description from complaints order by number`,
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    assert.equal(byId.get(F.K.open)!.title, 'First line of it');
    assert.equal(byId.get(F.K.open)!.description, '\n   First line of it   \nSecond line', 'description is kept');
    assert.equal(byId.get(F.K.in_progress)!.title, 'x'.repeat(120));
    // No text at all: the reference stands in, and the blank becomes "none".
    assert.equal(byId.get(F.K.closed)!.title, 'Complaint C-000004');
    assert.equal(byId.get(F.K.closed)!.description, null);
    assert.equal(byId.get(F.K.open_no_approval)!.title, 'Harness complaint 5');
    for (const r of rows) assert.ok(r.title.trim() && r.title.length <= 120, r.id);

    const { rows: cols } = await db.client.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_name = 'complaints'
         and column_name in ('title', 'description', 'complainant_name', 'complainant_phone')
       order by column_name`,
    );
    assert.deepEqual(
      Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable])),
      { complainant_name: 'YES', complainant_phone: 'YES', description: 'YES', title: 'NO' },
    );
    // The database refuses a blank title and a blank optional text, as the API never sends them.
    await assert.rejects(db.client.query(`update complaints set title = '  ' where id = $1`, [F.K.open]));
    await assert.rejects(db.client.query(`update complaints set description = '' where id = $1`, [F.K.open]));
  });

  it('title is required: missing, blank or over 120 characters is a 400 saying so', async () => {
    for (const title of [undefined, '', '    ']) {
      const res = await raise({ title, description: 'Pipe burst', complainantName: 'A', complainantPhone: '9825012345' });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      // "Enter a short title for the complaint" (Gujarati, owner, 7 Oct 2026)
      assert.ok(JSON.stringify(res.body).includes('ફરિયાદનો વિષય ટૂંકમાં લખો'), JSON.stringify(res.body));
    }
    const long = await raise({ title: 'y'.repeat(121) });
    assert.equal(long.status, 400, JSON.stringify(long.body));
    // Exactly 120, after trimming, is fine.
    const edge = await raise({ title: `  ${'y'.repeat(120)}  ` });
    assert.equal(edge.status, 201, JSON.stringify(edge.body));
    assert.equal(edge.body.title, 'y'.repeat(120));
  });

  it('site and category are still required', async () => {
    const noSite = await send('raiser', 'POST', '/complaints', { title: 'Pipe burst', categoryId: F.CC.pd_approval });
    assert.equal(noSite.status, 400);
    assert.ok(JSON.stringify(noSite.body).includes('ફરિયાદ કઈ સાઇટની છે તે યાદીમાંથી પસંદ કરો'));
    const noCategory = await send('raiser', 'POST', '/complaints', { title: 'Pipe burst', siteId: F.S.a });
    assert.equal(noCategory.status, 400);
    assert.ok(JSON.stringify(noCategory.body).includes('ફરિયાદનો પ્રકાર યાદીમાંથી પસંદ કરો'));
  });

  it('description, complainant name and phone are optional: left out or blank, they are null', async () => {
    const bare = await raise({ title: '  Water line broken  ' });
    assert.equal(bare.status, 201, JSON.stringify(bare.body));
    assert.equal(bare.body.title, 'Water line broken');
    assert.equal(bare.body.description, null);
    assert.equal(bare.body.complainantName, null);
    assert.equal(bare.body.complainantPhone, null);
    assert.equal(bare.body.locationNote, null);

    const blanks = await raise({ title: 'Blanks', description: '  ', complainantName: '', complainantPhone: ' ' });
    assert.equal(blanks.status, 201, JSON.stringify(blanks.body));
    assert.deepEqual(
      [blanks.body.description, blanks.body.complainantName, blanks.body.complainantPhone],
      [null, null, null],
    );

    // As the raise form sends it: multipart, with only the required fields.
    const form = new FormData();
    form.append('title', 'From the form');
    form.append('siteId', F.S.a);
    form.append('categoryId', F.CC.pd_approval);
    const multipart = await send('raiser', 'POST', '/complaints', form);
    assert.equal(multipart.status, 201, JSON.stringify(multipart.body));
    assert.equal(multipart.body.title, 'From the form');
    assert.equal(multipart.body.description, null);
  });

  it('a phone that is given must still be a full 10-digit number; given values are kept as typed (trimmed)', async () => {
    const short = await raise({ title: 'Short phone', complainantPhone: '12345' });
    assert.equal(short.status, 422, JSON.stringify(short.body));
    assert.ok(JSON.stringify(short.body).includes('10 આંકડા લખો'));

    const full = await raise({
      title: 'Full',
      description: '  The tap leaks  ',
      complainantName: ' Ramesh ',
      complainantPhone: ' 98250 12345 ',
    });
    assert.equal(full.status, 201, JSON.stringify(full.body));
    assert.deepEqual(
      [full.body.description, full.body.complainantName, full.body.complainantPhone],
      ['The tap leaks', 'Ramesh', '98250 12345'],
    );
  });

  it('list rows and the detail carry the title, and search finds it with no "matched in" note', async () => {
    const detail = await send('complaints_admin', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.title, 'First line of it');

    const closed = await send('complaints_admin', 'GET', `/complaints/${F.K.closed}`);
    assert.equal(closed.body.description, null);

    const list = await send('complaints_admin', 'GET', '/complaints?tab=all&search=first%20line%20of');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const rows = list.body.data as Array<{ id: string; title: string; matchedField: string | null }>;
    assert.deepEqual(rows.map((r) => r.id), [F.K.open]);
    assert.equal(rows[0]!.title, 'First line of it');
    assert.equal(rows[0]!.matchedField, null);

    const all = await send('complaints_admin', 'GET', '/complaints?tab=all&pageSize=100');
    for (const r of all.body.data as Array<{ title: unknown }>) assert.equal(typeof r.title, 'string');
  });
});
