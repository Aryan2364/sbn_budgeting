import { UnprocessableEntityException } from '@nestjs/common';
import type { PoolClient } from 'pg';

/**
 * Routing, run ONCE at raise time (CONTRACT sections 3 and 10).
 *
 * A complaint is filed against a budget SITE, and the site names who
 * answers for it:
 *   supervisor  the site's supervisor;
 *   manager     the site's manager, else the supervisor's reports_to.
 * Nothing else: no designation is read (owner decision, 5 Oct 2026). Who
 * else sees the complaint is the access system's Team scope (the
 * reports_to chain above these people), never a copy made here.
 *
 * The result is written onto the complaint row and never recomputed on
 * read: a later change to a site's supervisor must not silently move
 * an open complaint, and a closed one must still say who handled it.
 *
 * "Can receive" means the person is current AND can sign in
 * (`users.active and users.can_login`, access plan 6.2 and 3.4.9).
 * Someone who cannot sign in can never act on a complaint, so routing to
 * them is routing to nobody.
 */

/** A pool or a transaction client; a test passes a fake with the same `query`. */
export type Queryable = Pick<PoolClient, 'query'>;

export interface Person {
  id: string;
  name: string;
}

export interface RoutingSnapshot {
  supervisor: Person;
  manager: Person | null;
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
  manager_id: string | null;
  manager_name: string | null;
}

export async function resolveRouting(db: Queryable, site: { id: string; name: string }): Promise<RoutingSnapshot> {
  // Each person only if they can receive (see the header); the manager
  // falls back to the supervisor's reports_to.
  const { rows } = await db.query<SitePeopleRow>(
    `select sv.id as supervisor_id, sv.name as supervisor_name,
            coalesce(mg.id, up.id) as manager_id, coalesce(mg.name, up.name) as manager_name
     from sites s
     left join users sv on sv.id = s.supervisor_id and sv.active and sv.can_login
     left join users mg on mg.id = s.manager_id and mg.active and mg.can_login
     left join users up on up.id = sv.reports_to and up.active and up.can_login
     /*scope-exempt: routing reads the people the raise site names, after raise checked that site against its scope*/
     where s.id = $1`,
    [site.id],
  );
  const people = rows[0];
  if (!people?.supervisor_id) throw new UnprocessableEntityException(noSupervisorReason(site.name));
  return {
    supervisor: { id: people.supervisor_id, name: people.supervisor_name! },
    manager: people.manager_id ? { id: people.manager_id, name: people.manager_name! } : null,
  };
}
