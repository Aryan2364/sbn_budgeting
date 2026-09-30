import type { ReadStream } from 'node:fs';

import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthUser } from '../common/current-user';
import type { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { PG_POOL } from '../db/db.module';
import { notify } from '../notifications/notify';
import type { RaiseComplaintDto, ReassignDto } from './complaints.dto';
import {
  allActions, canSee, checkAction, type ActionCheck, type ActionName, type ComplaintStatus,
  type PermissionSubject, type PersonRef, type Viewer,
} from './permissions';
import {
  checkPhotos, MAX_PHOTOS, openStored, removeStored, storedSize, storePhotos, type StoredPhoto,
  type UploadedPhoto,
} from './photo-storage';
import { resolveRouting } from './routing';

// ---------------------------------------------------------------------
// Shapes (CONTRACT section 3)
// ---------------------------------------------------------------------

export interface ComplaintRow {
  id: string;
  number: number;
  reference: string;
  status: ComplaintStatus;
  category: PersonRef;
  location: PersonRef;
  description: string;
  complainantName: string;
  raisedAt: string;
  raisedBy: PersonRef;
  supervisor: PersonRef;
  ageDays: number;
  photoCount: number;
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
  actions: Record<ActionName, { allowed: boolean; reason: string | null }>;
}

export type Tab = 'assigned' | 'approval' | 'raised' | 'all';
export const TABS: Tab[] = ['assigned', 'approval', 'raised', 'all'];
const STATUSES: ComplaintStatus[] = ['open', 'in_progress', 'awaiting_approval', 'closed'];

export interface ComplaintSummary {
  byStatus: Record<ComplaintStatus, number>;
  byLocation: Array<{ location: PersonRef; open: number; closed: number }>;
  byCategory: Array<{ category: PersonRef; open: number; closed: number }>;
  openAgeing: { d0_2: number; d3_7: number; d8_14: number; d15plus: number };
  closedLast7Days: number;
}

/** The row's core plus the ids the permission function reads. */
type DetailCore = Omit<ComplaintDetail, 'photos' | 'events' | 'actions'>;

// ---------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------

const person = (alias: string): string =>
  `json_build_object('id', ${alias}.id, 'name', ${alias}.name)`;
const personOrNull = (alias: string): string =>
  `case when ${alias}.id is null then null else ${person(alias)} end`;

const REFERENCE_SQL = `('C-' || lpad(c.number::text, 6, '0'))`;
/** Whole days since raised, or raised -> closed once closed. */
const AGE_DAYS_SQL =
  `floor(extract(epoch from (coalesce(c.closed_at, now()) - c.raised_at)) / 86400)::int`;

const ROW_FROM = `
  complaints c
  join complaint_categories cc on cc.id = c.category_id
  join locations l on l.id = c.location_id
  join users rb on rb.id = c.raised_by
  join users sv on sv.id = c.supervisor_id`;

const ROW_SELECT = `
  c.id, c.number::int as number, ${REFERENCE_SQL} as reference, c.status,
  json_build_object('id', cc.id, 'name', cc.name) as category,
  json_build_object('id', l.id, 'name', l.name) as location,
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

/**
 * Visibility (CONTRACT section 3) as a WHERE fragment over `c`. The id
 * is inlined because runListQuery's baseWhere takes no parameters; it
 * is the signed-in user's own id from the database, and is checked to
 * be a uuid anyway so nothing else can ever reach the SQL.
 */
function meSql(viewer: Viewer): string {
  if (!UUID_RE.test(viewer.id)) throw new Error('viewer id is not a uuid');
  return `'${viewer.id}'::uuid`;
}

function visibleSql(viewer: Viewer): string {
  if (viewer.isComplaintsAdmin) return 'true';
  const me = meSql(viewer);
  return `(c.raised_by = ${me} or c.supervisor_id = ${me} or c.manager_id = ${me}
           or c.hod_id = ${me} or c.ceo_id = ${me} or c.approver_id = ${me})`;
}

/** The tab's own condition, on top of visibility. `counts` uses the same text. */
function tabSql(tab: Tab, viewer: Viewer): string {
  const me = meSql(viewer);
  switch (tab) {
    case 'assigned': return `c.supervisor_id = ${me} and c.status in ('open', 'in_progress')`;
    case 'approval': return `c.approver_id = ${me} and c.status = 'awaiting_approval'`;
    case 'raised': return `c.raised_by = ${me}`;
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

export function toViewer(user: AuthUser): Viewer {
  return { id: user.id, isComplaintsAdmin: user.modules.complaints === 'admin' };
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
    user: AuthUser,
    query: ListQueryDto,
    tabRaw: string | undefined,
    filters: { status?: string; locationId?: string; categoryId?: string },
  ): Promise<ListResult<ComplaintRow & MatchInfo>> {
    const tab = (tabRaw ?? 'all') as Tab;
    if (!TABS.includes(tab)) {
      throw new BadRequestException(`Unknown tab "${tabRaw}". Use one of: ${TABS.join(', ')}.`);
    }
    const viewer = toViewer(user);
    return runListQuery<ComplaintRow>(
      this.pool,
      {
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
          locationId: (value, param) => `c.location_id = ${param(uuidOr400(value, 'locationId'))}::uuid`,
          categoryId: (value, param) => `c.category_id = ${param(uuidOr400(value, 'categoryId'))}::uuid`,
        },
        baseWhere: `${visibleSql(viewer)} and ${tabSql(tab, viewer)}`,
      },
      { ...query, filters },
    );
  }

  async counts(user: AuthUser): Promise<Record<Tab, number>> {
    const viewer = toViewer(user);
    const { rows } = await this.pool.query<Record<Tab, number>>(
      `select
         count(*) filter (where ${tabSql('assigned', viewer)})::int as assigned,
         count(*) filter (where ${tabSql('approval', viewer)})::int as approval,
         count(*) filter (where ${tabSql('raised', viewer)})::int as raised,
         count(*)::int as "all"
       from complaints c
       where ${visibleSql(viewer)}`,
    );
    return rows[0]!;
  }

  async summary(user: AuthUser): Promise<ComplaintSummary> {
    const visible = visibleSql(toViewer(user));
    const [status, byLocation, byCategory, ageing] = await Promise.all([
      this.pool.query<{ status: ComplaintStatus; n: number }>(
        `select c.status, count(*)::int as n from complaints c where ${visible} group by c.status`,
      ),
      this.pool.query<{ location: PersonRef; open: number; closed: number }>(
        `select json_build_object('id', l.id, 'name', l.name) as location,
                count(*) filter (where c.status <> 'closed')::int as open,
                count(*) filter (where c.status = 'closed')::int as closed
         from complaints c join locations l on l.id = c.location_id
         where ${visible}
         group by l.id, l.name
         order by open desc, l.name`,
      ),
      this.pool.query<{ category: PersonRef; open: number; closed: number }>(
        `select json_build_object('id', cc.id, 'name', cc.name) as category,
                count(*) filter (where c.status <> 'closed')::int as open,
                count(*) filter (where c.status = 'closed')::int as closed
         from complaints c join complaint_categories cc on cc.id = c.category_id
         where ${visible}
         group by cc.id, cc.name, cc.sort_order
         order by open desc, cc.sort_order, cc.name`,
      ),
      this.pool.query<ComplaintSummary['openAgeing'] & { closedLast7Days: number }>(
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
      byLocation: byLocation.rows,
      byCategory: byCategory.rows,
      openAgeing,
      closedLast7Days,
    };
  }

  async detail(user: AuthUser, id: string): Promise<ComplaintDetail> {
    const viewer = toViewer(user);
    const core = await this.loadCore(this.pool, id);
    if (!core || !canSee(viewer, core)) throw new NotFoundException(NOT_FOUND);

    const [photos, events] = await Promise.all([
      this.pool.query<ComplaintDetail['photos'][number]>(
        `select p.id, p.stage, p.content_type as "contentType", p.uploaded_at as "uploadedAt",
                ${person('u')} as "uploadedBy"
         from complaint_photos p join users u on u.id = p.uploaded_by
         where p.complaint_id = $1
         order by p.uploaded_at, p.stage, p.storage_key`,
        [id],
      ),
      this.pool.query<ComplaintDetail['events'][number]>(
        `select e.id, e.kind, ${personOrNull('a')} as actor, e.note,
                e.from_status as "fromStatus", e.to_status as "toStatus", e.payload, e.at
         from complaint_events e left join users a on a.id = e.actor_id
         where e.complaint_id = $1
         order by e.at, e.id`,
        [id],
      ),
    ]);

    return { ...core, photos: photos.rows, events: events.rows, actions: allActions(viewer, core) };
  }

  /** Visibility first, then the photo; either missing is the same 404. */
  async photo(
    user: AuthUser,
    id: string,
    photoId: string,
  ): Promise<{ stream: ReadStream; contentType: string; bytes: number }> {
    const core = await this.loadCore(this.pool, id);
    if (!core || !canSee(toViewer(user), core)) throw new NotFoundException(NOT_FOUND);

    const { rows } = await this.pool.query<{ storage_key: string; content_type: string }>(
      `select storage_key, content_type from complaint_photos where id = $1 and complaint_id = $2`,
      [photoId, id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('That photo no longer exists. Refresh the complaint.');

    const bytes = await storedSize(row.storage_key);
    if (bytes === null) {
      throw new NotFoundException(
        "That photo's file is missing on the server. Ask an admin to check the uploads folder.",
      );
    }
    return { stream: openStored(row.storage_key), contentType: row.content_type, bytes };
  }

  // -------------------------------------------------------------------
  // Raise
  // -------------------------------------------------------------------

  async raise(
    user: AuthUser,
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
        const location = await this.activeMaster(
          client, 'locations', body.locationId, 'location',
        );
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
          location,
          category: {
            id: category.id,
            name: category.name,
            requiresApproval: category.requires_approval,
            approverDesignationId: category.approver_designation_id,
          },
        });

        const { rows } = await client.query<{ id: string; reference: string }>(
          `insert into complaints
             (location_id, category_id, complainant_name, complainant_phone, location_note,
              description, requires_approval, raised_by,
              supervisor_id, manager_id, hod_id, ceo_id, approver_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           returning id, 'C-' || lpad(number::text, 6, '0') as reference`,
          [
            location.id, category.id, body.complainantName, body.complainantPhone,
            body.locationNote || null, body.description, category.requires_approval, user.id,
            routing.supervisor.id, routing.manager?.id ?? null, routing.hod?.id ?? null,
            routing.ceo?.id ?? null, routing.approver?.id ?? null,
          ],
        );
        const created = rows[0]!;

        stored = await storePhotos(photos);
        await this.insertPhotos(client, created.id, 'raise', stored, user.id);

        await this.event(client, created.id, 'raised', user.id, null, null, 'open', {
          routing,
          photoCount: stored.length,
        });

        const what = `${category.name} at ${location.name}`;
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
    return this.detail(user, id);
  }

  // -------------------------------------------------------------------
  // Actions. Each: lock, visibility, the one permission function,
  // change, event, notifications — in one transaction.
  // -------------------------------------------------------------------

  start(user: AuthUser, id: string): Promise<ComplaintDetail> {
    return this.act(user, id, 'start', async (client, c) => {
      await client.query(
        `update complaints set status = 'in_progress', started_at = coalesce(started_at, now()),
                updated_at = now()
         where id = $1`,
        [id],
      );
      await this.event(client, id, 'started', user.id, null, c.status, 'in_progress');
    });
  }

  async resolve(
    user: AuthUser,
    id: string,
    resolutionNote: string | undefined,
    files: UploadedPhoto[] | undefined,
  ): Promise<ComplaintDetail> {
    let stored: StoredPhoto[] = [];
    return this.act(
      user, id, 'resolve',
      async (client, c) => {
        const note = requireNote(
          resolutionNote,
          'Add a resolution note saying what was done. Resolving needs a note.',
        );
        const photos = checkPhotos(files, { min: 1, max: MAX_PHOTOS });
        const to: ComplaintStatus = c.requiresApproval ? 'awaiting_approval' : 'closed';

        await client.query(
          `update complaints
           set status = $2, resolution_note = $3, resolved_at = now(), resolved_by = $4,
               closed_at = case when $2 = 'closed' then now() else null end,
               closed_by = case when $2 = 'closed' then $4::uuid else null end,
               updated_at = now()
           where id = $1`,
          [id, to, note, user.id],
        );
        stored = await storePhotos(photos);
        await this.insertPhotos(client, id, 'resolve', stored, user.id);
        await this.event(client, id, 'resolved', user.id, note, c.status, to, {
          photoCount: stored.length,
          closedWithoutApproval: to === 'closed',
        });

        await notify(client, id, user.id, short(note), to === 'closed'
          ? [{ userId: c.raisedBy.id, kind: 'closed', title: `${c.reference} was resolved and closed by ${user.name}` }]
          : [{ userId: c.approver?.id, kind: 'approval_needed', title: `${c.reference} is resolved and waiting for your approval` }]);
      },
      // A refused or failed resolve leaves no orphan files behind.
      () => removeStored(stored),
    );
  }

  approve(user: AuthUser, id: string, noteRaw: string | undefined): Promise<ComplaintDetail> {
    return this.act(user, id, 'approve', async (client, c) => {
      const note = noteRaw?.trim() || null;
      await client.query(
        `update complaints set status = 'closed', closed_at = now(), closed_by = $2, updated_at = now()
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

  sendBack(user: AuthUser, id: string, noteRaw: string | undefined): Promise<ComplaintDetail> {
    return this.act(user, id, 'sendBack', async (client, c) => {
      const note = requireNote(
        noteRaw,
        'Add a note saying what still needs to be done. Sending back needs a note.',
      );
      // The previous resolution stays in the timeline (its event and
      // photos); the row goes back to "being worked on".
      await client.query(
        `update complaints
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

  reassign(user: AuthUser, id: string, body: ReassignDto): Promise<ComplaintDetail> {
    return this.act(user, id, 'reassign', async (client, c) => {
      const note = requireNote(
        body.note,
        'Add a note saying why it is being reassigned. Reassigning needs a note.',
      );
      const { rows } = await client.query<{
        id: string; name: string; can_login: boolean; seed_key: string | null;
      }>(
        `select u.id, u.name, u.can_login, d.seed_key
         from users u left join designations d on d.id = u.designation_id
         where u.id = $1`,
        [body.supervisorId],
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
      if (!target.can_login) {
        throw new UnprocessableEntityException(
          `${target.name} can't sign in, so they couldn't work on this complaint. Choose another supervisor, or give them a login first.`,
        );
      }
      if (target.id === c.supervisor.id) {
        throw new UnprocessableEntityException(`${target.name} is already the supervisor on this complaint.`);
      }

      await client.query(
        `update complaints set supervisor_id = $2, updated_at = now() where id = $1`,
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

  comment(user: AuthUser, id: string, noteRaw: string | undefined): Promise<ComplaintDetail> {
    return this.act(user, id, 'comment', async (client) => {
      const note = requireNote(noteRaw, 'Type a comment before sending it.');
      await this.event(client, id, 'comment', user.id, note, null, null);
    });
  }

  // -------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------

  private async act(
    user: AuthUser,
    id: string,
    action: ActionName,
    run: (client: PoolClient, c: DetailCore) => Promise<void>,
    onRollback?: () => Promise<void>,
  ): Promise<ComplaintDetail> {
    try {
      await this.inTransaction(async (client) => {
        const viewer = toViewer(user);
        const c = await this.loadCore(client, id, true);
        if (!c || !canSee(viewer, c)) throw new NotFoundException(NOT_FOUND);
        const check = checkAction(action, viewer, c);
        if (!check.allowed) throw await this.refusal(client, id, viewer, check);
        await run(client, c);
      });
    } catch (error) {
      await onRollback?.();
      throw error;
    }
    return this.detail(user, id);
  }

  /**
   * The route's answer when the permission function says no:
   *   person        403 with the same sentence the disabled button shows;
   *   notApplicable 422;
   *   status        409, naming who moved it, because the caller's
   *                 screen was stale.
   */
  private async refusal(
    client: PoolClient,
    id: string,
    viewer: Viewer,
    check: ActionCheck,
  ): Promise<Error> {
    const reason = check.reason ?? 'That action is not available.';
    if (check.failure === 'person') return new ForbiddenException(reason);
    if (check.failure === 'notApplicable') return new UnprocessableEntityException(reason);

    const { rows } = await client.query<{ kind: string; actor_id: string | null; name: string | null }>(
      `select e.kind, e.actor_id, a.name
       from complaint_events e left join users a on a.id = e.actor_id
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

  private async loadCore(
    db: Pool | PoolClient,
    id: string,
    lock = false,
  ): Promise<(DetailCore & PermissionSubject) | null> {
    const { rows } = await db.query<DetailCore>(
      `select ${DETAIL_SELECT} from ${DETAIL_FROM} where c.id = $1 ${lock ? 'for update of c' : ''}`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async activeMaster(
    client: PoolClient,
    table: 'locations',
    id: string,
    what: string,
  ): Promise<{ id: string; name: string }> {
    const { rows } = await client.query<{ id: string; name: string; is_active: boolean }>(
      `select id, name, is_active from ${table} where id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw new UnprocessableEntityException(`That ${what} no longer exists. Choose another one.`);
    }
    if (!row.is_active) {
      throw new UnprocessableEntityException(`${row.name} is no longer in use. Choose another ${what}.`);
    }
    return { id: row.id, name: row.name };
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
