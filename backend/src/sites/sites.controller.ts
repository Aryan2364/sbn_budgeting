import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import type { Pool } from 'pg';

import {
  buildUpdate,
  isPgError,
  pgConstraint,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
} from '../common/crud';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo, type WithCan } from '../common/list-query';
import { type AccessContext, CurrentAccess, can } from '../access/access-context';
import type { PermissionKey } from '../access/catalogue';
import { writeAudit } from '../access/audit';
import { AlsoChecks, Can } from '../access/decorators';
import { reasonFor } from '../access/permission.guard';
import { type Queryable, assertRecordAccess, canSelect, recordReason, scopeWhere } from '../access/scope';
import {
  assertProjectPickable,
  forbidden,
  inTransaction,
  notFound,
  params,
} from './budget-access';
import { PG_POOL } from '../db/db.module';

export class SiteDto {
  /**
   * OPTIONAL (client instruction, 23 Sep 2026). A site may belong to a
   * project and may equally stand alone; the client is not expected to
   * create projects at all. An empty string from the form's "None"
   * choice means "no project", which is a stated answer, not a missing
   * one -- the same shape `plantationCompleteDate` uses below.
   */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? null : value))
  @IsUUID(undefined, { message: 'Choose a project, or leave it as None' })
  projectId?: string | null;

  @IsString()
  @MinLength(1, { message: 'Enter the site name' })
  name!: string;

  @IsOptional()
  @IsUUID()
  siteLocationId?: string | null;

  /**
   * OPTIONAL. This site's own donor -- defaulted client-side from the
   * chosen project's donor when one is picked, but always editable and
   * never required. A site with no project still gets to name one.
   */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? null : value))
  @IsString()
  donorName?: string | null;

  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'Enter the number of trees as a whole number' })
  @Min(1, { message: 'A site needs at least one tree' })
  plannedTrees!: number;

  /** Required (question 6). The FALLBACK period anchor. */
  @IsDateString(
    {},
    { message: 'Enter the plantation start date, like 21/03/26' },
  )
  plantationStartDate!: string;

  /**
   * The period anchor when it is set (client instruction, 7 Sep 2026).
   *
   * Optional, because a site still being planted has not got one, and
   * the start date above is the client's own stated fallback until it
   * does. An empty string from a cleared date field means "not set",
   * not "invalid".
   */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? null : value))
  @IsDateString(
    {},
    { message: 'Enter the plantation complete date, like 21/03/26' },
  )
  plantationCompleteDate?: string | null;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsUUID()
  supervisorId?: string | null;
}

export interface SiteRow {
  id: string;
  /** Null where the site belongs to no project. Ordinary, not missing. */
  projectId: string | null;
  projectName: string | null;
  name: string;
  siteLocationId: string | null;
  locationName: string | null;
  /** Null where no donor has been recorded for this site. */
  donorName: string | null;
  plannedTrees: number;
  plantationStartDate: string;
  plantationCompleteDate: string | null;
  managerId: string | null;
  managerName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  createdAt: string;
}

/**
 * Section 7.2 rule 3: never a raw technical error.
 *
 * The database refuses a complete date before the start date, and
 * without this the refusal reaches the user as a 500 reading "Internal
 * server error" — which says nothing and offers nothing. The form
 * checks the same thing before submitting, so this is the backstop for
 * anything that does not go through the form.
 */
function rethrowPlantationDates(error: unknown): never {
  if (
    isPgError(error, PG_CHECK_VIOLATION) &&
    pgConstraint(error) === 'sites_plantation_dates_ordered'
  ) {
    throw new BadRequestException(
      'The plantation complete date cannot be before the start date. Check both dates and try again.',
    );
  }
  throw error;
}

/**
 * A site's manager and supervisor decide who sees the site and where its
 * complaints are routed, so setting or changing them is its own
 * permission, `budget.sites.change_people` (O7, plan 4 Q6). Every other
 * field is `edit`. The change is access-audited (`unit.lead_changed`,
 * R9), under the access lock, in the same transaction.
 */
const CHANGE_PEOPLE: PermissionKey = 'budget.sites.change_people';

/** The access writes' lock (plan 6.1.11, R11.9). */
const ACCESS_LOCK = 'sadbhavna.access';

/** The site's per-record answers (plan 6.1.4 item 6). */
const SITE_CAN = {
  edit: 'budget.sites.edit',
  change_people: CHANGE_PEOPLE,
  delete: 'budget.sites.delete',
} as const satisfies Record<string, PermissionKey>;

/**
 * Whether a PATCH value differs from what is stored. A key that was
 * not sent is no change; `null` (or "") clears, which is a change when
 * someone is set. Ids are compared case-blind, as Postgres stores them.
 */
function changes(sent: string | null | undefined, stored: string | null): boolean {
  if (sent === undefined) return false;
  return (sent || null)?.toLowerCase() !== stored?.toLowerCase();
}

/** What the form shows when a site pushes its project over (question 5). */
export interface AllocationWarning {
  projectName: string;
  plannedTrees: number;
  allocatedTrees: number;
  overBy: number;
  siteCount: number;
}

const SITE_SELECT = `
  s.id, s.project_id as "projectId", p.name as "projectName", s.name,
  s.location_id as "siteLocationId", l.name as "locationName",
  s.donor_name as "donorName",
  s.planned_trees as "plannedTrees",
  s.plantation_start_date as "plantationStartDate",
  s.plantation_complete_date as "plantationCompleteDate",
  s.manager_id as "managerId", m.name as "managerName",
  s.supervisor_id as "supervisorId", v.name as "supervisorName",
  s.created_at as "createdAt"`;

const SITE_FROM = `
  sites s
  left join projects p on p.id = s.project_id
  left join locations l on l.id = s.location_id
  left join users m on m.id = s.manager_id
  left join users v on v.id = s.supervisor_id`;

/** One side of a `unit.lead_changed` row: the people's ids and name snapshots. */
interface Leads {
  manager: { id: string; name: string } | null;
  supervisor: { id: string; name: string } | null;
}

@Controller('sites')
export class SitesController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @Can('budget.sites.view')
  list(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
    @Query('projectId') projectId?: string,
    @Query('managerId') managerId?: string,
  ): Promise<ListResult<SiteRow & MatchInfo & WithCan>> {
    return runListQuery<SiteRow & WithCan>(
      this.pool,
      {
        scope: { key: 'budget.sites.view', record: 'site', alias: 's' },
        can: SITE_CAN,
        from: SITE_FROM,
        select: SITE_SELECT,
        titleField: { sql: 's.name', label: 'Site' },
        /**
         * Section 27.1: every meaningful text field, including the
         * names of related people. Someone searching "Rakesh" expects
         * the sites he manages, not nothing.
         */
        searchFields: [
          { sql: 'p.name', label: 'Project' },
          { sql: 'l.name', label: 'Location' },
          { sql: 'm.name', label: 'Manager' },
          { sql: 'v.name', label: 'Supervisor' },
          { sql: 's.donor_name', label: 'Donor' },
        ],
        sortable: {
          name: 's.name',
          projectName: 'p.name',
          locationName: 'l.name',
          plannedTrees: 's.planned_trees',
          plantationStartDate: 's.plantation_start_date',
          createdAt: 's.created_at',
        },
        defaultSort: { key: 'createdAt', direction: 'desc' },
        filters: {
          projectId: (v, param) => `s.project_id = ${param(v)}`,
          managerId: (v, param) => `s.manager_id = ${param(v)}`,
        },
      },
      { ...query, filters: { projectId, managerId } },
      access,
    );
  }

  /** One site in the caller's view scope, with its `can`. Outside it: 404, as if missing (R7). */
  @Get(':id')
  @Can('budget.sites.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<SiteRow & WithCan> {
    return this.read(this.pool, access, id);
  }

  private async read(db: Queryable, access: AccessContext, id: string): Promise<SiteRow & WithCan> {
    const { values, param } = params();
    const idParam = param(id);
    const { rows } = await db.query<SiteRow & WithCan>(
      `select ${SITE_SELECT}, ${canSelect(access, SITE_CAN, 'site', 's', param)} as "can"
       from ${SITE_FROM}
       where s.id = ${idParam}::uuid and ${scopeWhere(access, 'budget.sites.view', 'site', 's', param)}`,
      values,
    );
    if (!rows[0]) throw notFound('site');
    return rows[0];
  }

  /**
   * Question 5: a site whose trees push its project past `planned_trees`
   * **saves, and warns**. It is never a block, so this runs AFTER the
   * write and reports what happened rather than gating it.
   *
   * `excludeSiteId` is how an edit asks "what would the total be with my
   * new number in place of my old one" — without it, editing a site
   * counts its own trees twice.
   *
   * Totals over a project are sums of the sites the caller can see
   * (plan 6.1.4 item 2), so the warning never reveals sites outside
   * their scope. At All, as every role mapped from today holds it, that
   * is every site.
   */
  private async allocation(
    access: AccessContext,
    projectId: string,
    excludeSiteId?: string,
  ): Promise<AllocationWarning | null> {
    const { values, param } = params();
    const project = param(projectId);
    const exclude = param(excludeSiteId ?? null);
    const { rows } = await this.pool.query<{
      project_name: string;
      planned_trees: number;
      allocated_trees: number;
      site_count: number;
    }>(
      `select p.name as project_name, p.planned_trees,
              coalesce(sum(s.planned_trees), 0)::int as allocated_trees,
              count(s.id)::int as site_count
       from projects p /*scope-exempt: the project the caller just linked their own site to; its name only*/
       left join sites s on s.project_id = p.id
         and (${exclude}::uuid is null or s.id <> ${exclude}::uuid)
         and ${scopeWhere(access, 'budget.sites.view', 'site', 's', param)}
       where p.id = ${project}::uuid
       group by p.name, p.planned_trees`,
      values,
    );
    const row = rows[0];
    if (!row) return null;
    const overBy = row.allocated_trees - row.planned_trees;
    if (overBy <= 0) return null;
    return {
      projectName: row.project_name,
      plannedTrees: row.planned_trees,
      allocatedTrees: row.allocated_trees,
      overBy,
      siteCount: row.site_count,
    };
  }

  /** The people's names now, for the audit row's snapshots. */
  private async leads(db: Queryable, managerId: string | null, supervisorId: string | null): Promise<Leads> {
    const ids = [managerId, supervisorId].filter((x): x is string => Boolean(x));
    const names = new Map<string, string>();
    if (ids.length) {
      const { rows } = await db.query<{ id: string; name: string }>(
        `select u.id, u.name from users u /*scope-exempt: name snapshots for the unit.lead_changed audit row*/
         where u.id = any($1::uuid[])`,
        [ids],
      );
      for (const r of rows) names.set(r.id.toLowerCase(), r.name);
    }
    const one = (id: string | null) => (id ? { id, name: names.get(id.toLowerCase()) ?? id } : null);
    return { manager: one(managerId), supervisor: one(supervisorId) };
  }

  /** The `unit.lead_changed` row (R9), in the caller's transaction, under the access lock. */
  private async auditLeads(
    db: Queryable,
    user: AuthUser,
    site: { id: string; name: string },
    before: Leads,
    after: Leads,
  ): Promise<void> {
    await writeAudit(db, {
      actor: { id: user.id, name: user.name },
      action: 'unit.lead_changed',
      target: site,
      before,
      after,
    });
  }

  @Post()
  @Can('budget.sites.create')
  // The people half (manager, supervisor) is budget.sites.change_people (O7).
  @AlsoChecks(CHANGE_PEOPLE)
  async create(
    @Body() body: SiteDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<{ site: SiteRow & WithCan; warning: AllocationWarning | null }> {
    const managerId = body.managerId || null;
    const supervisorId = body.supervisorId || null;
    const namesPeople = Boolean(managerId || supervisorId);
    // A new site is itself the unit, made Own by its created_by, so
    // holding change_people at any scope covers it (plan 6.1.4 item 5).
    if (namesPeople && !can(access, CHANGE_PEOPLE)) throw forbidden(CHANGE_PEOPLE, reasonFor(CHANGE_PEOPLE));

    const id = await inTransaction(this.pool, async (client) => {
      if (body.projectId) await assertProjectPickable(client, access, body.projectId);
      if (namesPeople) await client.query('select pg_advisory_xact_lock(hashtext($1))', [ACCESS_LOCK]);
      const { rows } = await client
        .query<{ id: string; name: string }>(
          `insert into sites
             (project_id, name, location_id, donor_name, planned_trees,
              plantation_start_date, plantation_complete_date,
              manager_id, supervisor_id, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, name`,
          [
            body.projectId ?? null,
            body.name,
            body.siteLocationId ?? null,
            body.donorName ?? null,
            body.plannedTrees,
            body.plantationStartDate,
            body.plantationCompleteDate ?? null,
            body.managerId ?? null,
            body.supervisorId ?? null,
            user.id,
          ],
        )
        .catch(rethrowPlantationDates);
      const site = rows[0]!;
      if (namesPeople) {
        await this.auditLeads(client, user, site, { manager: null, supervisor: null }, await this.leads(client, managerId, supervisorId));
      }
      return site.id;
    });
    return {
      site: await this.read(this.pool, access, id),
      warning: body.projectId ? await this.allocation(access, body.projectId) : null,
    };
  }

  @Patch(':id')
  @Can('budget.sites.edit')
  // The people half is budget.sites.change_people, at this site's scope (O7).
  @AlsoChecks(CHANGE_PEOPLE)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SiteDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<{ site: SiteRow & WithCan; warning: AllocationWarning | null }> {
    await inTransaction(this.pool, async (client) => {
      // Taken first, before the row lock, as every access write does
      // (plan 6.1.11); only when the people half is in the body at all.
      const sendsPeople = body.managerId !== undefined || body.supervisorId !== undefined;
      if (sendsPeople) await client.query('select pg_advisory_xact_lock(hashtext($1))', [ACCESS_LOCK]);

      // One query: visible, editable, may change people, and what is stored.
      const { values, param } = params();
      const idParam = param(id);
      const { rows } = await client.query<{
        visible: boolean;
        editable: boolean;
        people: boolean;
        name: string;
        project_id: string | null;
        manager_id: string | null;
        supervisor_id: string | null;
      }>(
        `select coalesce(${scopeWhere(access, 'budget.sites.view', 'site', 's', param)}, false) as visible,
                coalesce(${scopeWhere(access, 'budget.sites.edit', 'site', 's', param)}, false) as editable,
                coalesce(${scopeWhere(access, CHANGE_PEOPLE, 'site', 's', param)}, false) as people,
                s.name, s.project_id, s.manager_id, s.supervisor_id
         from sites s where s.id = ${idParam}::uuid
         for update of s`,
        values,
      );
      const current = rows[0];
      if (!current || !current.visible) throw notFound('site');
      if (!current.editable) throw forbidden('budget.sites.edit', recordReason(access, 'budget.sites.edit', 'site'));

      // The form sends the whole site back, people included, so the same
      // values are fine and a different one needs change_people. Without
      // it the two columns are left out of the write below: a save can
      // never put back a manager somebody else changed meanwhile.
      const peopleChange =
        changes(body.managerId, current.manager_id) || changes(body.supervisorId, current.supervisor_id);
      if (peopleChange && !current.people) {
        throw forbidden(
          CHANGE_PEOPLE,
          can(access, CHANGE_PEOPLE) ? recordReason(access, CHANGE_PEOPLE, 'site') : reasonFor(CHANGE_PEOPLE),
        );
      }
      const mayChangePeople = current.people;

      const newProject = body.projectId ?? null;
      if (newProject && newProject.toLowerCase() !== current.project_id?.toLowerCase()) {
        await assertProjectPickable(client, access, newProject);
      }

      const { clause, values: setValues } = buildUpdate({
        // `?? null` and not the raw value: `buildUpdate` drops undefined,
        // so without this, clearing a site's project on the form would
        // leave the old one in place and say it had saved.
        project_id: body.projectId ?? null,
        name: body.name,
        location_id: body.siteLocationId ?? null,
        donor_name: body.donorName ?? null,
        planned_trees: body.plannedTrees,
        plantation_start_date: body.plantationStartDate,
        plantation_complete_date: body.plantationCompleteDate ?? null,
        // `undefined` drops the column from the SET (see buildUpdate).
        manager_id: mayChangePeople ? body.managerId ?? null : undefined,
        supervisor_id: mayChangePeople ? body.supervisorId ?? null : undefined,
      });
      const updated = await client
        .query<{ manager_id: string | null; supervisor_id: string | null; name: string }>(
          `update sites set ${clause} /*scope-exempt: follows the scoped read of this row (view, edit, change_people)*/
           where id = $${setValues.length + 1} returning manager_id, supervisor_id, name`,
          [...setValues, id],
        )
        .catch(rethrowPlantationDates);
      const after = updated.rows[0];
      if (!after) throw notFound('site');

      if (
        changes(after.manager_id ?? null, current.manager_id) ||
        changes(after.supervisor_id ?? null, current.supervisor_id)
      ) {
        await this.auditLeads(
          client,
          user,
          { id, name: after.name },
          await this.leads(client, current.manager_id, current.supervisor_id),
          await this.leads(client, after.manager_id, after.supervisor_id),
        );
      }
    });
    return {
      site: await this.read(this.pool, access, id),
      warning: body.projectId ? await this.allocation(access, body.projectId) : null,
    };
  }

  /**
   * Take this site off whatever project it belongs to.
   *
   * A DELETE on the ASSOCIATION, not a PATCH of the site. The screen
   * that needs this — the project's site list — wants to change one
   * column, and the general update takes a whole `SiteDto`: it would
   * have to send the name, both dates, the tree count and both people
   * back from a list that may be minutes old, overwriting anything
   * somebody else changed in the meantime with values the user never
   * looked at. This touches `project_id` and nothing else.
   *
   * Already unlinked is a success, not an error: the caller asked for
   * a state, and that state holds.
   *
   * The same permission as the site's own form (edit), deliberately:
   * the same person can already clear the field there, so gating it
   * differently here would make the identical change legal on one
   * screen and forbidden on another.
   */
  @Delete(':id/project')
  @Can('budget.sites.edit')
  async clearProject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<SiteRow & WithCan> {
    await inTransaction(this.pool, async (client) => {
      await assertRecordAccess(client, access, {
        table: 'sites',
        alias: 's',
        record: 'site',
        id,
        view: 'budget.sites.view',
        action: 'budget.sites.edit',
        notFound: 'That site no longer exists. It may have been deleted.',
        forUpdate: true,
      });
      await client.query(
        'update sites set project_id = null /*scope-exempt: follows the scoped read of this row*/ where id = $1',
        [id],
      );
    });
    return this.read(this.pool, access, id);
  }

  @Delete(':id')
  @Can('budget.sites.delete')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<void> {
    try {
      await inTransaction(this.pool, async (client) => {
        await assertRecordAccess(client, access, {
          table: 'sites',
          alias: 's',
          record: 'site',
          id,
          view: 'budget.sites.view',
          action: 'budget.sites.delete',
          notFound: 'That site no longer exists. It may have been deleted.',
          forUpdate: true,
        });
        await client.query('delete from sites /*scope-exempt: follows the scoped read of this row*/ where id = $1', [id]);
      });
    } catch (error) {
      // site_budgets cascades; expenses deliberately do not, because
      // deleting a site must not silently delete money that was spent.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        // Complaints are filed against a site since 1 Oct 2026 (0011).
        // They are the record of what went wrong there, so they block
        // the delete too, and are never deleted with it.
        if (pgConstraint(error) === 'complaints_site_id_fkey') {
          throw new ConflictException(
            'This site has complaints filed against it, so it can’t be deleted. Keep the site as it is.',
          );
        }
        throw new ConflictException(
          'This site has expenses booked against it. Delete those first.',
        );
      }
      throw error;
    }
  }
}
