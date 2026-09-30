import { hash } from 'bcryptjs';
import type { PoolClient } from 'pg';

import { loadEnv } from './env';
import { closePool, getPool } from './pool';

loadEnv();

/**
 * DEV-ONLY FIXTURE for the complaints module. Never run against
 * production; it refuses when NODE_ENV=production.
 *
 * Creates the three locations and a complete routing chain (plan 3.4),
 * so every complaints screen can be exercised as every role:
 *
 *   CEO  <-  HOD  <-  Manager 1 (Vesu, Adajan)  <-  Supervisor Vesu, Supervisor Adajan
 *                 <-  Manager 2 (Pal)           <-  Supervisor Pal
 *
 * plus a Complaints Admin, a plain raiser, and a Test Admin who holds
 * every admin role (the seed admin's shape, with a known password).
 *
 * Everyone: password Test@1234, complaints access. Idempotent: people
 * are matched by phone and brought back to exactly this state, and the
 * three locations' supervisor/manager slots are owned by this fixture
 * (anyone else holding one is taken off it, or the one-each rule would
 * break).
 *
 *   DATABASE_URL=... node dist/db/seed-complaints-dev.js
 */

const PASSWORD = 'Test@1234';
const LOCATIONS = ['Vesu', 'Adajan', 'Pal'] as const;
type Loc = (typeof LOCATIONS)[number];

interface Person {
  key: string;
  name: string;
  phone: string;
  email: string;
  designation: 'ceo' | 'hod' | 'manager' | 'supervisor' | null;
  reportsTo: string | null;
  locations: Loc[];
  modules: Record<string, string>;
}

const PEOPLE: Person[] = [
  { key: 'ceo', name: 'Kavita Desai', phone: '9000000001', email: 'ceo@sadbhavna.test',
    designation: 'ceo', reportsTo: null, locations: [],
    modules: { complaints: 'admin' } },
  { key: 'hod', name: 'Harish Joshi', phone: '9000000002', email: 'hod@sadbhavna.test',
    designation: 'hod', reportsTo: 'ceo', locations: [],
    modules: { complaints: 'member' } },
  { key: 'manager1', name: 'Meena Shah', phone: '9000000003', email: 'manager1@sadbhavna.test',
    designation: 'manager', reportsTo: 'hod', locations: ['Vesu', 'Adajan'],
    modules: { complaints: 'member' } },
  { key: 'manager2', name: 'Rakesh Trivedi', phone: '9000000004', email: 'manager2@sadbhavna.test',
    designation: 'manager', reportsTo: 'hod', locations: ['Pal'],
    modules: { complaints: 'member' } },
  { key: 'supVesu', name: 'Suresh Parmar', phone: '9000000005', email: 'sup.vesu@sadbhavna.test',
    designation: 'supervisor', reportsTo: 'manager1', locations: ['Vesu'],
    modules: { complaints: 'member' } },
  { key: 'supAdajan', name: 'Anil Solanki', phone: '9000000006', email: 'sup.adajan@sadbhavna.test',
    designation: 'supervisor', reportsTo: 'manager1', locations: ['Adajan'],
    modules: { complaints: 'member' } },
  { key: 'supPal', name: 'Dinesh Rathod', phone: '9000000007', email: 'sup.pal@sadbhavna.test',
    designation: 'supervisor', reportsTo: 'manager2', locations: ['Pal'],
    modules: { complaints: 'member' } },
  { key: 'cadmin', name: 'Complaints Admin', phone: '9000000008',
    email: 'complaints.admin@sadbhavna.test',
    designation: null, reportsTo: null, locations: [],
    modules: { complaints: 'admin' } },
  { key: 'raiser', name: 'Farhan Raiser', phone: '9000000009', email: 'raiser@sadbhavna.test',
    designation: null, reportsTo: null, locations: [],
    modules: { complaints: 'member' } },
  { key: 'admin', name: 'Test Admin', phone: '9000000010', email: 'admin@sadbhavna.test',
    designation: null, reportsTo: null, locations: [],
    modules: { platform: 'admin', budget: 'admin', complaints: 'admin' } },
];

async function upsertLocation(client: PoolClient, name: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into locations (name) values ($1)
     on conflict (name) do update set is_active = true
     returning id`,
    [name],
  );
  return rows[0]!.id;
}

async function seedComplaintsDev(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-complaints-dev is a development fixture. Refusing to run in production.');
  }
  const pool = getPool();
  const client = await pool.connect();
  const passwordHash = await hash(PASSWORD, 12);

  try {
    const db = await client.query<{ db: string }>('select current_database() as db');
    // eslint-disable-next-line no-console
    console.log(`seed-complaints-dev: writing to database ${db.rows[0]?.db}`);

    await client.query('begin');

    const locationIds = new Map<Loc, string>();
    for (const name of LOCATIONS) locationIds.set(name, await upsertLocation(client, name));

    const { rows: designations } = await client.query<{ id: string; seed_key: string }>(
      'select id, seed_key from designations where seed_key is not null',
    );
    const designationId = new Map(designations.map((d) => [d.seed_key, d.id]));

    // Pass 1: the people, without reports_to (a manager may not exist yet).
    const ids = new Map<string, string>();
    for (const p of PEOPLE) {
      const designation = p.designation ? designationId.get(p.designation) : null;
      if (p.designation && !designation) {
        throw new Error(`Designation ${p.designation} is missing. Run the migrations first.`);
      }
      const existing = await client.query<{ id: string }>(
        `select id from users
         where right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
            or lower(email) = lower($2)
         order by (right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1) desc
         limit 1`,
        [p.phone, p.email],
      );
      let id = existing.rows[0]?.id;
      if (id) {
        await client.query(
          `update users set name = $2, phone = $3, email = $4, designation_id = $5,
                  reports_to = null, password_hash = $6, can_login = true
           where id = $1`,
          [id, p.name, p.phone, p.email, designation, passwordHash],
        );
      } else {
        const { rows } = await client.query<{ id: string }>(
          `insert into users (name, phone, email, designation_id, password_hash, can_login)
           values ($1, $2, $3, $4, $5, true) returning id`,
          [p.name, p.phone, p.email, designation, passwordHash],
        );
        id = rows[0]!.id;
      }
      ids.set(p.key, id);

      for (const [module, role] of Object.entries(p.modules)) {
        await client.query(
          `insert into user_module_access (user_id, module, role) values ($1, $2, $3)
           on conflict (user_id, module) do update set role = excluded.role`,
          [id, module, role],
        );
      }
    }

    // Pass 2: the chain.
    for (const p of PEOPLE) {
      await client.query('update users set reports_to = $2 where id = $1', [
        ids.get(p.key),
        p.reportsTo ? ids.get(p.reportsTo) : null,
      ]);
    }

    // Pass 3: locations. The fixture owns the three places' supervisor
    // and manager slots, so anyone else holding one is taken off it.
    const fixtureIds = [...ids.values()];
    const allLocationIds = [...locationIds.values()];
    await client.query(
      `delete from user_locations ul
       using users u, designations d
       where ul.location_id = any($1::uuid[]) and u.id = ul.user_id
         and d.id = u.designation_id and d.seed_key in ('supervisor', 'manager')
         and not (ul.user_id = any($2::uuid[]))`,
      [allLocationIds, fixtureIds],
    );
    await client.query('delete from user_locations where user_id = any($1::uuid[])', [
      fixtureIds,
    ]);
    for (const p of PEOPLE) {
      for (const loc of p.locations) {
        await client.query(
          'insert into user_locations (user_id, location_id) values ($1, $2)',
          [ids.get(p.key), locationIds.get(loc)],
        );
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  // eslint-disable-next-line no-console
  console.table(
    PEOPLE.map((p) => ({
      name: p.name,
      phone: p.phone,
      email: p.email,
      designation: p.designation ?? '-',
      locations: p.locations.join(', ') || '-',
      modules: Object.entries(p.modules).map(([m, r]) => `${m}:${r}`).join(' '),
    })),
  );
  // eslint-disable-next-line no-console
  console.log(`seed-complaints-dev: ${PEOPLE.length} people, password ${PASSWORD}`);
}

if (require.main === module) {
  seedComplaintsDev()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
