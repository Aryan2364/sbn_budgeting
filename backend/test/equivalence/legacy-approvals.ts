import type { Client } from 'pg';

import { legacyActions, type LegacyViewer } from './legacy-complaint-actions';

/**
 * A FROZEN record of the complaint world as the baseline saw it, and the
 * one place that undoes intended differences D8 and D9 on a response
 * (owner decisions A1-A3, 5 Oct 2026; migration 0013). Test-only, and
 * never edited to follow the live code: like legacy-complaint-actions.ts,
 * it records what the old build answered from.
 *
 *   D8  approvals removed, and no routing by designation: a complaint
 *       waiting for approval is closed by 0013; the requires-approval
 *       flags, the HOD, CEO and approver snapshots, the Approval tab and
 *       count, and approve / send back are gone; a person no longer
 *       counts or reassigns complaints by being their HOD.
 *   D9  a complaints member views and comments at Team: they also see
 *       the complaints of the people who report up to them and of the
 *       sites their team runs.
 *
 * The baseline stores digests, not bodies. For each affected read the
 * run therefore also records `legacyDigest`: the digest of the run's OWN
 * body with exactly D8 and D9 undone, using this record (fields put
 * back, statuses moved back, the rows a member newly sees taken out).
 * When it equals the baseline digest, every other byte is unchanged.
 *
 * The record is taken on a fixture run, after the fixtures are seeded
 * and BEFORE 0013. On a restore (--no-setup) it can only be the empty
 * record, and only when the database holds no complaint and no category
 * (production on 5 Oct 2026): with nothing to move, undoing D8 is just
 * putting back the empty Approval count and status bucket.
 */

export type LegacyStatus = 'open' | 'in_progress' | 'awaiting_approval' | 'closed';

export interface LegacyComplaint {
  id: string;
  status: LegacyStatus;
  requiresApproval: boolean;
  raisedBy: string;
  supervisor: string;
  manager: string | null;
  hod: string | null;
  ceo: string | null;
  approver: string | null;
}

export interface LegacyCategory {
  requiresApproval: boolean;
  approverDesignation: { id: string; name: string } | null;
}

export interface LegacyWorld {
  complaints: ReadonlyMap<string, LegacyComplaint>;
  /** The complaints migration 0013 closed: awaiting approval before it. */
  migrated: ReadonlySet<string>;
  categories: ReadonlyMap<string, LegacyCategory>;
  /** Person id -> name, for the people refs the old bodies carried. */
  names: ReadonlyMap<string, string>;
  /** Person id -> today's complaints level ('admin' | 'member'), from user_module_access. */
  complaintsLevel: ReadonlyMap<string, string>;
  /** Person ids with a platform admin row today (Admin from P9: every complaint). */
  platformAdmins: ReadonlySet<string>;
}

async function people(db: Client): Promise<Pick<LegacyWorld, 'names' | 'complaintsLevel' | 'platformAdmins'>> {
  const rows = (
    await db.query<{ id: string; name: string; level: string | null; platform: boolean }>(
      `select u.id, u.name,
              (select m.role from user_module_access m where m.user_id = u.id and m.module = 'complaints') as level,
              exists (select 1 from user_module_access m
                      where m.user_id = u.id and m.module = 'platform' and m.role = 'admin') as platform
       from users u /*scope-exempt: harness, every person*/`,
    )
  ).rows;
  return {
    names: new Map(rows.map((p) => [p.id, p.name])),
    complaintsLevel: new Map(rows.filter((p) => p.level).map((p) => [p.id, p.level!])),
    platformAdmins: new Set(rows.filter((p) => p.platform).map((p) => p.id)),
  };
}

/** Reads the world before migration 0013. Run on the fixture schema (FIXTURE_SCHEMA) only. */
export async function captureLegacyWorld(db: Client): Promise<LegacyWorld> {
  const complaints = (
    await db.query<LegacyComplaint>(
      `select c.id, c.status, c.requires_approval as "requiresApproval", c.raised_by as "raisedBy",
              c.supervisor_id as supervisor, c.manager_id as manager, c.hod_id as hod, c.ceo_id as ceo,
              c.approver_id as approver
       from complaints c /*scope-exempt: harness, every complaint*/ order by c.id`,
    )
  ).rows;
  const categories = (
    await db.query<{ id: string } & LegacyCategory>(
      `select cc.id, cc.requires_approval as "requiresApproval",
              case when d.id is null then null else json_build_object('id', d.id, 'name', d.name) end
                as "approverDesignation"
       from complaint_categories cc left join designations d on d.id = cc.approver_designation_id`,
    )
  ).rows;
  return {
    complaints: new Map(complaints.map((c) => [c.id, c])),
    migrated: new Set(complaints.filter((c) => c.status === 'awaiting_approval').map((c) => c.id)),
    categories: new Map(categories.map(({ id, ...c }) => [id, c])),
    ...(await people(db)),
  };
}

/**
 * The record for a restore: empty, and only when there is nothing it
 * would have to hold. Null when the database has complaints or
 * categories, whose state before 0013 is no longer readable.
 */
export async function emptyLegacyWorld(db: Client): Promise<LegacyWorld | null> {
  const { rows } = await db.query<{ n: number }>(
    `select ((select count(*) from complaints /*scope-exempt: harness*/)
           + (select count(*) from complaint_categories))::int as n`,
  );
  if (rows[0]!.n > 0) return null;
  return { complaints: new Map(), migrated: new Set(), categories: new Map(), ...(await people(db)) };
}

// ---------------------------------------------------------------------
// Who sees what: before (the baseline's rule) and after (D9)
// ---------------------------------------------------------------------

/** The baseline's rule: a complaints admin sees all; anyone else the complaints naming them. */
export function legacyCanSee(world: LegacyWorld, viewerId: string, c: LegacyComplaint): boolean {
  const level = world.complaintsLevel.get(viewerId);
  if (level === 'admin') return true;
  if (!level) return false;
  return [c.raisedBy, c.supervisor, c.manager, c.hod, c.ceo, c.approver].includes(viewerId);
}

export interface Visibility {
  /** Complaint ids a complaints member sees now and did not before (D9). */
  extras: Set<string>;
  /** Complaint ids they saw before and do not now (D9; none on the fixtures). */
  losses: Set<string>;
}

/**
 * D9 for one person, stated from the definition, not from the code: a
 * complaints member (not an admin of any kind) now sees a complaint if
 * its raiser, supervisor or manager is them or reports up to them
 * (reporting_closure), or its site is led by such a person. Everyone
 * else sees what they saw.
 */
export async function visibilityChange(db: Client, world: LegacyWorld, viewerId: string): Promise<Visibility> {
  const out: Visibility = { extras: new Set(), losses: new Set() };
  if (world.complaintsLevel.get(viewerId) !== 'member' || world.platformAdmins.has(viewerId)) return out;
  const { rows } = await db.query<{ id: string }>(
    `select c.id from complaints c /*scope-exempt: harness, the D9 definition*/
     where exists (select 1 from reporting_closure rc
                   where rc.ancestor_id = $1 and rc.descendant_id in (c.raised_by, c.supervisor_id, c.manager_id))
        or c.site_id in (select s.id from sites s join reporting_closure rc
                         on rc.ancestor_id = $1 and rc.descendant_id in (s.manager_id, s.supervisor_id))`,
    [viewerId],
  );
  const now = new Set(rows.map((r) => r.id));
  for (const id of now) {
    const c = world.complaints.get(id);
    if (c && !legacyCanSee(world, viewerId, c)) out.extras.add(id);
  }
  for (const c of world.complaints.values()) {
    if (legacyCanSee(world, viewerId, c) && !now.has(c.id)) out.losses.add(c.id);
  }
  return out;
}

/**
 * D8's "HOD only" pairs: before 0013 a complaints member could reassign
 * a complaint by being named its HOD; now only its manager can (Own).
 * "personId|complaintId" for each complaint naming them HOD but not
 * manager.
 */
export function hodOnlyPairs(world: LegacyWorld): Set<string> {
  const out = new Set<string>();
  for (const c of world.complaints.values()) {
    if (c.hod && c.hod !== c.manager && world.complaintsLevel.get(c.hod) === 'member') out.add(`${c.hod}|${c.id}`);
  }
  return out;
}

// ---------------------------------------------------------------------
// Undoing D8 and D9 on one response
// ---------------------------------------------------------------------

type Json = Record<string, unknown>;
type Ref = { id: string; name: string } | null;

/** Which intended difference the undoing needed: D8 if anything of it, else D9. */
export type Why = 'D8' | 'D9';

export interface Undone {
  /** The body (or the list's rows) as the baseline build would have sent it. */
  value: unknown;
  why: Why;
}

/** The reads whose bodies D8 or D9 change, by route key (with the variant, for lists). */
export const UNDONE_ROUTES = [
  'GET /api/complaints/:id',
  'GET /api/complaints [tab-all]',
  'GET /api/complaints [tab-assigned]',
  'GET /api/complaints [tab-raised]',
  'GET /api/complaints/counts',
  'GET /api/complaints/summary',
  'GET /api/complaint-categories',
  'GET /api/complaint-categories/:id',
  'GET /api/users',
  'GET /api/users/:id',
] as const;

const AGE_BUCKETS = ['d0_2', 'd3_7', 'd8_14', 'd15plus'] as const;
const NO_SITE_NAME = 'No site (older complaint)';

function ageBucket(raisedMs: number): (typeof AGE_BUCKETS)[number] {
  const days = Math.floor((Date.now() - raisedMs) / 86_400_000);
  return days <= 2 ? 'd0_2' : days <= 7 ? 'd3_7' : days <= 14 ? 'd8_14' : 'd15plus';
}

export class LegacyUndo {
  private readonly visibility = new Map<string, Visibility>();

  constructor(
    private readonly world: LegacyWorld,
    private readonly db: Client,
  ) {}

  private ref(id: string | null): Ref {
    return id ? { id, name: this.world.names.get(id) ?? id } : null;
  }

  async visibilityOf(viewerId: string): Promise<Visibility> {
    let v = this.visibility.get(viewerId);
    if (!v) this.visibility.set(viewerId, (v = await visibilityChange(this.db, this.world, viewerId)));
    return v;
  }

  /** The complaint as the baseline knew it, or undefined for one it never had. */
  private before(id: unknown): LegacyComplaint | undefined {
    return typeof id === 'string' ? this.world.complaints.get(id) : undefined;
  }

  /**
   * `route` is the case's route key with its variant ("GET /api/complaints
   * [tab-all]"); `value` the response body, or for a list every row,
   * sorted. Null when this route is not one D8 or D9 touches.
   */
  async undo(route: string, viewer: LegacyViewer, value: unknown): Promise<Undone | null> {
    switch (route) {
      case 'GET /api/complaints/:id':
        return this.detail(viewer, value as Json);
      case 'GET /api/complaints [tab-all]':
      case 'GET /api/complaints [tab-assigned]':
      case 'GET /api/complaints [tab-raised]':
        return this.rows(route, viewer, value as Json[]);
      case 'GET /api/complaints/counts':
        return this.counts(viewer, value as Json);
      case 'GET /api/complaints/summary':
        return this.summary(viewer, value as Json);
      case 'GET /api/complaint-categories':
        return { value: (value as Json[]).map((r) => this.category(r)), why: 'D8' };
      case 'GET /api/complaint-categories/:id':
        return { value: this.category(value as Json), why: 'D8' };
      case 'GET /api/users':
        return { value: (value as Json[]).map((r) => this.person(r)), why: 'D8' };
      case 'GET /api/users/:id':
        return { value: this.person(value as Json), why: 'D8' };
      default:
        return null;
    }
  }

  /** D8: the fields 0013 dropped, the status it moved, its timeline line, and the old `actions`. */
  private detail(viewer: LegacyViewer, body: Json): Undone | null {
    const c = this.before(body.id);
    if (!c) return null;
    const out: Json = {
      ...body,
      requiresApproval: c.requiresApproval,
      hod: this.ref(c.hod),
      ceo: this.ref(c.ceo),
      approver: this.ref(c.approver),
    };
    if (this.world.migrated.has(c.id)) {
      out.status = c.status;
      out.closedAt = null;
      out.closedBy = null;
      out.events = (body.events as Json[]).filter(
        (e) => !(e.kind === 'closed' && e.actor === null && e.note === 'closed: approval removed'),
      );
    }
    out.actions = legacyActions(viewer, out as unknown as Parameters<typeof legacyActions>[1]);
    return { value: out, why: 'D8' };
  }

  /** D8: statuses moved back; D9: the rows a member newly sees taken out. */
  private async rows(route: string, viewer: LegacyViewer, rows: Json[]): Promise<Undone | null> {
    let d8 = false;
    let d9 = false;
    const out: Json[] = [];
    for (const row of rows) {
      const c = this.before(row.id);
      if (!c) return null;
      if (!legacyCanSee(this.world, viewer.id, c)) {
        d9 = true;
        continue;
      }
      // The tab's own rule, on the old status (assigned: open or in progress).
      if (route.endsWith('[tab-assigned]') && !['open', 'in_progress'].includes(c.status)) continue;
      if (this.world.migrated.has(c.id)) {
        d8 = true;
        out.push({ ...row, status: c.status });
      } else {
        out.push(row);
      }
    }
    if (!d8 && !d9) return null;
    return { value: out, why: d8 ? 'D8' : 'D9' };
  }

  /** D8: the Approval count put back; D9: `all` less what a member newly sees. */
  private async counts(viewer: LegacyViewer, body: Json): Promise<Undone> {
    const { extras, losses } = await this.visibilityOf(viewer.id);
    let approval = 0;
    for (const c of this.world.complaints.values()) {
      if (c.approver === viewer.id && c.status === 'awaiting_approval' && legacyCanSee(this.world, viewer.id, c)) {
        approval += 1;
      }
    }
    return {
      value: { ...body, approval, all: (body.all as number) - extras.size + losses.size },
      why: 'D8',
    };
  }

  /**
   * D8: the closed complaints that were waiting go back to waiting (an
   * open bucket), and the awaiting_approval status count comes back;
   * D9: what a member newly sees comes out of every bucket.
   */
  private async summary(viewer: LegacyViewer, body: Json): Promise<Undone> {
    const { extras, losses } = await this.visibilityOf(viewer.id);
    const byStatus: Record<string, number> = { awaiting_approval: 0, ...(body.byStatus as Record<string, number>) };
    type Bucket = { open: number; closed: number };
    const bySite = new Map((body.bySite as Array<{ site: { id: string | null; name: string } } & Bucket>).map(
      (b) => [b.site.id ?? '', { ...b }],
    ));
    const byCategory = new Map((body.byCategory as Array<{ category: { id: string; name: string } } & Bucket>).map(
      (b) => [b.category.id, { ...b }],
    ));
    const ageing = { ...(body.openAgeing as Record<string, number>) };
    let closedLast7Days = body.closedLast7Days as number;

    const current = new Map(
      (
        await this.db.query<{
          id: string; status: string; site_id: string | null; site_name: string | null;
          category_id: string; category_name: string; raised_ms: number; closed_ms: number | null;
        }>(
          `select c.id, c.status, c.site_id, st.name as site_name, c.category_id, cc.name as category_name,
                  extract(epoch from c.raised_at)::float8 * 1000 as raised_ms,
                  extract(epoch from c.closed_at)::float8 * 1000 as closed_ms
           from complaints c /*scope-exempt: harness, the summary's own rows*/
           join complaint_categories cc on cc.id = c.category_id left join sites st on st.id = c.site_id`,
        )
      ).rows.map((r) => [r.id, r]),
    );
    /** Moves one complaint in or out of every bucket, as `status` (+1 adds it, -1 takes it out). */
    const move = (id: string, status: string, sign: 1 | -1): void => {
      const r = current.get(id)!;
      const isOpen = status !== 'closed';
      byStatus[status] = (byStatus[status] ?? 0) + sign;
      const site = bySite.get(r.site_id ?? '') ??
        bySite.set(r.site_id ?? '', { site: { id: r.site_id, name: r.site_name ?? NO_SITE_NAME }, open: 0, closed: 0 }).get(r.site_id ?? '')!;
      const cat = byCategory.get(r.category_id) ??
        byCategory.set(r.category_id, { category: { id: r.category_id, name: r.category_name }, open: 0, closed: 0 }).get(r.category_id)!;
      if (isOpen) {
        site.open += sign;
        cat.open += sign;
        const bucket = ageBucket(r.raised_ms);
        ageing[bucket] = (ageing[bucket] ?? 0) + sign;
      } else {
        site.closed += sign;
        cat.closed += sign;
        if (r.closed_ms !== null && Date.now() - r.closed_ms <= 7 * 86_400_000) closedLast7Days += sign;
      }
    };

    for (const id of extras) move(id, current.get(id)!.status, -1);
    for (const id of losses) move(id, this.world.complaints.get(id)!.status, 1);
    for (const id of this.world.migrated) {
      const c = this.world.complaints.get(id)!;
      if (!legacyCanSee(this.world, viewer.id, c) || losses.has(id)) continue;
      move(id, 'closed', -1);
      move(id, c.status, 1);
    }

    const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
    const kept = <T extends Bucket>(list: T[]): T[] => list.filter((b) => b.open !== 0 || b.closed !== 0);
    return {
      value: {
        ...body,
        byStatus,
        bySite: kept([...bySite.values()]).sort(
          (a, b) => Number(a.site.id === null) - Number(b.site.id === null) || b.open - a.open || byName(a.site.name, b.site.name),
        ),
        byCategory: kept([...byCategory.values()]).sort(
          (a, b) => b.open - a.open || byName(a.category.name, b.category.name),
        ),
        openAgeing: ageing,
        closedLast7Days,
      },
      why: 'D8',
    };
  }

  /** D8: a category's approval flag and approver designation. */
  private category(row: Json): Json {
    const c = typeof row.id === 'string' ? this.world.categories.get(row.id) : undefined;
    if (!c) return row;
    return { ...row, requiresApproval: c.requiresApproval, approverDesignation: c.approverDesignation };
  }

  /** D8: a person's open complaints counted as before (HOD, CEO and approver too, waiting ones open). */
  private person(row: Json): Json {
    if (typeof row.id !== 'string' || typeof row.openComplaintCount !== 'number') return row;
    let n = 0;
    for (const c of this.world.complaints.values()) {
      if (c.status === 'closed') continue;
      if ([c.supervisor, c.manager, c.hod, c.ceo, c.approver].includes(row.id)) n += 1;
    }
    return { ...row, openComplaintCount: n };
  }
}
