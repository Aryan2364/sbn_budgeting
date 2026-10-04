import type { Readable } from 'node:stream';

import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { can as holds, type AccessContext } from '../access/access-context';
import { blocked } from '../access/approval';
import type { PermissionKey } from '../access/catalogue';
import { reasonFor } from '../access/permission.guard';
import {
  assertRecordAccess, canSelect, createSiteWhere, scopeWhere, type Param, type RecordCan,
} from '../access/scope';
import type { AuthUser } from '../common/current-user';
import type { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { PG_POOL } from '../db/db.module';
import { notify } from '../notifications/notify';
import type { RaiseComplaintDto, ReassignDto } from './complaints.dto';
import {
  ACTION_NAMES, PERMISSION_ACTIONS, allActions, checkAction, type ActionCheck, type ActionName,
  type ComplaintStatus, type PermissionAction, type PermissionSubject, type PersonRef, type Viewer,
} from './permissions';
import {
  checkPhotos, MAX_PHOTOS, openStored, type PhotoPlace, type PhotoStage, removeStored,
  storePhotos, type StoredPhoto, type UploadedPhoto,
} from './photo-storage';
import { noSupervisorReason, resolveRouting } from './routing';

// ---------------------------------------------------------------------
// Shapes (CONTRACT section 3)
// ---------------------------------------------------------------------

export interface ComplaintRow {
  id: string;
  number: number;
  reference: string;
  status: ComplaintStatus;
  category: PersonRef;
  /**
   * The budget site it was filed against (CONTRACT section 10). Null
   * only on complaints raised before 1 Oct 2026, which were filed
   * against a location.
   */
  site: PersonRef | null;
  /** The complaint's own location (older rows), else the site's, else null. */
  location: PersonRef | null;
  description: string;
  complainantName: string;
  raisedAt: string;
  raisedBy: PersonRef;
  supervisor: PersonRef;
  ageDays: number;
  photoCount: number;
  /**
   * On a list row: the permission layer's answer per permission action
   * (`comment`, `work`, `approve`, `reassign`; plan 6.1.4 item 6, kit
   * 8.3), for the keys the caller holds at some scope, computed in the
   * same query as the row: `{ reassign: true, comment: 'You can ...' }`.
   * A row does not carry the people the workflow reads, so it answers
   * "may you, at this complaint's scope", not "are you its supervisor".
   *
   * On the detail it is the full answer per workflow action instead:
   * see `ComplaintDetail.can`.
   */
  can: RecordCan;
}

export interface ComplaintDetail extends ComplaintRow {
  complainantPhone: string;
  locationNote: string | null;
  requiresApproval: boolean;
  manager: PersonRef | null;
  hod: PersonRef | null;
  ceo: PersonRef | null;
  approver: PersonRef | null;
  startedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionNote: string | null;
  resolvedBy: PersonRef | null;
  closedBy: PersonRef | null;
  photos: Array<{
    id: string; stage: 'raise' | 'resolve'; contentType: string; uploadedAt: string;
    uploadedBy: PersonRef;
  }>;
  events: Array<{
    id: string; kind: string; actor: PersonRef | null; note: string | null;
    fromStatus: string | null; toStatus: string | null; payload: unknown; at: string;
  }>;
  /**
   * The per-record answers (plan 6.1.4 item 6, 6.2; kit 8.3), per
   * workflow action, for the actions whose key the caller holds at some
   * scope: `true`, or the reason, from the permission layer or the
   * workflow layer (`permissions.ts`, the same function every action
   * route runs): `{ start: true, approve: 'You raised this complaint, so
   * someone else must approve it.' }`.
   */
  can: Partial<Record<ActionName, true | string>>;
  /**
   * Compatibility alias of `can` until the screens read `can` (P7), in
   * the old shape and with all six actions: an action whose key the
   * caller does not hold reads `allowed: false` with that permission's
   * sentence. Same answers as `can`, never computed apart from it.
   */
  actions: Record<ActionName, { allowed: boolean; reason: string | null }>;
}

export type Tab = 'assigned' | 'approval' | 'raised' | 'all';
export const TABS: Tab[] = ['assigned', 'approval', 'raised', 'all'];
const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'awaiting_approval', 'closed'];

/** `id` is null only for the bucket of older, location-only complaints. */
export interface SiteBucket {
  id: string | null;
  name: string;
}

export interface ComplaintSummary {
  byStatus: Record<ComplaintStatus, number>;
  bySite: Array<{ site: SiteBucket; open: number; closed: number }>;
  byCategory: Array<{ category: PersonRef; open: number; closed: number }>;
  openAgeing: { d0_2: number; d3_7: number; d8_14: number; d15plus: number };
  closedLast7Days: number;
}

/**
 * One complaint as loaded through the view scope: the detail's core plus
 * `may`, the permission layer's answers for this complaint (canSelect),
 * which the workflow layer is then given (Viewer.may).
 */
type DetailCore = Omit<ComplaintDetail, 'photos' | 'events' | 'actions' | 'can'> & { may: RecordCan };

/** One entry of the raise form's site picker (GET /complaints/sites). */
export interface ComplaintSite {
  id: string;
  name: string;
  location: PersonRef | null;
  /** Who routing would pick: the site's supervisor, only if they can receive (active and can sign in). */
  supervisor: PersonRef | null;
  /** Who routing would copy: the site's manager if they can receive, else the supervisor's reports_to. */
  manager: PersonRef | null;
  canReceive: boolean;
  reason: string | null;
}

/** The picker is unpaginated, so it is capped; far above today's site count. */
export const SITE_PICKER_LIMIT = 1000;

/** The bySite bucket for complaints raised before sites (1 Oct 2026). */
const NO_SITE_NAME = 'No site (older complaint)';

// ---------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------

const person = (alias: string): string =>
  `json_build_object('id', ${alias}.id, 'name', ${alias}.name)`;
const personOrNull = (alias: string): string =>
  `case when ${alias}.id is null then null else ${person(alias)} end`;

/**
 * `C-000123`: at least six digits. lpad truncates a longer string, so
 * the width grows with the number and C-1234567 stays whole.
 */
const REFERENCE_SQL = `('C-' || lpad(c.number::text, greatest(6, length(c.number::text)), '0'))`;
/** The photo folder's year: when the complaint was raised, in India. */
const RAISED_YEAR_SQL = `extract(year from c.raised_at at time zone 'Asia/Kolkata')::int`;
/** Whole days since raised, or raised -> closed once closed. */
const AGE_DAYS_SQL =
  `floor(extract(epoch from (coalesce(c.closed_at, now()) - c.raised_at)) / 86400)::int`;

// The location is the complaint's own (rows raised before 1 Oct 2026)
// or else its site's; either may be missing, hence the left joins.
const ROW_FROM = `
  complaints c
  join complaint_categories cc on cc.id = c.category_id
  left join sites st on st.id = c.site_id
  left join locations l on l.id = coalesce(c.location_id, st.location_id)
  join users rb on rb.id = c.raised_by
  join users sv on sv.id = c.supervisor_id`;

const ROW_SELECT = `
  c.id, c.number::int as number, ${REFERENCE_SQL} as reference, c.status,
  json_build_object('id', cc.id, 'name', cc.name) as category,
  ${personOrNull('st')} as site,
  ${personOrNull('l')} as location,
  c.description, c.complainant_name as "complainantName",
  c.raised_at as "raisedAt", ${person('rb')} as "raisedBy", ${person('sv')} as supervisor,
  ${AGE_DAYS_SQL} as "ageDays",
  (select count(*)::int from complaint_photos p where p.complaint_id = c.id) as "photoCount"`;

const DETAIL_FROM = `${ROW_FROM}
  left join users mg on mg.id = c.manager_id
  left join users hd on hd.id = c.hod_id
  left join users ce on ce.id = c.ceo_id
  left join users ap on ap.id = c.approver_id
  left join users rv on rv.id = c.resolved_by
  left join users cl on cl.id = c.closed_by`;

const DETAIL_SELECT = `${ROW_SELECT},
  c.complainant_phone as "complainantPhone", c.location_note as "locationNote",
  c.requires_approval as "requiresApproval",
  ${personOrNull('mg')} as manager, ${personOrNull('hd')} as hod,
  ${personOrNull('ce')} as ceo, ${personOrNull('ap')} as approver,
  c.started_at as "startedAt", c.resolved_at as "resolvedAt", c.closed_at as "closedAt",
  c.resolution_note as "resolutionNote",
  ${personOrNull('rv')} as "resolvedBy", ${personOrNull('cl')} as "closedBy"`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------
// Access (plan 6.1.4, 6.2). Visibility is `complaints.complaints.view`
// through the shared scope filter: Own = raised by me or named on the
// snapshot (supervisor, manager, HOD, CEO, approver), which is today's
// member rule word for word; All = every complaint, today's admin rule.
// A site-less legacy complaint is reached by Own and All only (O10 Q9).
// Who may do what to ONE complaint is still decided by the workflow
// layer, permissions.ts (decision 27), after these checks.
// ---------------------------------------------------------------------

const VIEW: PermissionKey = 'complaints.complaints.view';
const RAISE: PermissionKey = 'complaints.complaints.raise';
/** Choosing the new supervisor on reassign (the reassign key needs this Pick at All). */
const PEOPLE_PICK: PermissionKey = 'platform.people.pick';

/** The permission actions' keys: a row's `can`, and the workflow's `Viewer.may`. */
const CAN_ACTIONS: Readonly<Record<PermissionAction, PermissionKey>> = {
  comment: 'complaints.complaints.comment',
  work: 'complaints.complaints.work',
  approve: 'complaints.complaints.approve',
  reassign: 'complaints.complaints.reassign',
};

/** The key each action route carries (plan 6.2 layer 2; RESOLUTIONS C1). */
const ACTION_KEY: Record<ActionName, PermissionKey> = {
  start: 'complaints.complaints.work',
  resolve: 'complaints.complaints.work',
  approve: 'complaints.complaints.approve',
  sendBack: 'complaints.complaints.approve',
  reassign: 'complaints.complaints.reassign',
  comment: 'complaints.complaints.comment',
};

/** A fresh parameter list and its `param`, for one statement. */
function params(initial: unknown[] = []): { values: unknown[]; param: Param } {
  const values = [...initial];
  return {
    values,
    param: (v) => {
      values.push(v);
      return `$${values.length}`;
    },
  };
}

/** The caller's id as a parameter, added only when first used (an unused one is an error in Postgres). */
function lazyMe(param: Param, userId: string): () => string {
  let placeholder: string | undefined;
  return () => (placeholder ??= `${param(userId)}::uuid`);
}

/**
 * The tab's own condition, on top of visibility: "my work" filters, so
 * they stay workflow (plan 6.2), not scope. `counts` uses the same text.
 * The id goes in as a parameter.
 */
function tabSql(tab: Tab, me: () => string): string {
  switch (tab) {
    case 'assigned': return `c.supervisor_id = ${me()} and c.status in ('open', 'in_progress')`;
    case 'approval': return `c.approver_id = ${me()} and c.status = 'awaiting_approval'`;
    case 'raised': return `c.raised_by = ${me()}`;
    case 'all': return 'true';
  }
}

const NOT_FOUND =
  "That complaint doesn't exist, or it wasn't sent to you. Check the link, or open it from your complaints list.";

const EVENT_VERB: Record<string, string> = {
  started: 'started',
  resolved: 'resolved',
  approved: 'approved',
  sent_back: 'sent back',
  closed: 'closed',
};

/**
 * The workflow's viewer: who is asking, and the permission layer's
 * answer for THIS complaint per permission action. A key not held at
 * any scope is absent from `may` (canSelect leaves it out) and reads as
 * that permission's sentence. Never a role or a level (plan 6.2).
 */
function viewerOf(access: AccessContext, c: DetailCore): Viewer {
  const may = {} as Record<PermissionAction, true | string>;
  const held = {} as Record<PermissionAction, boolean>;
  for (const action of PERMISSION_ACTIONS) {
    const answer = c.may[action];
    may[action] = answer === true ? true : (answer ?? reasonFor(CAN_ACTIONS[action]));
    held[action] = holds(access, CAN_ACTIONS[action]);
  }
  return { id: access.userId, may, held };
}

/**
 * The detail's `can` (only the actions whose key is held, kit 8.3) and
 * its `actions` alias (all six, the old shape), from ONE workflow run.
 */
function answersFor(
  access: AccessContext,
  c: DetailCore,
): Pick<ComplaintDetail, 'can' | 'actions'> {
  const checks = allActions(viewerOf(access, c), c);
  const can: ComplaintDetail['can'] = {};
  const actions = {} as ComplaintDetail['actions'];
  for (const name of ACTION_NAMES) {
    const { allowed, reason } = checks[name];
    actions[name] = { allowed, reason };
    if (holds(access, ACTION_KEY[name])) can[name] = allowed ? true : (reason ?? reasonFor(ACTION_KEY[name]));
  }
  return { can, actions };
}

function short(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function requireNote(value: string | undefined, message: string): string {
  const note = value?.trim();
  if (!note) throw new UnprocessableEntityException(message);
  return note;
}

@Injectable()
export class ComplaintsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  list(
    access: AccessContext,
    query: ListQueryDto,
    tabRaw: string | undefined,
    filters: { status?: string; siteId?: string; locationId?: string; categoryId?: string },
  ): Promise<ListResult<ComplaintRow & MatchInfo>> {
    const tab = (tabRaw ?? 'all') as Tab;
    if (!TABS.includes(tab)) {
      throw new BadRequestException(`Unknown tab "${tabRaw}". Use one of: ${TABS.join(', ')}.`);
    }
    return runListQuery<ComplaintRow>(
      this.pool,
      {
        scope: { key: VIEW, record: 'complaint', alias: 'c' },
        can: CAN_ACTIONS,
        from: ROW_FROM,
        select: ROW_SELECT,
        titleField: { sql: REFERENCE_SQL, label: 'Reference' },
        // Every text a person would search a complaint by. The resolution
        // note is left out on purpose: it is not on the row, and a match
        // on text the list never shows looks like a wrong result.
        searchFields: [
          { sql: 'c.description', label: 'Description' },
          { sql: 'c.complainant_name', label: 'Complainant' },
          { sql: 'c.complainant_phone', label: 'Complainant phone' },
          { sql: 'st.name', label: 'Site' },
          { sql: 'l.name', label: 'Location' },
          { sql: 'c.location_note', label: 'Location note' },
          { sql: 'cc.name', label: 'Category' },
          { sql: 'sv.name', label: 'Supervisor' },
          { sql: 'rb.name', label: 'Raised by' },
        ],
        sortable: {
          raisedAt: 'c.raised_at',
          number: 'c.number',
          reference: 'c.number',
          status: `array_position(array['open','in_progress','awaiting_approval','closed'], c.status)`,
          ageDays: AGE_DAYS_SQL,
          site: 'st.name',
          location: 'l.name',
          category: 'cc.name',
          supervisor: 'sv.name',
          complainantName: 'c.complainant_name',
        },
        defaultSort: { key: 'raisedAt', direction: 'desc' },
        filters: {
          status: (value, param) => {
            const list = value.split(',').map((s) => s.trim()).filter(Boolean);
            const bad = list.find((s) => !STATUSES.includes(s as ComplaintStatus));
            if (bad) {
              throw new BadRequestException(`Unknown status "${bad}". Use one of: ${STATUSES.join(', ')}.`);
            }
            return `c.status = any(${param(list)}::text[])`;
          },
          siteId: (value, param) => `c.site_id = ${param(uuidOr400(value, 'siteId'))}::uuid`,
          // The complaint's own location, or its site's: everything at that place.
          locationId: (value, param) => `l.id = ${param(uuidOr400(value, 'locationId'))}::uuid`,
          categoryId: (value, param) => `c.category_id = ${param(uuidOr400(value, 'categoryId'))}::uuid`,
        },
        baseWhere: (param) => tabSql(tab, lazyMe(param, access.userId)),
      },
      { ...query, filters },
      access,
    );
  }

  async counts(access: AccessContext): Promise<Record<Tab, number>> {
    const { values, param } = params();
    const me = lazyMe(param, access.userId);
    const { rows } = await this.pool.query<Record<Tab, number>>(
      `select
         count(*) filter (where ${tabSql('assigned', me)})::int as assigned,
         count(*) filter (where ${tabSql('approval', me)})::int as approval,
         count(*) filter (where ${tabSql('raised', me)})::int as raised,
         count(*)::int as "all"
       from complaints c
       where ${scopeWhere(access, VIEW, 'complaint', 'c', param)}`,
      values,
    );
    return rows[0]!;
  }

  async summary(access: AccessContext): Promise<ComplaintSummary> {
    /** One statement over the visible complaints; each gets its own parameters. */
    const visibleQuery = <R extends object>(build: (visible: string, param: Param) => string) => {
      const { values, param } = params();
      const visible = scopeWhere(access, VIEW, 'complaint', 'c', param);
      return this.pool.query<R>(build(visible, param), values);
    };
    const [status, bySite, byCategory, ageing] = await Promise.all([
      visibleQuery<{ status: ComplaintStatus; n: number }>(
        (visible) => `select c.status, count(*)::int as n from complaints c where ${visible} group by c.status`,
      ),
      // Older, location-only complaints fall into one "No site" bucket
      // (id null), listed last, so the buckets still add up to byStatus.
      visibleQuery<{ site: SiteBucket; open: number; closed: number }>(
        (visible, param) =>
          `select json_build_object('id', st.id, 'name', coalesce(st.name, ${param(NO_SITE_NAME)}::text)) as site,
                count(*) filter (where c.status <> 'closed')::int as open,
                count(*) filter (where c.status = 'closed')::int as closed
         from complaints c left join sites st on st.id = c.site_id
         where ${visible}
         group by st.id, st.name
         order by (st.id is null), open desc, st.name`,
      ),
      visibleQuery<{ category: PersonRef; open: number; closed: number }>(
        (visible) =>
          `select json_build_object('id', cc.id, 'name', cc.name) as category,
                count(*) filter (where c.status <> 'closed')::int as open,
                count(*) filter (where c.status = 'closed')::int as closed
         from complaints c join complaint_categories cc on cc.id = c.category_id
         where ${visible}
         group by cc.id, cc.name
         order by open desc, cc.name`,
      ),
      visibleQuery<ComplaintSummary['openAgeing'] & { closedLast7Days: number }>(
        (visible) =>
          `select
           count(*) filter (where c.status <> 'closed' and ${AGE_DAYS_SQL} <= 2)::int as d0_2,
           count(*) filter (where c.status <> 'closed' and ${AGE_DAYS_SQL} between 3 and 7)::int as d3_7,
           count(*) filter (where c.status <> 'closed' and ${AGE_DAYS_SQL} between 8 and 14)::int as d8_14,
           count(*) filter (where c.status <> 'closed' and ${AGE_DAYS_SQL} >= 15)::int as d15plus,
           count(*) filter (where c.status = 'closed' and c.closed_at >= now() - interval '7 days')::int
             as "closedLast7Days"
         from complaints c
         where ${visible}`,
      ),
    ]);

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ComplaintStatus, number>;
    for (const row of status.rows) byStatus[row.status] = row.n;
    const { closedLast7Days, ...openAgeing } = ageing.rows[0]!;
    return {
      byStatus,
      bySite: bySite.rows,
      byCategory: byCategory.rows,
      openAgeing,
      closedLast7Days,
    };
  }

  /**
   * The raise form's site picker. Needs complaints access only: most
   * people who raise complaints have no budget access, and /sites does.
   * `supervisor`/`manager` are who routing would pick today, and
   * `reason` is the same sentence the raise 422 gives.
   *
   * The sites are those the caller may raise on: raise declares
   * `createSiteFrom: 'pick'` with the sites Pick at All (O5), so anyone
   * who may raise sees every site. The people joined are the site's
   * named supervisor and manager, shown on the site's own line.
   */
  async sites(access: AccessContext): Promise<{ data: ComplaintSite[] }> {
    const { values, param } = params();
    const { rows } = await this.pool.query<Omit<ComplaintSite, 'reason'>>(
      `select s.id, s.name,
              ${personOrNull('l')} as location,
              case when sv.active and sv.can_login then ${person('sv')} else null end as supervisor,
              case when mg.active and mg.can_login then ${person('mg')}
                   when up.active and up.can_login then ${person('up')}
                   else null end as manager,
              coalesce(sv.active and sv.can_login, false) as "canReceive"
       from sites s
       left join locations l on l.id = s.location_id
       left join users sv on sv.id = s.supervisor_id
       left join users mg on mg.id = s.manager_id
       left join users up on up.id = sv.reports_to
       where ${createSiteWhere(access, RAISE, 's.id', param)}
       order by s.name, s.id
       limit ${SITE_PICKER_LIMIT}`,
      values,
    );
    return {
      data: rows.map((r) => ({ ...r, reason: r.canReceive ? null : noSupervisorReason(r.name) })),
    };
  }

  /**
   * One complaint, through the view scope: outside it is the same 404
   * as a complaint that does not exist (R7), so its existence never
   * leaks. Photos and events follow that scoped read.
   */
  async detail(_user: AuthUser, access: AccessContext, id: string): Promise<ComplaintDetail> {
    const loaded = await this.loadCore(this.pool, access, id);
    if (!loaded) throw new NotFoundException(NOT_FOUND);
    const { may: _may, ...core } = loaded;

    const [photos, events] = await Promise.all([
      this.pool.query<ComplaintDetail['photos'][number]>(
        `select p.id, p.stage, p.content_type as "contentType", p.uploaded_at as "uploadedAt",
                ${person('u')} as "uploadedBy"
         from complaint_photos p join users u on u.id = p.uploaded_by
         /*scope-exempt: the photos of one complaint, after its scoped read (loadCore); uploader names only*/
         where p.complaint_id = $1
         order by p.uploaded_at, p.stage, p.storage_key`,
        [id],
      ),
      this.pool.query<ComplaintDetail['events'][number]>(
        `select e.id, e.kind, ${personOrNull('a')} as actor, e.note,
                e.from_status as "fromStatus", e.to_status as "toStatus", e.payload, e.at
         from complaint_events e left join users a on a.id = e.actor_id
         /*scope-exempt: the timeline of one complaint, after its scoped read (loadCore); actor names only*/
         where e.complaint_id = $1
         order by e.at, e.id`,
        [id],
      ),
    ]);

    return { ...core, photos: photos.rows, events: events.rows, ...answersFor(access, loaded) };
  }

  /** Visibility first, then the photo; either missing is the same 404. */
  async photo(
    access: AccessContext,
    id: string,
    photoId: string,
  ): Promise<{ stream: Readable; contentType: string; bytes: number | undefined }> {
    await assertRecordAccess(this.pool, access, {
      table: 'complaints', alias: 'c', record: 'complaint', id, view: VIEW, notFound: NOT_FOUND,
    });

    const { rows } = await this.pool.query<{ storage_key: string; content_type: string }>(
      `select storage_key, content_type from complaint_photos
       /*scope-exempt: one photo of one complaint, after assertRecordAccess on that complaint*/
       where id = $1 and complaint_id = $2`,
      [photoId, id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('That photo no longer exists. Refresh the complaint.');

    // 404 when the bytes are gone, 503 when the store is unreachable.
    const { stream, bytes } = await openStored(row.storage_key);
    return { stream, contentType: row.content_type, bytes };
  }

  // -------------------------------------------------------------------
  // Raise
  // -------------------------------------------------------------------

  async raise(
    user: AuthUser,
    access: AccessContext,
    body: RaiseComplaintDto,
    files: UploadedPhoto[] | undefined,
  ): Promise<ComplaintDetail> {
    const photos = checkPhotos(files, { min: 0, max: MAX_PHOTOS });
    if (body.complainantPhone.replace(/\D/g, '').length < 10) {
      throw new UnprocessableEntityException(
        `"${body.complainantPhone}" is not a full phone number. Enter all 10 digits, like 98250 12345.`,
      );
    }

    let stored: StoredPhoto[] = [];
    let id: string;
    try {
      id = await this.inTransaction(async (client) => {
        // The site must be one the caller may raise on (O5): raise checks
        // it against the sites Pick it declares at All, so any site.
        const siteParams = params([body.siteId]);
        const { rows: siteRows } = await client.query<{ id: string; name: string; allowed: boolean }>(
          `select s.id, s.name,
                  coalesce(${createSiteWhere(access, RAISE, 's.id', siteParams.param)}, false) as allowed
           from sites s where s.id = $1`,
          siteParams.values,
        );
        const found = siteRows[0];
        if (!found) {
          throw new UnprocessableEntityException('That site no longer exists. Choose another one.');
        }
        if (!found.allowed) {
          const reason = `You can raise complaints only on sites you can choose from, and ${found.name} is not one of them. Choose another site.`;
          throw new ForbiddenException({ error: 'forbidden', permission: RAISE, reason, message: reason });
        }
        const site = { id: found.id, name: found.name };
        const { rows: catRows } = await client.query<{
          id: string; name: string; is_active: boolean; requires_approval: boolean;
          approver_designation_id: string | null;
        }>(
          `select id, name, is_active, requires_approval, approver_designation_id
           from complaint_categories where id = $1`,
          [body.categoryId],
        );
        const category = catRows[0];
        if (!category) {
          throw new UnprocessableEntityException('That category no longer exists. Choose another one.');
        }
        if (!category.is_active) {
          throw new UnprocessableEntityException(
            `${category.name} is no longer in use. Choose another category.`,
          );
        }

        const routing = await resolveRouting(client, {
          site,
          // The raiser is never chosen as the approver (O10 Q11, D6).
          raisedBy: user.id,
          category: {
            id: category.id,
            name: category.name,
            requiresApproval: category.requires_approval,
            approverDesignationId: category.approver_designation_id,
          },
        });

        // The reference and year name the photo folder, so the row goes in
        // first. If anything after this fails the transaction rolls back
        // and the number is burned, as the sequence always allowed.
        const { rows } = await client.query<{ id: string; reference: string; year: number }>(
          `insert into complaints as c
             (site_id, category_id, complainant_name, complainant_phone, location_note,
              description, requires_approval, raised_by,
              supervisor_id, manager_id, hod_id, ceo_id, approver_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           returning c.id, ${REFERENCE_SQL} as reference, ${RAISED_YEAR_SQL} as year`,
          [
            site.id, category.id, body.complainantName, body.complainantPhone,
            body.locationNote || null, body.description, category.requires_approval, user.id,
            routing.supervisor.id, routing.manager?.id ?? null, routing.hod?.id ?? null,
            routing.ceo?.id ?? null, routing.approver?.id ?? null,
          ],
        );
        const created = rows[0]!;

        // A new complaint has no photos yet, and its number is never
        // reused, so nobody else can pick these names.
        stored = await storePhotos(photos, {
          year: created.year,
          reference: created.reference,
          stage: 'raise',
          existingKeys: [],
        });
        await this.insertPhotos(client, created.id, 'raise', stored, user.id);

        await this.event(client, created.id, 'raised', user.id, null, null, 'open', {
          site,
          routing,
          photoCount: stored.length,
        });

        const what = `${category.name} at ${site.name}`;
        await notify(client, created.id, user.id, short(body.description), [
          { userId: routing.supervisor.id, kind: 'assigned', title: `New complaint ${created.reference} for you: ${what}` },
          { userId: routing.manager?.id, kind: 'copied', title: `${created.reference} raised: ${what}` },
          { userId: routing.hod?.id, kind: 'copied', title: `${created.reference} raised: ${what}` },
          { userId: routing.ceo?.id, kind: 'copied', title: `${created.reference} raised: ${what}` },
        ]);
        return created.id;
      });
    } catch (error) {
      await removeStored(stored);
      throw error;
    }
    return this.detail(user, access, id);
  }

  // -------------------------------------------------------------------
  // Actions. Each: lock, visibility, the one permission function,
  // change, event, notifications — in one transaction.
  // -------------------------------------------------------------------

  start(user: AuthUser, access: AccessContext, id: string): Promise<ComplaintDetail> {
    return this.act(user, access, id, 'start', async (client, c) => {
      await client.query(
        `update complaints /*scope-exempt: follows the scoped, locked read of this complaint (act)*/
         set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
         where id = $1`,
        [id],
      );
      await this.event(client, id, 'started', user.id, null, c.status, 'in_progress');
    });
  }

  async resolve(
    user: AuthUser,
    access: AccessContext,
    id: string,
    resolutionNote: string | undefined,
    files: UploadedPhoto[] | undefined,
  ): Promise<ComplaintDetail> {
    let stored: StoredPhoto[] = [];
    return this.act(
      user, access, id, 'resolve',
      async (client, c) => {
        const note = requireNote(
          resolutionNote,
          'Add a resolution note saying what was done. Resolving needs a note.',
        );
        const photos = checkPhotos(files, { min: 1, max: MAX_PHOTOS });
        const to: ComplaintStatus = c.requiresApproval ? 'awaiting_approval' : 'closed';

        await client.query(
          `update complaints /*scope-exempt: follows the scoped, locked read of this complaint (act)*/
           set status = $2, resolution_note = $3, resolved_at = now(), resolved_by = $4,
               closed_at = case when $2 = 'closed' then now() else null end,
               closed_by = case when $2 = 'closed' then $4::uuid else null end,
               updated_at = now()
           where id = $1`,
          [id, to, note, user.id],
        );
        // Numbered after any earlier resolution's photos; act() holds the
        // row lock, so no other resolve can choose the same names.
        stored = await storePhotos(photos, await this.photoPlace(client, id, 'resolve'));
        await this.insertPhotos(client, id, 'resolve', stored, user.id);
        await this.event(client, id, 'resolved', user.id, note, c.status, to, {
          photoCount: stored.length,
          closedWithoutApproval: to === 'closed',
        });

        await notify(client, id, user.id, short(note), to === 'closed'
          ? [{ userId: c.raisedBy.id, kind: 'closed', title: `${c.reference} was resolved and closed by ${user.name}` }]
          : [{ userId: c.approver?.id, kind: 'approval_needed', title: `${c.reference} is resolved and waiting for your approval` }]);
      },
      // A refused or failed resolve leaves no orphan files behind. Run
      // before the rollback releases the lock: the next resolve reuses
      // these names, and a late delete would remove its photos instead.
      () => removeStored(stored),
    );
  }

  approve(user: AuthUser, access: AccessContext, id: string, noteRaw: string | undefined): Promise<ComplaintDetail> {
    return this.act(user, access, id, 'approve', async (client, c) => {
      const note = noteRaw?.trim() || null;
      await client.query(
        `update complaints /*scope-exempt: follows the scoped, locked read of this complaint (act)*/
         set status = 'closed', closed_at = now(), closed_by = $2, updated_at = now()
         where id = $1`,
        [id, user.id],
      );
      await this.event(client, id, 'approved', user.id, note, c.status, 'closed');
      await notify(client, id, user.id, note, [
        { userId: c.supervisor.id, kind: 'approved', title: `${c.reference} was approved and closed by ${user.name}` },
        { userId: c.raisedBy.id, kind: 'closed', title: `${c.reference} was approved and closed by ${user.name}` },
      ]);
    });
  }

  sendBack(user: AuthUser, access: AccessContext, id: string, noteRaw: string | undefined): Promise<ComplaintDetail> {
    return this.act(user, access, id, 'sendBack', async (client, c) => {
      const note = requireNote(
        noteRaw,
        'Add a note saying what still needs to be done. Sending back needs a note.',
      );
      // The previous resolution stays in the timeline (its event and
      // photos); the row goes back to "being worked on".
      await client.query(
        `update complaints /*scope-exempt: follows the scoped, locked read of this complaint (act)*/
         set status = 'in_progress', resolution_note = null, resolved_at = null, resolved_by = null,
             updated_at = now()
         where id = $1`,
        [id],
      );
      await this.event(client, id, 'sent_back', user.id, note, c.status, 'in_progress');
      await notify(client, id, user.id, short(note), [
        { userId: c.supervisor.id, kind: 'sent_back', title: `${c.reference} was sent back by ${user.name}` },
      ]);
    });
  }

  reassign(user: AuthUser, access: AccessContext, id: string, body: ReassignDto): Promise<ComplaintDetail> {
    return this.act(user, access, id, 'reassign', async (client, c) => {
      const note = requireNote(
        body.note,
        'Add a note saying why it is being reassigned. Reassigning needs a note.',
      );
      // The new supervisor is chosen through the people Pick, which the
      // reassign key needs at All: anyone the caller may pick.
      const targetQuery = params([body.supervisorId]);
      const { rows } = await client.query<{
        id: string; name: string; can_receive: boolean; seed_key: string | null;
      }>(
        `select u.id, u.name, (u.active and u.can_login) as can_receive, d.seed_key
         from users u left join designations d on d.id = u.designation_id
         where u.id = $1 and ${scopeWhere(access, PEOPLE_PICK, 'person', 'u', targetQuery.param)}`,
        targetQuery.values,
      );
      const target = rows[0];
      if (!target) {
        throw new UnprocessableEntityException('That person no longer exists. Choose another supervisor.');
      }
      if (target.seed_key !== 'supervisor') {
        throw new UnprocessableEntityException(
          `${target.name} doesn't hold the Supervisor designation, so they can't take complaints. Choose a supervisor.`,
        );
      }
      if (!target.can_receive) {
        throw new UnprocessableEntityException(
          `${target.name} can't sign in, so they couldn't work on this complaint. Choose another supervisor, or give them a login first.`,
        );
      }
      if (target.id === c.supervisor.id) {
        throw new UnprocessableEntityException(`${target.name} is already the supervisor on this complaint.`);
      }

      await client.query(
        `update complaints /*scope-exempt: follows the scoped, locked read of this complaint (act)*/
         set supervisor_id = $2, updated_at = now() where id = $1`,
        [id, target.id],
      );
      const to = { id: target.id, name: target.name };
      await this.event(client, id, 'reassigned', user.id, note, null, null, {
        from: c.supervisor,
        to,
      });
      await notify(client, id, user.id, short(note), [
        { userId: to.id, kind: 'assigned', title: `${c.reference} was reassigned to you by ${user.name}` },
        { userId: c.supervisor.id, kind: 'reassigned_away', title: `${c.reference} was reassigned to ${to.name}` },
      ]);
    });
  }

  comment(user: AuthUser, access: AccessContext, id: string, noteRaw: string | undefined): Promise<ComplaintDetail> {
    return this.act(user, access, id, 'comment', async (client) => {
      const note = requireNote(noteRaw, 'Type a comment before sending it.');
      await this.event(client, id, 'comment', user.id, note, null, null);
    });
  }

  // -------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------

  /**
   * @param onFailure undoes work outside the database (stored photos).
   *   Runs while the row is still locked, before the rollback, when
   *   `run` fails; or after the fact if the commit itself fails. Once.
   */
  private async act(
    user: AuthUser,
    access: AccessContext,
    id: string,
    action: ActionName,
    run: (client: PoolClient, c: DetailCore) => Promise<void>,
    onFailure?: () => Promise<void>,
  ): Promise<ComplaintDetail> {
    let undone = false;
    const undo = async (): Promise<void> => {
      if (undone) return;
      undone = true;
      await onFailure?.();
    };
    try {
      await this.inTransaction(async (client) => {
        // 1. Visibility (404) and 2. permission (403), in one locked read
        // (plan 6.1.4 item 4, 6.2): outside the view scope is the same
        // 404 as a missing complaint; visible but outside the action's
        // scope (reassign at Own: not its manager or HOD) is 403.
        await assertRecordAccess(client, access, {
          table: 'complaints', alias: 'c', record: 'complaint', id,
          view: VIEW, action: ACTION_KEY[action], notFound: NOT_FOUND, forUpdate: true,
        });
        const c = await this.loadCore(client, access, id, true);
        if (!c) throw new NotFoundException(NOT_FOUND);
        // 3. The workflow (permissions.ts, decision 27), on the permission
        // layer's answers for this complaint: is this person the
        // supervisor or the approver on THIS complaint, not its raiser or
        // resolver when approving, and does its status allow it. The
        // same function the detail's `can` comes from.
        const viewer = viewerOf(access, c);
        const check = checkAction(action, viewer, c);
        if (!check.allowed) throw await this.refusal(client, id, action, viewer, check);
        try {
          await run(client, c);
        } catch (error) {
          await undo();
          throw error;
        }
      });
    } catch (error) {
      await undo();
      throw error;
    }
    return this.detail(user, access, id);
  }

  /**
   * The folder (raised year + reference) and the keys already stored for
   * one stage of a complaint, for photo-storage's `<stage>-<n>` numbering.
   * Call with the complaint's row locked.
   */
  private async photoPlace(
    client: PoolClient,
    complaintId: string,
    stage: PhotoStage,
  ): Promise<PhotoPlace> {
    const { rows } = await client.query<{ year: number; reference: string; keys: string[] }>(
      `select ${RAISED_YEAR_SQL} as year, ${REFERENCE_SQL} as reference,
              array(select p.storage_key from complaint_photos p
                    where p.complaint_id = c.id and p.stage = $2) as keys
       from complaints c /*scope-exempt: the complaint act() has already read through its scope and locked*/
       where c.id = $1`,
      [complaintId, stage],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(NOT_FOUND);
    return { year: row.year, reference: row.reference, stage, existingKeys: row.keys };
  }

  /**
   * The route's answer when the workflow function says no (plan 6.1.10):
   *   permission    403 naming the key (the scoped read normally said so first);
   *   person        403 with the same sentence the disabled button shows (L1 until P11);
   *   self          409 blocked: the approver raised or resolved it (D6, R7);
   *   notApplicable 422 (L2 until P11);
   *   status        409, naming who moved it, because the caller's
   *                 screen was stale.
   */
  private async refusal(
    client: PoolClient,
    id: string,
    action: ActionName,
    viewer: Viewer,
    check: ActionCheck,
  ): Promise<Error> {
    const reason = check.reason ?? 'That action is not available.';
    if (check.failure === 'permission') {
      const permission = ACTION_KEY[action];
      return new ForbiddenException({ error: 'forbidden', permission, reason, message: reason });
    }
    if (check.failure === 'person') return new ForbiddenException(reason);
    if (check.failure === 'self') return blocked(reason);
    if (check.failure === 'notApplicable') return new UnprocessableEntityException(reason);

    const { rows } = await client.query<{ kind: string; actor_id: string | null; name: string | null }>(
      `select e.kind, e.actor_id, a.name
       from complaint_events e left join users a on a.id = e.actor_id
       /*scope-exempt: the last move of the complaint act() has already read through its scope*/
       where e.complaint_id = $1 and e.to_status is not null
       order by e.at desc, e.id desc
       limit 1`,
      [id],
    );
    const last = rows[0];
    const verb = last ? EVENT_VERB[last.kind] : undefined;
    if (!last || !verb) {
      // Nothing has moved it since it was raised: not stale, just not
      // applicable yet. Still a 409, with the state explained.
      return new ConflictException(`${reason} Refresh to see its current state.`);
    }
    const who = last.actor_id === viewer.id ? 'you' : (last.name ?? 'someone else');
    return new ConflictException(
      `This complaint was already ${verb} by ${who}. Refresh to see its current state.`,
    );
  }

  /**
   * One complaint through the view scope, with the permission layer's
   * answers for it (`may`), in one query. Null when it does not exist OR
   * is outside the caller's view scope: the caller answers both with the
   * same 404.
   */
  private async loadCore(
    db: Pool | PoolClient,
    access: AccessContext,
    id: string,
    lock = false,
  ): Promise<(DetailCore & PermissionSubject) | null> {
    const { values, param } = params([id]);
    const visible = scopeWhere(access, VIEW, 'complaint', 'c', param);
    const may = canSelect(access, CAN_ACTIONS, 'complaint', 'c', param);
    const { rows } = await db.query<DetailCore>(
      `select ${DETAIL_SELECT}, ${may} as "may"
       from ${DETAIL_FROM}
       where c.id = $1 and coalesce(${visible}, false)
       ${lock ? 'for update of c' : ''}`,
      values,
    );
    return rows[0] ?? null;
  }

  private async insertPhotos(
    client: PoolClient,
    complaintId: string,
    stage: 'raise' | 'resolve',
    stored: StoredPhoto[],
    userId: string,
  ): Promise<void> {
    for (const s of stored) {
      await client.query(
        `insert into complaint_photos
           (complaint_id, stage, storage_key, content_type, bytes, original_name, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [complaintId, stage, s.storageKey, s.contentType, s.bytes, s.originalName, userId],
      );
    }
  }

  private async event(
    client: PoolClient,
    complaintId: string,
    kind: string,
    actorId: string,
    note: string | null,
    fromStatus: string | null,
    toStatus: string | null,
    payload?: unknown,
  ): Promise<void> {
    await client.query(
      `insert into complaint_events (complaint_id, kind, actor_id, note, from_status, to_status, payload)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [complaintId, kind, actorId, note, fromStatus, toStatus,
        payload === undefined ? null : JSON.stringify(payload)],
    );
  }

  private async inTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await run(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

function uuidOr400(value: string, name: string): string {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException(`${name} must be an id from the list.`);
  }
  return value;
}
