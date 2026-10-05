import type { Client } from 'pg';

/**
 * Relation-class sampling (plan §6.3.1).
 *
 * For each signed-in person and each record type, pick up to
 * PER_CLASS ids in every relation class relative to that person: made
 * by them, named on, on a site they are named on, on a team site, the
 * legacy null-creator rows, and none of these. Complaints are sampled
 * per status as well. The new scopes (Own / Team / Selected sites / All)
 * are defined in exactly these terms, so a sample like this is what can
 * tell them apart, and it stays small on a production-sized database.
 *
 * On the fixture database the classes cover every record, so the
 * baseline exercises everything.
 *
 * All queries are deterministic (ordered by id).
 */

export const PER_CLASS = 3;

export type RecordType =
  | 'project'
  | 'site'
  | 'expense'
  | 'complaint'
  | 'user'
  | 'cost_head'
  | 'designation'
  | 'location'
  | 'complaint_category'
  | 'notification'
  | 'photo'
  /** P6: the access API's roles (new-system routes, D7). */
  | 'role';

/** One sampled record. `id` is `complaintId/photoId` for photos. */
export interface Sampled {
  id: string;
  classes: string[];
}

export type Sample = Record<RecordType, Sampled[]>;

/** People who report to $1, directly or through others. */
const TEAM = `
  with recursive team(id) as (
    select u.id from users u where u.reports_to = $1
    union
    select u.id from users u join team t on u.reports_to = t.id
  )`;

const MY_SITES = `(select s.id from sites s where s.manager_id = $1 or s.supervisor_id = $1)`;
const TEAM_SITES = `(select s.id from sites s
                     where s.manager_id in (select id from team) or s.supervisor_id in (select id from team))`;

interface ClassQuery {
  cls: string;
  /** Selects `id` (and nothing else needed), uses $1 = the person. */
  sql: string;
  /** Partition column for per-status sampling. */
  partition?: string;
}

const lim = (sql: string, partition?: string): string =>
  partition
    ? `select id from (select x.id, row_number() over (partition by x.${partition} order by x.id) as rn
                       from (${sql}) x) y where rn <= ${PER_CLASS} order by id`
    : `select id from (${sql}) x order by id limit ${PER_CLASS}`;

// coalesce: `x in (a, NULL)` is NULL, not false, when x is not a, and
// `not NULL` would silently drop every complaint with an empty role.
// The HOD, CEO and approver columns exist only before migration 0013,
// so they are read through to_jsonb: the same predicate on the fixtures'
// own schema (where a fixture run samples), and on a restore after 0013.
const COMPLAINT_PEOPLE = `($1::uuid::text in (c.supervisor_id::text, c.manager_id::text,
  to_jsonb(c)->>'hod_id', to_jsonb(c)->>'ceo_id', to_jsonb(c)->>'approver_id'))`;
const COMPLAINT_NAMED = `coalesce(${COMPLAINT_PEOPLE}, false)`;

const QUERIES: Record<RecordType, ClassQuery[]> = {
  project: [
    { cls: 'has-my-site', sql: `select p.id from projects p where p.id in (select project_id from sites where id in ${MY_SITES})` },
    { cls: 'has-team-site', sql: `${TEAM} select p.id from projects p where p.id in (select project_id from sites where id in ${TEAM_SITES})` },
    { cls: 'none', sql: `${TEAM} select p.id from projects p where p.id not in (select project_id from sites where project_id is not null and (id in ${MY_SITES} or id in ${TEAM_SITES}))` },
  ],
  site: [
    { cls: 'named-on', sql: `select s.id from sites s where s.id in ${MY_SITES}` },
    { cls: 'team-site', sql: `${TEAM} select s.id from sites s where s.id in ${TEAM_SITES}` },
    { cls: 'none', sql: `${TEAM} select s.id from sites s where s.id not in ${MY_SITES} and s.id not in ${TEAM_SITES}` },
  ],
  expense: [
    { cls: 'created-by-me', sql: `select e.id from expenses e where e.created_by = $1` },
    { cls: 'on-my-site', sql: `select e.id from expenses e where e.site_id in ${MY_SITES}` },
    { cls: 'on-team-site', sql: `${TEAM} select e.id from expenses e where e.site_id in ${TEAM_SITES}` },
    { cls: 'legacy-null-creator', sql: `select e.id from expenses e where e.created_by is null` },
    { cls: 'none', sql: `${TEAM} select e.id from expenses e
        where e.created_by is distinct from $1 and e.created_by is not null
          and e.site_id not in ${MY_SITES} and e.site_id not in ${TEAM_SITES}` },
  ],
  complaint: [
    { cls: 'raised-by-me', partition: 'status', sql: `select c.id, c.status from complaints c where c.raised_by = $1` },
    { cls: 'named-on', partition: 'status', sql: `select c.id, c.status from complaints c where ${COMPLAINT_NAMED}` },
    { cls: 'on-my-site', partition: 'status', sql: `select c.id, c.status from complaints c where c.site_id in ${MY_SITES}` },
    { cls: 'on-team-site', partition: 'status', sql: `${TEAM} select c.id, c.status from complaints c where c.site_id in ${TEAM_SITES}` },
    { cls: 'legacy-no-site', partition: 'status', sql: `select c.id, c.status from complaints c where c.site_id is null` },
    { cls: 'none', partition: 'status', sql: `${TEAM} select c.id, c.status from complaints c
        where c.raised_by <> $1 and not ${COMPLAINT_NAMED}
          and (c.site_id is null or (c.site_id not in ${MY_SITES} and c.site_id not in ${TEAM_SITES}))` },
  ],
  user: [
    { cls: 'self', sql: `select u.id from users u where u.id = $1` },
    { cls: 'my-report', sql: `select u.id from users u where u.reports_to = $1` },
    { cls: 'my-manager', sql: `select u.reports_to as id from users u where u.id = $1 and u.reports_to is not null` },
    { cls: 'unlinked', sql: `select u.id from users u
        where u.id <> $1
          and not exists (select 1 from sites s where u.id in (s.manager_id, s.supervisor_id))
          and not exists (select 1 from expenses e where e.created_by = u.id)
          and not exists (select 1 from complaints c where u.id::text in (c.raised_by::text, c.supervisor_id::text,
                          c.manager_id::text, to_jsonb(c)->>'hod_id', to_jsonb(c)->>'ceo_id', to_jsonb(c)->>'approver_id'))
          and not exists (select 1 from users r where r.reports_to = u.id)` },
    { cls: 'none', sql: `select u.id from users u
        where u.id <> $1 and u.reports_to is distinct from $1
          and u.id not in (select reports_to from users where id = $1 and reports_to is not null)` },
  ],
  cost_head: [
    { cls: 'in-use', sql: `select ch.id from cost_heads ch where exists (select 1 from expenses e where e.cost_head_id = ch.id) or exists (select 1 from site_budgets b where b.cost_head_id = ch.id)` },
    { cls: 'unused', sql: `select ch.id from cost_heads ch where not exists (select 1 from expenses e where e.cost_head_id = ch.id) and not exists (select 1 from site_budgets b where b.cost_head_id = ch.id)` },
  ],
  designation: [
    { cls: 'routing-seed', sql: `select d.id from designations d where d.seed_key in ('supervisor', 'hod', 'ceo')` },
    { cls: 'in-use', sql: `select d.id from designations d where d.seed_key is null and exists (select 1 from users u where u.designation_id = d.id)` },
    { cls: 'unused', sql: `select d.id from designations d where not exists (select 1 from users u where u.designation_id = d.id)` },
  ],
  location: [
    { cls: 'in-use', sql: `select l.id from locations l where exists (select 1 from sites s where s.location_id = l.id) or exists (select 1 from complaints c where c.location_id = l.id)` },
    { cls: 'unused', sql: `select l.id from locations l where not exists (select 1 from sites s where s.location_id = l.id) and not exists (select 1 from complaints c where c.location_id = l.id)` },
  ],
  complaint_category: [
    { cls: 'in-use', sql: `select cc.id from complaint_categories cc where exists (select 1 from complaints c where c.category_id = cc.id)` },
    { cls: 'unused', sql: `select cc.id from complaint_categories cc where not exists (select 1 from complaints c where c.category_id = cc.id)` },
  ],
  notification: [
    { cls: 'mine', sql: `select n.id from notifications n where n.user_id = $1` },
    { cls: 'someone-elses', sql: `select n.id from notifications n where n.user_id <> $1` },
  ],
  photo: [
    { cls: 'on-complaint-raised-by-me', sql: `select (c.id::text || '/' || p.id::text) as id from complaint_photos p join complaints c on c.id = p.complaint_id where c.raised_by = $1` },
    { cls: 'on-complaint-named-on', sql: `select (c.id::text || '/' || p.id::text) as id from complaint_photos p join complaints c on c.id = p.complaint_id where ${COMPLAINT_NAMED}` },
    { cls: 'none', sql: `select (c.id::text || '/' || p.id::text) as id from complaint_photos p join complaints c on c.id = p.complaint_id where c.raised_by <> $1 and not ${COMPLAINT_NAMED}` },
  ],
  role: [
    { cls: 'held', sql: `select ur.role_id as id from user_roles ur where ur.user_id = $1` },
    { cls: 'not-held', sql: `select r.id from roles r where not exists (select 1 from user_roles ur where ur.role_id = r.id and ur.user_id = $1)` },
  ],
};

export const RECORD_TYPES = Object.keys(QUERIES) as RecordType[];

/** `userId` null = signed out: one record of each type, so 401s are still per route. */
export async function sampleFor(db: Client, userId: string | null): Promise<Sample> {
  const out = {} as Sample;
  for (const type of RECORD_TYPES) {
    const byId = new Map<string, Set<string>>();
    for (const q of QUERIES[type]) {
      // Signed out there is no "me"; a nil uuid relates to nothing, so
      // every record falls in "none" and the cap keeps it small.
      const me = userId ?? '00000000-0000-0000-0000-000000000000';
      const { rows } = await db.query<{ id: string }>(
        lim(q.sql, q.partition),
        q.sql.includes('$1') ? [me] : [],
      );
      for (const { id } of rows) {
        if (!byId.has(id)) byId.set(id, new Set());
        byId.get(id)!.add(q.cls);
      }
    }
    let list = [...byId.entries()]
      .map(([id, classes]) => ({ id, classes: [...classes].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (userId === null) list = list.slice(0, 1);
    out[type] = list;
  }
  return out;
}
