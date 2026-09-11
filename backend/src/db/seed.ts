import { hash } from 'bcryptjs';

import { COST_HEADS } from './cost-heads.data';
import { loadEnv } from './env';
import { closePool, getPool } from './pool';

loadEnv();

/**
 * The required seed: the 19 cost heads, in the sheet's order.
 *
 * Idempotent. Running it twice changes nothing, so it is safe on every
 * deploy. It updates `sort_order` for a head that is already there
 * rather than skipping it, because the order is data (see
 * cost-heads.data.ts) and a reordering must be able to land.
 *
 * The ON CONFLICT names the index predicate because the unique index
 * on seed_key is partial: a head an admin creates in Settings has no
 * seed identity and must not be forced to invent one.
 *
 * It matches on `seed_key`, not on `name`, and it never writes the
 * name after the first insert. An admin who corrects "Miscellenous" in
 * Settings keeps that correction through every later deploy — matching
 * on the name would instead re-insert the misspelling as a twentieth
 * head and quietly undo the fix.
 */
async function seedCostHeads(): Promise<void> {
  const pool = getPool();

  for (const [index, head] of COST_HEADS.entries()) {
    await pool.query(
      `insert into cost_heads (seed_key, name, sort_order)
       values ($1, $2, $3)
       on conflict (seed_key) where seed_key is not null
         do update set sort_order = excluded.sort_order`,
      [head.seedKey, head.name, index + 1],
    );
  }

  const { rows } = await pool.query<{ count: string }>(
    'select count(*)::text as count from cost_heads',
  );
  // eslint-disable-next-line no-console
  console.log(`cost heads: ${COST_HEADS.length} seeded, ${rows[0]?.count} in table`);
}

/**
 * The first admin, so that there is something to log in as.
 *
 * Gated on environment variables and skipped when they are absent, so
 * no default account with a known password ever exists. This is the one
 * place a user is created without a user already existing.
 */
async function seedFirstAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator';

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log(
      'first admin: skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one)',
    );
    return;
  }

  const pool = getPool();
  const existing = await pool.query('select 1 from users where lower(email) = lower($1)', [
    email,
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    // eslint-disable-next-line no-console
    console.log(`first admin: ${email} already exists, left alone`);
    return;
  }

  const passwordHash = await hash(password, 12);
  await pool.query(
    `insert into users (name, email, role, password_hash, can_login)
     values ($1, $2, 'admin', $3, true)`,
    [name, email, passwordHash],
  );
  // eslint-disable-next-line no-console
  console.log(`first admin: created ${email}`);
}

export async function seed(): Promise<void> {
  await seedCostHeads();
  await seedFirstAdmin();
}

if (require.main === module) {
  seed()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
