import { hash } from 'bcryptjs';
import type { PoolClient } from 'pg';

import { loadEnv } from './env';
import { closePool, getPool } from './pool';

loadEnv();

/**
 * DEV-ONLY FIXTURE for the complaints module. Never run against
 * production; it refuses when NODE_ENV=production.
 *
 * Creates three locations, one test site in each, and a complete
 * routing chain (plan 3.4), so every complaints screen can be exercised
 * as every role:
 *
 *   CEO  <-  HOD  <-  Manager 1 (sites at Vesu, Adajan)  <-  Supervisor Vesu, Supervisor Adajan
 *                 <-  Manager 2 (site at Pal)            <-  Supervisor Pal
 *
 * plus a Complaints Admin, a plain raiser, and a Test Admin who holds
 * every admin role (the seed admin's shape, with a known password).
 *
 * Complaints route by the budget SITE (CONTRACT section 10): each test
 * site names its supervisor and manager (sites.supervisor_id /
 * manager_id). People have no locations (removed 1 Oct 2026).
 *
 * Everyone: password Test@1234, complaints access. Idempotent: people
 * are matched by phone, sites by name, and both are brought back to
 * exactly this state.
 *
 *   DATABASE_URL=... node dist/db/seed-complaints-dev.js
 */

const PASSWORD = 'Test@1234';
const LOCATIONS = ['Vesu', 'Adajan', 'Pal'] as const;
type Loc = (typeof LOCATIONS)[number];

/** One test site per location, with who it routes to (Person.key). */
const SITES: { name: string; location: Loc; supervisor: string; manager: string }[] = [
  { name: 'Complaints Test Site Vesu', location: 'Vesu', supervisor: 'supVesu', manager: 'manager1' },
  { name: 'Complaints Test Site Adajan', location: 'Adajan', supervisor: 'supAdajan', manager: 'manager1' },
  { name: 'Complaints Test Site Pal', location: 'Pal', supervisor: 'supPal', manager: 'manager2' },
];

interface Person {
  key: string;
  name: string;
  phone: string;
  email: string;
  designation: 'ceo' | 'hod' | 'manager' | 'supervisor' | null;
  reportsTo: string | null;
  modules: Record<string, string>;
}

const PEOPLE: Person[] = [
  { key: 'ceo', name: 'Kavita Desai', phone: '9000000001', email: 'ceo@sadbhavna.test',
    designation: 'ceo', reportsTo: null,
    modules: { complaints: 'admin' } },
  { key: 'hod', name: 'Harish Joshi', phone: '9000000002', email: 'hod@sadbhavna.test',
    designation: 'hod', reportsTo: 'ceo',
    modules: { complaints: 'member' } },
  { key: 'manager1', name: 'Meena Shah', phone: '9000000003', email: 'manager1@sadbhavna.test',
    designation: 'manager', reportsTo: 'hod',
    modules: { complaints: 'member' } },
  { key: 'manager2', name: 'Rakesh Trivedi', phone: '9000000004', email: 'manager2@sadbhavna.test',
    designation: 'manager', reportsTo: 'hod',
    modules: { complaints: 'member' } },
  { key: 'supVesu', name: 'Suresh Parmar', phone: '9000000005', email: 'sup.vesu@sadbhavna.test',
    designation: 'supervisor', reportsTo: 'manager1',
    modules: { complaints: 'member' } },
  { key: 'supAdajan', name: 'Anil Solanki', phone: '9000000006', email: 'sup.adajan@sadbhavna.test',
    designation: 'supervisor', reportsTo: 'manager1',
    modules: { complaints: 'member' } },
  { key: 'supPal', name: 'Dinesh Rathod', phone: '9000000007', email: 'sup.pal@sadbhavna.test',
    designation: 'supervisor', reportsTo: 'manager2',
    modules: { complaints: 'member' } },
  { key: 'cadmin', name: 'Complaints Admin', phone: '9000000008',
    email: 'complaints.admin@sadbhavna.test',
    designation: null, reportsTo: null,
    modules: { complaints: 'admin' } },
  { key: 'raiser', name: 'Farhan Raiser', phone: '9000000009', email: 'raiser@sadbhavna.test',
    designation: null, reportsTo: null,
    modules: { complaints: 'member' } },
  { key: 'admin', name: 'Test Admin', phone: '9000000010', email: 'admin@sadbhavna.test',
    designation: null, reportsTo: null,
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

    // Pass 3: the test sites, which carry the routing.
    for (const site of SITES) {
      const values = [
        site.name, locationIds.get(site.location), ids.get(site.supervisor), ids.get(site.manager),
      ];
      const updated = await client.query(
        `update sites set location_id = $2, supervisor_id = $3, manager_id = $4
         where name = $1`,
        values,
      );
      if (!updated.rowCount) {
        await client.query(
          `insert into sites (name, location_id, supervisor_id, manager_id,
                              planned_trees, plantation_start_date)
           values ($1, $2, $3, $4, 1, current_date)`,
          values,
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
      modules: Object.entries(p.modules).map(([m, r]) => `${m}:${r}`).join(' '),
    })),
  );
  // eslint-disable-next-line no-console
  console.log(
    `seed-complaints-dev: ${PEOPLE.length} people, ${SITES.length} test sites ` +
      `(${SITES.map((s) => s.name).join(', ')}), password ${PASSWORD}`,
  );
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
