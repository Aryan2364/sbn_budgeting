import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Pool } from 'pg';

import { findOneOrFail } from '../common/crud';
import { Roles } from '../common/roles.decorator';
import { PG_POOL } from '../db/db.module';

export class BudgetCellDto {
  @IsUUID()
  costHeadId!: string;

  @IsInt()
  @Min(0)
  @Max(4)
  period!: number;

  /**
   * Paise, as a STRING. Never a JS number — a per-tree amount is small
   * but this is the same wire format every other amount uses, and a
   * type that is sometimes a number is a type nobody checks.
   *
   * `null` means the user cleared the cell, and the row is DELETED
   * (AGENTS.md 31.2). It does not mean zero.
   */
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Enter an amount in paise, digits only' })
  perTreePaise!: string | null;
}

export class BudgetGridDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCellDto)
  cells!: BudgetCellDto[];
}

export interface BudgetCell {
  costHeadId: string;
  period: number;
  perTreePaise: string;
}

/**
 * Per-tree budget entry. AGENTS.md section 31.
 *
 * The grid is 19 cost heads x 5 periods. Only the cells carrying a
 * number exist as rows: a blank cell is an absent row, and that is what
 * makes "Budget not set" and "0.00" different facts downstream
 * (question 7).
 */
@Controller('sites/:siteId/budget')
export class BudgetsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  async get(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
  ): Promise<{ siteId: string; plannedTrees: number; cells: BudgetCell[] }> {
    const site = await findOneOrFail<{ id: string; plannedTrees: number }>(
      this.pool,
      'select id, planned_trees as "plannedTrees" from sites where id = $1',
      [siteId],
      'site',
    );
    const { rows } = await this.pool.query<BudgetCell>(
      `select cost_head_id as "costHeadId", period,
              per_tree_paise as "perTreePaise"
       from site_budgets where site_id = $1`,
      [siteId],
    );
    return { siteId: site.id, plannedTrees: site.plannedTrees, cells: rows };
  }

  /**
   * Replaces the whole grid in one transaction. One Save for the screen
   * (section 31.5), so one write.
   *
   * A cell with an amount is upserted. **A cell sent as null is
   * deleted** — that is the round trip section 31.2 requires: type 0,
   * save, clear, save, and the row is gone rather than sitting there as
   * a zero nobody chose.
   *
   * Cells the client does not mention are left alone, so a future
   * partial save cannot silently wipe the rest of the grid.
   */
  @Put()
  @Roles('admin', 'staff')
  async replace(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Body() body: BudgetGridDto,
  ): Promise<{ siteId: string; plannedTrees: number; cells: BudgetCell[] }> {
    await findOneOrFail(this.pool, 'select id from sites where id = $1', [siteId], 'site');

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      for (const cell of body.cells) {
        if (cell.perTreePaise === null) {
          await client.query(
            `delete from site_budgets
             where site_id = $1 and cost_head_id = $2 and period = $3`,
            [siteId, cell.costHeadId, cell.period],
          );
        } else {
          await client.query(
            `insert into site_budgets (site_id, cost_head_id, period, per_tree_paise)
             values ($1, $2, $3, $4)
             on conflict (site_id, cost_head_id, period)
               do update set per_tree_paise = excluded.per_tree_paise`,
            [siteId, cell.costHeadId, cell.period, cell.perTreePaise],
          );
        }
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return this.get(siteId);
  }
}
