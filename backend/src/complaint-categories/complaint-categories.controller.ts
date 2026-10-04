import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe,
  Patch, Post, Query, UnprocessableEntityException,
} from '@nestjs/common';
import {
  IsBoolean, IsOptional, IsString, IsUUID, MinLength, ValidateIf,
} from 'class-validator';
import type { Pool, PoolClient } from 'pg';

import { Can } from '../access/decorators';
import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { PG_POOL } from '../db/db.module';

export class ComplaintCategoryDto {
  @IsString()
  @MinLength(1, { message: 'Enter the category name' })
  name!: string;

  // No sortOrder: the list is in name order and nobody sets a position
  // (kit section 40 was withdrawn on 1 Oct 2026: there is no ordering
  // concept). One sent anyway is stripped by the whitelist and ignored.

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsBoolean({ message: 'Say whether closing a complaint in this category needs approval' })
  requiresApproval!: boolean;

  /** Omitted on create, or null: the HOD designation (CONTRACT section 3). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Choose the approver designation from the list' })
  approverDesignationId?: string | null;
}

export interface ComplaintCategoryRow {
  id: string;
  name: string;
  /** Internal and never shown or set by anyone; kept so the row shape is unchanged. */
  sortOrder: number;
  isActive: boolean;
  requiresApproval: boolean;
  approverDesignation: { id: string; name: string } | null;
  /** DELETE refuses while this is above 0, so the screen can say so first. */
  complaintCount: number;
}

/**
 * Complaint categories: the cost-heads master pattern (plan 3.5).
 *
 * Every handler needs `complaints.categories.manage` (plan 5.3.2),
 * reading as well as writing: the full list with usage counts is the
 * Settings screen. Everyone else reads categories through
 * `/pick/complaints/categories` (intended difference D3, from P9).
 */
@Controller('complaint-categories')
export class ComplaintCategoriesController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private static readonly FROM = `
    complaint_categories cc
    left join designations ad on ad.id = cc.approver_designation_id
    left join lateral (
      select count(*)::int as complaint_count from complaints c
      /*scope-exempt: a master's usage count on the full category list (complaints.categories.manage, All only, D3); no complaint is returned*/
      where c.category_id = cc.id
    ) u on true`;

  private static readonly SELECT = `
    cc.id, cc.name, cc.sort_order as "sortOrder", cc.is_active as "isActive",
    cc.requires_approval as "requiresApproval",
    case when ad.id is null then null
         else json_build_object('id', ad.id, 'name', ad.name) end as "approverDesignation",
    u.complaint_count as "complaintCount"`;

  @Get()
  @Can('complaints.categories.manage')
  list(
    @Query() query: ListQueryDto,
    @Query('isActive') isActive?: string,
  ): Promise<ListResult<ComplaintCategoryRow & MatchInfo>> {
    const S = ComplaintCategoriesController;
    return runListQuery<ComplaintCategoryRow>(
      this.pool,
      {
        scope: { unscoped: 'master', why: 'The full category list; its route needs complaints.categories.manage (All only). Choosing a category uses the Pick.' },
        from: S.FROM,
        select: S.SELECT,
        titleField: { sql: 'cc.name', label: 'Name' },
        // The approver designation is searchable because an admin asks
        // "which categories go to the CEO?".
        searchFields: [{ sql: 'ad.name', label: 'Approver' }],
        sortable: {
          name: 'cc.name',
          isActive: 'cc.is_active',
          requiresApproval: 'cc.requires_approval',
          complaintCount: 'u.complaint_count',
        },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: {
          isActive: (value, param) => `cc.is_active = ${param(value === 'true')}`,
        },
      },
      { ...query, filters: { isActive } },
    );
  }

  @Get(':id')
  @Can('complaints.categories.manage')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ComplaintCategoryRow> {
    const S = ComplaintCategoriesController;
    return findOneOrFail<ComplaintCategoryRow>(
      this.pool,
      `select ${S.SELECT} from ${S.FROM} where cc.id = $1`,
      [id],
      'complaint category',
    );
  }

  @Post()
  @Can('complaints.categories.manage')
  async create(@Body() body: ComplaintCategoryDto): Promise<ComplaintCategoryRow> {
    const approverId = body.approverDesignationId ?? (await this.hodDesignationId(this.pool));
    const id = await this.translate(body, async () => {
      const { rows } = await this.pool.query<{ id: string }>(
        `insert into complaint_categories
           (name, sort_order, is_active, requires_approval, approver_designation_id)
         values ($1, (select coalesce(max(sort_order), 0) + 1 from complaint_categories),
                 coalesce($2, true), $3, $4)
         returning id`,
        [body.name.trim(), body.isActive ?? null, body.requiresApproval, approverId],
      );
      return rows[0]!.id;
    });
    return this.get(id);
  }

  /**
   * An omitted approverDesignationId keeps the current one; an explicit
   * null resets it to the HOD default.
   */
  @Patch(':id')
  @Can('complaints.categories.manage')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ComplaintCategoryDto,
  ): Promise<ComplaintCategoryRow> {
    const approverId =
      body.approverDesignationId === undefined
        ? undefined
        : (body.approverDesignationId ?? (await this.hodDesignationId(this.pool)));
    await this.translate(body, () =>
      findOneOrFail(
        this.pool,
        `update complaint_categories
         set name = $1,
             is_active = coalesce($2, is_active),
             requires_approval = $3,
             approver_designation_id = case when $4::boolean then $5::uuid else approver_designation_id end
         where id = $6 returning id`,
        [
          body.name.trim(), body.isActive ?? null, body.requiresApproval,
          approverId !== undefined, approverId ?? null, id,
        ],
        'complaint category',
      ),
    );
    return this.get(id);
  }

  /** A category that has been used is deactivated, never deleted (plan 3.5). */
  @Delete(':id')
  @Can('complaints.categories.manage')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    const row = await this.get(id);
    if (row.complaintCount > 0) {
      throw new ConflictException(
        `${row.name} is used by ${row.complaintCount} complaint${row.complaintCount === 1 ? '' : 's'}, so it can't be deleted. Deactivate it instead.`,
      );
    }
    try {
      await findOneOrFail(
        this.pool, 'delete from complaint_categories where id = $1 returning id', [id],
        'complaint category',
      );
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(`${row.name} is used by a complaint. Deactivate it instead.`);
      }
      throw error;
    }
  }

  private async hodDesignationId(db: Pool | PoolClient): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `select id from designations where seed_key = 'hod'`,
    );
    if (!rows[0]) {
      throw new UnprocessableEntityException(
        'There is no HOD designation to default the approver to. Choose an approver designation.',
      );
    }
    return rows[0].id;
  }

  private async translate<T>(body: ComplaintCategoryDto, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`There is already a complaint category called "${body.name.trim()}".`);
      }
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new UnprocessableEntityException(
          'That approver designation no longer exists. Choose another one.',
        );
      }
      throw error;
    }
  }
}
