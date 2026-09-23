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
  findOneOrFail,
  isPgError,
  pgConstraint,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
} from '../common/crud';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { Roles } from '../common/roles.decorator';
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
  s.site_location_id as "siteLocationId", l.name as "locationName",
  s.planned_trees as "plannedTrees",
  s.plantation_start_date as "plantationStartDate",
  s.plantation_complete_date as "plantationCompleteDate",
  s.manager_id as "managerId", m.name as "managerName",
  s.supervisor_id as "supervisorId", v.name as "supervisorName",
  s.created_at as "createdAt"`;

const SITE_FROM = `
  sites s
  left join projects p on p.id = s.project_id
  left join site_locations l on l.id = s.site_location_id
  left join users m on m.id = s.manager_id
  left join users v on v.id = s.supervisor_id`;

@Controller('sites')
export class SitesController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  list(
    @Query() query: ListQueryDto,
    @Query('projectId') projectId?: string,
    @Query('managerId') managerId?: string,
  ): Promise<ListResult<SiteRow & MatchInfo>> {
    return runListQuery<SiteRow>(
      this.pool,
      {
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
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<SiteRow> {
    return findOneOrFail<SiteRow>(
      this.pool,
      `select ${SITE_SELECT} from ${SITE_FROM} where s.id = $1`,
      [id],
      'site',
    );
  }

  /**
   * Question 5: a site whose trees push its project past `planned_trees`
   * **saves, and warns**. It is never a block, so this runs AFTER the
   * write and reports what happened rather than gating it.
   *
   * `excludeSiteId` is how an edit asks "what would the total be with my
   * new number in place of my old one" — without it, editing a site
   * counts its own trees twice.
   */
  private async allocation(
    projectId: string,
    excludeSiteId?: string,
  ): Promise<AllocationWarning | null> {
    const { rows } = await this.pool.query<{
      project_name: string;
      planned_trees: number;
      allocated_trees: number;
      site_count: number;
    }>(
      `select p.name as project_name, p.planned_trees,
              coalesce(sum(s.planned_trees), 0)::int as allocated_trees,
              count(s.id)::int as site_count
       from projects p
       left join sites s on s.project_id = p.id
         and ($2::uuid is null or s.id <> $2)
       where p.id = $1
       group by p.name, p.planned_trees`,
      [projectId, excludeSiteId ?? null],
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

  @Post()
  async create(
    @Body() body: SiteDto,
  ): Promise<{ site: SiteRow; warning: AllocationWarning | null }> {
    const { rows } = await this.pool
      .query(
        `insert into sites
           (project_id, name, site_location_id, planned_trees,
            plantation_start_date, plantation_complete_date,
            manager_id, supervisor_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [
          body.projectId ?? null,
          body.name,
          body.siteLocationId ?? null,
          body.plannedTrees,
          body.plantationStartDate,
          body.plantationCompleteDate ?? null,
          body.managerId ?? null,
          body.supervisorId ?? null,
        ],
      )
      .catch(rethrowPlantationDates);
    return {
      site: await this.get(rows[0].id),
      warning: body.projectId ? await this.allocation(body.projectId) : null,
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SiteDto,
  ): Promise<{ site: SiteRow; warning: AllocationWarning | null }> {
    const { clause, values } = buildUpdate({
      // `?? null` and not the raw value: `buildUpdate` drops undefined,
      // so without this, clearing a site's project on the form would
      // leave the old one in place and say it had saved.
      project_id: body.projectId ?? null,
      name: body.name,
      site_location_id: body.siteLocationId ?? null,
      planned_trees: body.plannedTrees,
      plantation_start_date: body.plantationStartDate,
      plantation_complete_date: body.plantationCompleteDate ?? null,
      manager_id: body.managerId ?? null,
      supervisor_id: body.supervisorId ?? null,
    });
    await findOneOrFail(
      this.pool,
      `update sites set ${clause} where id = $${values.length + 1} returning id`,
      [...values, id],
      'site',
    ).catch(rethrowPlantationDates);
    return {
      site: await this.get(id),
      warning: body.projectId ? await this.allocation(body.projectId) : null,
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
   * NOT admin-only, deliberately. The same person can already clear
   * the field on the site's own form, so gating it here would make
   * the identical change legal on one screen and forbidden on
   * another, which is not a permission rule — it is an inconsistency.
   */
  @Delete(':id/project')
  async clearProject(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SiteRow> {
    await findOneOrFail(
      this.pool,
      'update sites set project_id = null where id = $1 returning id',
      [id],
      'site',
    );
    return this.get(id);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    try {
      await findOneOrFail(
        this.pool,
        'delete from sites where id = $1 returning id',
        [id],
        'site',
      );
    } catch (error) {
      // site_budgets cascades; expenses deliberately do not, because
      // deleting a site must not silently delete money that was spent.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          'This site has expenses booked against it. Delete those first.',
        );
      }
      throw error;
    }
  }
}
