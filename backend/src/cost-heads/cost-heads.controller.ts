import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, Inject,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import type { Pool } from 'pg';

import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { ModuleAccess, ModuleRole } from '../common/module-access.decorator';
import { Can } from '../access/decorators';

export class CostHeadDto {
  @IsString()
  @MinLength(1, { message: 'Enter the cost head name' })
  name!: string;

  // No sortOrder. The heads keep the spreadsheet's fixed order (the
  // seed sets it; the budget grid, expense form and variance report list
  // by it), a new head goes after the last, and nobody sets a position.
  // One sent anyway is stripped by the whitelist and ignored.

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { PG_POOL } from '../db/db.module';

export interface CostHeadRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /**
   * What points at this head. `remove` below refuses while either is
   * above zero, and the SCREEN has to know that before it offers the
   * delete — section 26 forbids a control that fails after being
   * clicked, and the only way to honour it is for the row to say
   * whether deletion is possible. Counted rather than returned as a
   * boolean so the dialog can name the consequence (section 15 rule 2).
   */
  budgetCount: number;
  expenseCount: number;
}

@ModuleAccess('budget')
@Controller('cost-heads')
export class CostHeadsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The two counts that decide whether a head can be deleted, attached
   * to every read of one. `site_budgets.cost_head_id` and
   * `expenses.cost_head_id` are both indexed, and this table is master
   * data bounded by admin edits rather than by use.
   */
  private static readonly USAGE = `
    /*scope-exempt: usage counts that decide whether a cost head can be deleted; the master screen's routes need budget.cost_heads.manage, held at All only*/
    left join lateral (
      select
        (select count(*)::int from site_budgets b where b.cost_head_id = ch.id)
          as budget_count,
        (select count(*)::int from expenses e where e.cost_head_id = ch.id)
          as expense_count
    ) u on true`;

  private static readonly SELECT = `
    ch.id, ch.name, ch.sort_order as "sortOrder", ch.is_active as "isActive",
    u.budget_count as "budgetCount", u.expense_count as "expenseCount"`;

  /**
   * The master list, read through the shared list convention so that
   * this endpoint and every later one behave identically.
   *
   * Default sort is the sheet's own order, not the name. The order is
   * data: it runs roughly in the order the work happens on a site, and
   * a budget grid sorted alphabetically would be unreadable to the
   * people who wrote the spreadsheet.
   */
  @Get()
  // The full master list is the Settings screen: manage (plan 6.1.5, D3).
  // Screens that only choose a cost head move to /pick/budget/cost_heads.
  @Can('budget.cost_heads.manage')
  list(
    @Query() query: ListQueryDto,
    @Query('isActive') isActive?: string,
  ): Promise<ListResult<CostHeadRow & MatchInfo>> {
    return runListQuery<CostHeadRow>(
      this.pool,
      {
        scope: { unscoped: 'master', why: 'The full cost-head list; its route needs budget.cost_heads.manage (All only). Choosing a cost head uses the Pick.' },
        from: `cost_heads ch${CostHeadsController.USAGE}`,
        select: CostHeadsController.SELECT,
        titleField: { sql: 'ch.name', label: 'Name' },
        // A cost head has exactly one meaningful text field. Nothing is
        // excluded from search here; there is nothing else to exclude.
        searchFields: [],
        sortable: {
          sortOrder: 'ch.sort_order',
          name: 'ch.name',
          isActive: 'ch.is_active',
        },
        defaultSort: { key: 'sortOrder', direction: 'asc' },
        filters: {
          isActive: (value, param) => `ch.is_active = ${param(value === 'true')}`,
        },
      },
      { ...query, filters: { isActive } },
    );
  }

  @Get(':id')
  @Can('budget.cost_heads.manage')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<CostHeadRow> {
    return findOneOrFail<CostHeadRow>(
      this.pool,
      `select ${CostHeadsController.SELECT}
       from cost_heads ch${CostHeadsController.USAGE}
       where ch.id = $1`,
      [id],
      'cost head',
    );
  }

  /**
   * Admin only (section 26). This is where "Miscellenous" gets
   * corrected if it ever should be — the seed matches on `seed_key`
   * and never rewrites the name, so a rename here survives every later
   * deploy.
   */
  @Patch(':id')
  @ModuleRole('budget', 'admin')
  @Can('budget.cost_heads.manage')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CostHeadDto,
  ): Promise<CostHeadRow> {
    try {
      await findOneOrFail(
        this.pool,
        `update cost_heads
         set name = $1,
             is_active = coalesce($2, is_active)
         where id = $3 returning id`,
        [body.name, body.isActive ?? null, id],
        'cost head',
      );
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`There is already a cost head called "${body.name}".`);
      }
      throw error;
    }
    return this.get(id);
  }

  @Post()
  @ModuleRole('budget', 'admin')
  @Can('budget.cost_heads.manage')
  async create(@Body() body: CostHeadDto): Promise<CostHeadRow> {
    try {
      const { rows } = await this.pool.query(
        `insert into cost_heads (name, sort_order)
         values ($1, (select coalesce(max(sort_order), 0) + 1 from cost_heads))
         returning id`,
        [body.name],
      );
      return this.get(rows[0].id);
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`There is already a cost head called "${body.name}".`);
      }
      throw error;
    }
  }

  /**
   * A head that has been used is DEACTIVATED, not deleted — budgets and
   * expenses reference it, and removing it would remove the money.
   * Deletion only succeeds for a head nothing points at.
   */
  @Delete(':id')
  @ModuleRole('budget', 'admin')
  @Can('budget.cost_heads.manage')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    try {
      await findOneOrFail(
        this.pool, 'delete from cost_heads where id = $1 returning id', [id], 'cost head',
      );
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          'This cost head is used by a budget or an expense. Deactivate it instead.',
        );
      }
      throw error;
    }
  }
}
