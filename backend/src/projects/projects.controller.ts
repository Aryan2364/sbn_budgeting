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
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { Pool } from 'pg';

import {
  findOneOrFail,
  isPgError,
  PG_FOREIGN_KEY_VIOLATION,
  buildUpdate,
} from '../common/crud';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { Roles } from '../common/roles.decorator';
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

/**
 * Section 5 of the plan. A project is a donor, a name and a tree count.
 *
 * `allocatedTrees` and `siteCount` are computed in SQL beside the row
 * rather than fetched per project, because the list shows them and N+1
 * on a 25-row page is 26 queries.
 */
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private static readonly ALLOCATION = `
    left join lateral (
      select count(*)::int as site_count,
             coalesce(sum(s.planned_trees), 0)::int as allocated_trees
      from sites s where s.project_id = p.id
    ) a on true`;

  @Get()
  list(@Query() query: ListQueryDto): Promise<ListResult<ProjectRow & MatchInfo>> {
    return runListQuery<ProjectRow>(
      this.pool,
      {
        from: `projects p ${ProjectsController.ALLOCATION}`,
        select: `p.id, p.name, p.donor_name as "donorName",
                 p.planned_trees as "plannedTrees",
                 a.site_count as "siteCount",
                 a.allocated_trees as "allocatedTrees",
                 p.created_at as "createdAt"`,
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
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProjectRow> {
    return findOneOrFail<ProjectRow>(
      this.pool,
      `select p.id, p.name, p.donor_name as "donorName",
              p.planned_trees as "plannedTrees",
              a.site_count as "siteCount",
              a.allocated_trees as "allocatedTrees",
              p.created_at as "createdAt"
       from projects p ${ProjectsController.ALLOCATION}
       where p.id = $1`,
      [id],
      'project',
    );
  }

  @Post()
  async create(@Body() body: ProjectDto, @CurrentUser() user: AuthUser): Promise<ProjectRow> {
    void user;
    const { rows } = await this.pool.query(
      `insert into projects (donor_name, name, planned_trees)
       values ($1, $2, $3) returning id`,
      [body.donorName, body.name, body.plannedTrees],
    );
    return this.get(rows[0].id);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ProjectDto,
  ): Promise<ProjectRow> {
    const { clause, values } = buildUpdate({
      donor_name: body.donorName,
      name: body.name,
      planned_trees: body.plannedTrees,
    });
    await findOneOrFail(
      this.pool,
      `update projects set ${clause} where id = $${values.length + 1} returning id`,
      [...values, id],
      'project',
    );
    return this.get(id);
  }

  /**
   * Admin only (section 26), and refused while sites still reference it.
   *
   * Section 15 says a confirmation must state what else will be
   * affected. The dialog does that from `siteCount`; this is the server
   * half, and it is the half that matters — hiding the button is
   * appearance.
   */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    try {
      await findOneOrFail(
        this.pool,
        'delete from projects where id = $1 returning id',
        [id],
        'project',
      );
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
