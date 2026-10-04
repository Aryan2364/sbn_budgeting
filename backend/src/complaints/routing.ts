import { UnprocessableEntityException } from '@nestjs/common';
import type { PoolClient } from 'pg';

/**
 * Routing, run ONCE at raise time (CONTRACT section 3, plan 3.4).
 *
 * The result is written onto the complaint row and never recomputed on
 * read: a later change to a site's supervisor must not silently move
 * an open complaint, and a closed one must still say who handled it.
 *
 * A complaint is filed against a budget SITE (client decision, 1 Oct
 * 2026, CONTRACT section 10; it replaced plan 3.1a's "by location").
 * The site names its own supervisor and manager (sites.supervisor_id,
 * sites.manager_id), so those two come from the site row; the HOD, CEO
 * and approver are found up the reports_to chain exactly as before.
 *
 * Written as one function over a `query` callback so it can be unit
 * tested against a fake, and so it runs inside the raise transaction
 * when given a transaction client.
 *
 * "Can receive" means the person is current AND can sign in
 * (`users.active and users.can_login`, access plan 6.2 and 3.4.9).
 * Someone who cannot sign in can never act on a complaint, so routing to
 * them is routing to nobody.
 *
 * The approver is never the complaint's raiser (O10 Q11, DECISIONS 19,
 * plan 6.2, D6): a raiser may not approve their own complaint, and
 * because the approver is fixed here, choosing them would leave the
 * complaint waiting for an approval nobody may give. So the search skips
 * the raiser and keeps walking up the chain for the same designation;
 * if nobody is left, the raise is refused (L3).
 *
 * Designation seed keys (`supervisor`, `hod`, `ceo`) are read here to
 * find WHO handles a complaint. That is business data, the workflow, not
 * access: no permission is decided from them (plan 6.2).
 */

/** A pool or a transaction client; a test passes a fake with the same `query`. */
export type Queryable = Pick<PoolClient, 'query'>;

export interface Person {
  id: string;
  name: string;
}

export interface RoutingInput {
  site: { id: string; name: string };
  /** The raiser's user id: never chosen as the approver. */
  raisedBy: string;
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
       select u.id, 0, array[u.id] from users u
       /*scope-exempt: routing walks the reports_to chain to find who receives a complaint; business data, never returned to the caller as a list*/
       where u.id = $1
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
     where u.active and u.can_login
     order by c.depth`,
    [startId],
  );
  return rows;
}

/**
 * The sentence for a site nobody could receive a complaint at. One
 * function, so the raise 422 and the site picker's `reason` (GET
 * /complaints/sites) can never drift apart.
 */
export function noSupervisorReason(siteName: string): string {
  return `${siteName} has no supervisor who can sign in yet, so this complaint would reach nobody. Ask a budget administrator to set one on the site.`;
}

interface SitePeopleRow {
  supervisor_id: string | null;
  supervisor_name: string | null;
  /** Can receive: active and can sign in (the column keeps its old name). */
  supervisor_can_login: boolean | null;
  supervisor_reports_to: string | null;
  manager_id: string | null;
  manager_name: string | null;
  manager_can_login: boolean | null;
}

/** The supervisor and manager the site itself names. */
async function sitePeople(db: Queryable, siteId: string): Promise<SitePeopleRow> {
  const { rows } = await db.query<SitePeopleRow>(
    `select sv.id as supervisor_id, sv.name as supervisor_name,
            (sv.active and sv.can_login) as supervisor_can_login, sv.reports_to as supervisor_reports_to,
            mg.id as manager_id, mg.name as manager_name, (mg.active and mg.can_login) as manager_can_login
     from sites s
     left join users sv on sv.id = s.supervisor_id
     left join users mg on mg.id = s.manager_id
     /*scope-exempt: routing reads the people the raise site names, after raise checked that site against its scope*/
     where s.id = $1`,
    [siteId],
  );
  return rows[0] ?? {
    supervisor_id: null, supervisor_name: null, supervisor_can_login: null,
    supervisor_reports_to: null, manager_id: null, manager_name: null, manager_can_login: null,
  };
}

export async function resolveRouting(
  db: Queryable,
  { site, category, raisedBy }: RoutingInput,
): Promise<RoutingSnapshot> {
  const people = await sitePeople(db, site.id);

  // 1. supervisor: the site's own -----------------------------------
  // A supervisor who can't receive (see the header) counts as no supervisor.
  if (!people.supervisor_id || !people.supervisor_can_login) {
    throw new UnprocessableEntityException(noSupervisorReason(site.name));
  }
  const supervisor: Person = { id: people.supervisor_id, name: people.supervisor_name! };

  // 2. manager: the site's own, else the supervisor's reports_to ------
  let manager: Person | null = null;
  if (people.manager_id && people.manager_can_login) {
    manager = { id: people.manager_id, name: people.manager_name! };
  } else if (people.supervisor_reports_to) {
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
     /*scope-exempt: routing copies the CEO on every complaint; business data, not a list for the caller*/
     where d.seed_key = 'ceo' and u.active and u.can_login
     order by u.name, u.id`,
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

    // Everyone who would otherwise be chosen, in order; the raiser is
    // skipped and the search goes on to the next of the same designation.
    let candidates: Person[] = [];
    if (designation?.seed_key === 'ceo') {
      candidates = ceoRows;
    } else if (designation) {
      // depth > 0: the supervisor resolves the complaint, so they can
      // never be the one who approves the closure — that would let a
      // category whose approver designation is "Supervisor" sign off
      // its own work. The search starts at their reports_to.
      const chain = await chainFrom(db, supervisor.id);
      candidates = chain
        .filter((r) => r.depth > 0 && r.designation_id === designation.id)
        .map((r) => ({ id: r.id, name: r.name }));
    }
    approver = candidates.find((p) => p.id !== raisedBy) ?? null;

    if (!approver) {
      const needs = designation ? `it needs ${article(designation.name)} ${designation.name}` : 'it has no approver designation';
      throw new UnprocessableEntityException(
        candidates.length > 0
          ? `Nobody at ${site.name} but you can approve ${category.name} complaints (${needs}), and you can't approve a complaint you raised. Ask someone else to raise it.`
          : `Nobody at ${site.name} can approve ${category.name} complaints (${needs}). Ask an admin to set one up.`,
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
