import { UnprocessableEntityException } from '@nestjs/common';
import type { PoolClient } from 'pg';

/**
 * Routing, run ONCE at raise time (CONTRACT section 3, plan 3.4).
 *
 * The result is written onto the complaint row and never recomputed on
 * read: a later change to a location's supervisor must not silently move
 * an open complaint, and a closed one must still say who handled it.
 *
 * Written as one function over a `query` callback so it can be unit
 * tested against a fake, and so it runs inside the raise transaction
 * when given a transaction client.
 *
 * "Active" means the person can sign in (`users.can_login`). Someone
 * who cannot sign in can never act on a complaint, so routing to them
 * is routing to nobody.
 */

/** A pool or a transaction client; a test passes a fake with the same `query`. */
export type Queryable = Pick<PoolClient, 'query'>;

export interface Person {
  id: string;
  name: string;
}

export interface RoutingInput {
  location: { id: string; name: string };
  category: {
    id: string;
    name: string;
    requiresApproval: boolean;
    /** null falls back to the hod designation, the contract default. */
    approverDesignationId: string | null;
  };
}

export interface RoutingSnapshot {
  supervisor: Person;
  manager: Person | null;
  hod: Person | null;
  ceo: Person | null;
  approver: Person | null;
}

interface ChainRow {
  id: string;
  name: string;
  seed_key: string | null;
  designation_id: string | null;
  depth: number;
}

/**
 * The reports_to chain starting AT `startId` (depth 0) and walking up.
 * Depth-capped and cycle-safe: the users table forbids only a direct
 * self-loop, so A -> B -> A is possible in bad data and must not hang.
 */
async function chainFrom(db: Queryable, startId: string): Promise<ChainRow[]> {
  const { rows } = await db.query<ChainRow>(
    `with recursive chain (id, depth, path) as (
       select u.id, 0, array[u.id] from users u where u.id = $1
       union all
       select u.reports_to, c.depth + 1, c.path || u.reports_to
       from chain c join users u on u.id = c.id
       where u.reports_to is not null
         and not (u.reports_to = any (c.path))
         and c.depth < 50
     )
     select u.id, u.name, d.seed_key, u.designation_id, c.depth
     from chain c
     join users u on u.id = c.id
     left join designations d on d.id = u.designation_id
     where u.can_login
     order by c.depth`,
    [startId],
  );
  return rows;
}

async function atLocation(
  db: Queryable,
  locationId: string,
  seedKey: 'supervisor' | 'manager',
): Promise<Array<Person & { canLogin: boolean; reportsTo: string | null }>> {
  const { rows } = await db.query<Person & { canLogin: boolean; reportsTo: string | null }>(
    `select u.id, u.name, u.can_login as "canLogin", u.reports_to as "reportsTo"
     from user_locations ul
     join users u on u.id = ul.user_id
     join designations d on d.id = u.designation_id
     where ul.location_id = $1 and d.seed_key = $2
     order by u.can_login desc, u.name`,
    [locationId, seedKey],
  );
  return rows;
}

export async function resolveRouting(
  db: Queryable,
  { location, category }: RoutingInput,
): Promise<RoutingSnapshot> {
  // 1. supervisor ---------------------------------------------------
  // "Active" is can_login (see the header). A supervisor who can't sign
  // in counts as no supervisor, and gets the contract's exact message.
  const supervisors = await atLocation(db, location.id, 'supervisor');
  const supervisorRow = supervisors.find((s) => s.canLogin);
  if (!supervisorRow) {
    throw new UnprocessableEntityException(
      `${location.name} has no supervisor yet, so this complaint would reach nobody. Ask an admin to assign one in Settings → Locations.`,
    );
  }
  const supervisor: Person = { id: supervisorRow.id, name: supervisorRow.name };

  // 2. manager: the manager at L, else the supervisor's reports_to --
  const managers = await atLocation(db, location.id, 'manager');
  let manager: Person | null = null;
  const managerRow = managers.find((m) => m.canLogin);
  if (managerRow) {
    manager = { id: managerRow.id, name: managerRow.name };
  } else if (supervisorRow.reportsTo) {
    const up = (await chainFrom(db, supervisor.id)).find((r) => r.depth === 1);
    manager = up ? { id: up.id, name: up.name } : null;
  }

  // 3. hod: first hod walking up from the manager (or the supervisor).
  // The start person counts: a supervisor who reports straight to the
  // HOD has that HOD as manager AND hod, and is notified once.
  const hodChain = await chainFrom(db, (manager ?? supervisor).id);
  const hodRow = hodChain.find((r) => r.seed_key === 'hod');
  const hod: Person | null = hodRow ? { id: hodRow.id, name: hodRow.name } : null;

  // 4. ceo: the first ceo by name ------------------------------------
  const { rows: ceoRows } = await db.query<Person>(
    `select u.id, u.name
     from users u join designations d on d.id = u.designation_id
     where d.seed_key = 'ceo' and u.can_login
     order by u.name, u.id
     limit 1`,
  );
  const ceo: Person | null = ceoRows[0] ?? null;

  // 5. approver, only when the category needs one ---------------------
  let approver: Person | null = null;
  if (category.requiresApproval) {
    const { rows: designationRows } = await db.query<{ id: string; name: string; seed_key: string | null }>(
      category.approverDesignationId
        ? `select id, name, seed_key from designations where id = $1`
        : `select id, name, seed_key from designations where seed_key = 'hod'`,
      category.approverDesignationId ? [category.approverDesignationId] : [],
    );
    const designation = designationRows[0];

    if (designation?.seed_key === 'ceo') {
      approver = ceo;
    } else if (designation) {
      // depth > 0: the supervisor resolves the complaint, so they can
      // never be the one who approves the closure — that would let a
      // category whose approver designation is "Supervisor" sign off
      // its own work. The search starts at their reports_to.
      const chain = await chainFrom(db, supervisor.id);
      const row = chain.find((r) => r.depth > 0 && r.designation_id === designation.id);
      approver = row ? { id: row.id, name: row.name } : null;
    }

    if (!approver) {
      const needs = designation ? `it needs ${article(designation.name)} ${designation.name}` : 'it has no approver designation';
      throw new UnprocessableEntityException(
        `Nobody at ${location.name} can approve ${category.name} complaints (${needs}). Ask an admin to set one up.`,
      );
    }
  }

  return { supervisor, manager, hod, ceo, approver };
}

/** "an HOD", "a Manager": by the sound of the first letter, near enough for designation names. */
function article(word: string): string {
  if (/^(hod|h\.o\.d)/i.test(word)) return 'an';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}
