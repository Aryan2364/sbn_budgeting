import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import type { Pool } from 'pg';

import { type AccessContext, CurrentAccess } from '../access/access-context';
import { PickOf } from '../access/decorators';
import { PG_POOL } from '../db/db.module';
import { runPickQuery } from './pick-query';

/**
 * The budget module's Pick endpoints (access plan 5.3.1, 6.1.4 item 7,
 * R11.7): `GET /pick/budget/<section>?q=`, for choosing a value, never
 * for displaying a saved one (kit 3.5 rule 6). Each returns its
 * section's declared `pick.fields` only (catalogue/budget.ts), at most
 * 50 matches ordered by name, scoped by the union of the Pick scopes
 * held. Decided by the permission guard (@PickOf).
 *
 * Fields (the P7 picker inventory):
 *   projects    id, name, donorName      the site form defaults a site's donor
 *   sites       id, name, projectId,      the report scope narrows by project;
 *               plantationStartDate,      the expense form derives the period
 *               plantationCompleteDate    from the two dates
 *
 * Narrowing (never widening): sites take `projectId=<uuid>`, or
 * `projectId=none` for the sites in no project (the report scope's "No
 * project"), so a searched site list can follow the chosen project
 * without the browser filtering a capped answer (access plan P8).
 *   cost_heads  id, name, sortOrder,      pick-for-everyone; screens list heads
 *               isActive                  in the sheet's order; retired heads
 *                                         only with includeInactive=true
 */

/** A single query-string value, or a 400; `?q=a&q=b` is not a search. */
function one(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`Send ${name} once, as text.`);
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The reports' "sites in no project" (reports/variance.service.ts NO_PROJECT). */
const NO_PROJECT = 'none';

/** A project to narrow sites to: a uuid, `none`, or absent. */
function projectFilter(value: unknown): string | undefined {
  const v = one(value, 'projectId');
  if (v === undefined || v === '') return undefined;
  if (v === NO_PROJECT || UUID.test(v)) return v;
  throw new BadRequestException('projectId must be a project id or none.');
}

/** `true` widens to retired heads too; `false` or absent leaves them out. */
function flag(value: unknown, name: string): boolean {
  const v = one(value, name);
  if (v === undefined || v === '' || v === 'false') return false;
  if (v === 'true') return true;
  throw new BadRequestException(`${name} must be true or false.`);
}

export interface ProjectPick {
  id: string;
  name: string;
  donorName: string;
}

export interface SitePick {
  id: string;
  name: string;
  projectId: string | null;
  plantationStartDate: string;
  plantationCompleteDate: string | null;
}

export interface CostHeadPick {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

@Controller('pick/budget')
export class BudgetPickController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get('projects')
  @PickOf('budget.projects')
  projects(@CurrentAccess() access: AccessContext, @Query('q') q?: unknown): Promise<ProjectPick[]> {
    return runPickQuery<ProjectPick>(
      this.pool,
      access,
      {
        section: 'budget.projects',
        from: 'projects p',
        alias: 'p',
        select: 'p.id, p.name, p.donor_name as "donorName"',
        nameSql: 'p.name',
      },
      one(q, 'q'),
    );
  }

  @Get('sites')
  @PickOf('budget.sites')
  sites(
    @CurrentAccess() access: AccessContext,
    @Query('q') q?: unknown,
    @Query('projectId') projectId?: unknown,
  ): Promise<SitePick[]> {
    const project = projectFilter(projectId);
    return runPickQuery<SitePick>(
      this.pool,
      access,
      {
        section: 'budget.sites',
        from: 'sites s',
        alias: 's',
        select: `s.id, s.name, s.project_id as "projectId",
                 s.plantation_start_date as "plantationStartDate",
                 s.plantation_complete_date as "plantationCompleteDate"`,
        nameSql: 's.name',
        where: (param) =>
          project === undefined
            ? []
            : project === NO_PROJECT
              ? ['s.project_id is null']
              : [`s.project_id = ${param(project)}`],
      },
      one(q, 'q'),
    );
  }

  /**
   * Pick-for-everyone (a master, decision 26). Retired heads are left
   * out unless `includeInactive=true`: a form must not offer one for a
   * new value, while a list filter still needs them, because an old
   * expense keeps its head. `isActive` says which is which.
   */
  @Get('cost_heads')
  @PickOf('budget.cost_heads')
  costHeads(
    @CurrentAccess() access: AccessContext,
    @Query('q') q?: unknown,
    @Query('includeInactive') includeInactive?: unknown,
  ): Promise<CostHeadPick[]> {
    const all = flag(includeInactive, 'includeInactive');
    return runPickQuery<CostHeadPick>(
      this.pool,
      access,
      {
        section: 'budget.cost_heads',
        from: 'cost_heads ch',
        alias: 'ch',
        select: 'ch.id, ch.name, ch.sort_order as "sortOrder", ch.is_active as "isActive"',
        nameSql: 'ch.name',
        where: () => (all ? [] : ['ch.is_active']),
      },
      one(q, 'q'),
    );
  }
}
