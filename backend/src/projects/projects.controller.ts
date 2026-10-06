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
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import type { Pool } from 'pg';

import { isPgError, PG_FOREIGN_KEY_VIOLATION, buildUpdate } from '../common/crud';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo, type WithCan } from '../common/list-query';
import { type AccessContext, CurrentAccess } from '../access/access-context';
import type { PermissionKey } from '../access/catalogue';
import { Can } from '../access/decorators';
import { type Param as SqlParam, assertRecordAccess, canSelect, scopeWhere } from '../access/scope';
import { inTransaction, notFound, params } from '../sites/budget-access';
import { PG_POOL } from '../db/db.module';

export class ProjectDto {
  @IsString()
  @MinLength(1, { message: 'Enter the donor name' })
  donorName!: string;

  @IsString()
  @MinLength(1, { message: 'Enter the project name' })
  name!: string;

  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'Enter the number of trees as a whole number' })
  @Min(1, { message: 'A project needs at least one tree' })
  plannedTrees!: number;
}

export interface ProjectRow {
  id: string;
  donorName: string;
  name: string;
  plannedTrees: number;
  siteCount: number;
  allocatedTrees: number;
  createdAt: string;
}

/** The existing not-found wording (R7: a project outside your scope reads exactly the same). */
const NOT_FOUND = 'That project no longer exists. It may have been deleted.';

/** The project's per-record answers (plan 6.1.4 item 6). */
const PROJECT_CAN = {
  edit: 'budget.projects.edit',
  delete: 'budget.projects.delete',
} as const satisfies Record<string, PermissionKey>;

const PROJECT_SELECT = `p.id, p.name, p.donor_name as "donorName",
  p.planned_trees as "plannedTrees",
  a.site_count as "siteCount",
  a.allocated_trees as "allocatedTrees",
  p.created_at as "createdAt"`;

/**
 * Section 5 of the plan. A project is a donor, a name and a tree count.
 *
 * `allocatedTrees` and `siteCount` are computed in SQL beside the row
 * rather than fetched per project, because the list shows them and N+1
 * on a 25-row page is 26 queries.
 *
 * A project is visible if any of its sites is, or its creator is you
 * (decision 26, plan 6.1.4). Its totals are sums of the sites the
 * caller can see (plan 6.1.4 item 2): at All, as every role mapped from
 * today holds it, that is every site.
 */
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** `projects p` plus its totals over the caller's visible sites. */
  private static from(access: AccessContext, param: SqlParam): string {
    return `projects p
    left join lateral (
      select count(*)::int as site_count,
             coalesce(sum(s.planned_trees), 0)::int as allocated_trees
      from sites s
      where s.project_id = p.id and ${scopeWhere(access, 'budget.sites.view', 'site', 's', param)}
    ) a on true`;
  }

  @Get()
  @Can('budget.projects.view')
  list(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
  ): Promise<ListResult<ProjectRow & MatchInfo & WithCan>> {
    return runListQuery<ProjectRow & WithCan>(
      this.pool,
      {
        scope: { key: 'budget.projects.view', record: 'project', alias: 'p' },
        can: PROJECT_CAN,
        from: (param) => ProjectsController.from(access, param),
        select: PROJECT_SELECT,
        titleField: { sql: 'p.name', label: 'Project' },
        // Section 27.1: every meaningful text field. A project has two.
        searchFields: [{ sql: 'p.donor_name', label: 'Donor' }],
        sortable: {
          name: 'p.name',
          donorName: 'p.donor_name',
          plannedTrees: 'p.planned_trees',
          siteCount: 'a.site_count',
          createdAt: 'p.created_at',
        },
        defaultSort: { key: 'createdAt', direction: 'desc' },
      },
      query,
      access,
    );
  }

  /** One project in the caller's view scope, with its `can`. Outside it: 404, as if missing (R7). */
  @Get(':id')
  @Can('budget.projects.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<ProjectRow & WithCan> {
    return this.read(access, id);
  }

  private async read(access: AccessContext, id: string): Promise<ProjectRow & WithCan> {
    const { values, param } = params();
    const from = ProjectsController.from(access, param);
    const idParam = param(id);
    const { rows } = await this.pool.query<ProjectRow & WithCan>(
      `select ${PROJECT_SELECT}, ${canSelect(access, PROJECT_CAN, 'project', 'p', param)} as "can"
       from ${from}
       where p.id = ${idParam}::uuid and ${scopeWhere(access, 'budget.projects.view', 'project', 'p', param)}`,
      values,
    );
    if (!rows[0]) throw notFound('project');
    return rows[0];
  }

  /** A new project has no sites yet; its created_by makes it the creator's own (decision 26). */
  @Post()
  @Can('budget.projects.create')
  async create(
    @Body() body: ProjectDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<ProjectRow & WithCan> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into projects (donor_name, name, planned_trees, created_by)
       values ($1, $2, $3, $4) returning id`,
      [body.donorName, body.name, body.plannedTrees, user.id],
    );
    return this.read(access, rows[0]!.id);
  }

  @Patch(':id')
  @Can('budget.projects.edit')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ProjectDto,
    @CurrentAccess() access: AccessContext,
  ): Promise<ProjectRow & WithCan> {
    await inTransaction(this.pool, async (client) => {
      await assertRecordAccess(client, access, {
        table: 'projects',
        alias: 'p',
        record: 'project',
        id,
        view: 'budget.projects.view',
        action: 'budget.projects.edit',
        notFound: NOT_FOUND,
        forUpdate: true,
      });
      const { clause, values } = buildUpdate({
        donor_name: body.donorName,
        name: body.name,
        planned_trees: body.plannedTrees,
      });
      await client.query(
        `update projects set ${clause} /*scope-exempt: follows the scoped read of this row*/
         where id = $${values.length + 1}`,
        [...values, id],
      );
    });
    return this.read(access, id);
  }

  /**
   * Take EVERY site off this project, in one statement.
   *
   * **The scope is the WHERE clause, not a list the browser sent.**
   * The screen that calls this was detaching the sites it happened to
   * be holding — a page of at most 100, fetched when the page loaded.
   * On a project with more than that it would unlink 100, report
   * success, and leave the delete to fail on the ones nobody saw; and
   * being many requests rather than one, a failure halfway through
   * left some sites detached and the screen still showing them all.
   * One UPDATE cannot do either.
   *
   * "Every" is every site within the reach of the caller's edit
   * permission on this project (decision 26: the sites that make the
   * project theirs). At All, as every role mapped from today holds it,
   * that is every site of the project.
   *
   * The count comes back because the caller states it: "4 sites are no
   * longer in this project" has to be what happened, not what a stale
   * `siteCount` predicted.
   *
   * Not admin-only, for the reason given on `DELETE /sites/:id/project`
   * — the same change is already open to the same people there.
   */
  @Post(':id/unlink-sites')
  @Can('budget.projects.edit')
  async unlinkSites(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<{ unlinked: number }> {
    return inTransaction(this.pool, async (client) => {
      // Proves the project exists and is the caller's to edit, so a wrong
      // id is a 404 rather than a cheerful "0 sites unlinked".
      await assertRecordAccess(client, access, {
        table: 'projects',
        alias: 'p',
        record: 'project',
        id,
        view: 'budget.projects.view',
        action: 'budget.projects.edit',
        notFound: NOT_FOUND,
        forUpdate: true,
      });
      const { values, param } = params();
      const project = param(id);
      const { rowCount } = await client.query(
        `update sites s set project_id = null
         where s.project_id = ${project}::uuid and ${scopeWhere(access, 'budget.projects.edit', 'site', 's', param)}`,
        values,
      );
      return { unlinked: rowCount ?? 0 };
    });
  }

  /**
   * Refused while sites still reference it.
   *
   * Section 15 says a confirmation must state what else will be
   * affected. The dialog does that from `siteCount`; this is the server
   * half, and it is the half that matters — hiding the button is
   * appearance.
   */
  @Delete(':id')
  @Can('budget.projects.delete')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<void> {
    try {
      await inTransaction(this.pool, async (client) => {
        await assertRecordAccess(client, access, {
          table: 'projects',
          alias: 'p',
          record: 'project',
          id,
          view: 'budget.projects.view',
          action: 'budget.projects.delete',
          notFound: NOT_FOUND,
          forUpdate: true,
        });
        await client.query('delete from projects /*scope-exempt: follows the scoped read of this row*/ where id = $1', [id]);
      });
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          'This project still has sites. Delete or move them first.',
        );
      }
      throw error;
    }
  }
}
