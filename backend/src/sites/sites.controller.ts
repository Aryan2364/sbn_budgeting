import {
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
  PG_FOREIGN_KEY_VIOLATION,
} from '../common/crud';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { Roles } from '../common/roles.decorator';
import { PG_POOL } from '../db/db.module';

export class SiteDto {
  @IsUUID(undefined, { message: 'Choose the project this site belongs to' })
  projectId!: string;

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

  /** Required (question 6). The expense form derives a period from it. */
  @IsDateString(
    {},
    { message: 'Enter the plantation start date, like 12 Aug 2026' },
  )
  plantationStartDate!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsUUID()
  supervisorId?: string | null;
}

export interface SiteRow {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  siteLocationId: string | null;
  locationName: string | null;
  plannedTrees: number;
  plantationStartDate: string;
  managerId: string | null;
  managerName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  createdAt: string;
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
  s.manager_id as "managerId", m.name as "managerName",
  s.supervisor_id as "supervisorId", v.name as "supervisorName",
  s.created_at as "createdAt"`;

const SITE_FROM = `
  sites s
  join projects p on p.id = s.project_id
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
    const { rows } = await this.pool.query(
      `insert into sites
         (project_id, name, site_location_id, planned_trees,
          plantation_start_date, manager_id, supervisor_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        body.projectId,
        body.name,
        body.siteLocationId ?? null,
        body.plannedTrees,
        body.plantationStartDate,
        body.managerId ?? null,
        body.supervisorId ?? null,
      ],
    );
    return {
      site: await this.get(rows[0].id),
      warning: await this.allocation(body.projectId),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SiteDto,
  ): Promise<{ site: SiteRow; warning: AllocationWarning | null }> {
    const { clause, values } = buildUpdate({
      project_id: body.projectId,
      name: body.name,
      site_location_id: body.siteLocationId ?? null,
      planned_trees: body.plannedTrees,
      plantation_start_date: body.plantationStartDate,
      manager_id: body.managerId ?? null,
      supervisor_id: body.supervisorId ?? null,
    });
    await findOneOrFail(
      this.pool,
      `update sites set ${clause} where id = $${values.length + 1} returning id`,
      [...values, id],
      'site',
    );
    return {
      site: await this.get(id),
      warning: await this.allocation(body.projectId),
    };
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
