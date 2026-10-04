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

import { ModuleAccess, ModuleRole } from '../common/module-access.decorator';
import { type AccessContext, CurrentAccess } from '../access/access-context';
import { Can } from '../access/decorators';
import { assertRecordAccess, scopeWhere } from '../access/scope';
import { inTransaction, notFound, params } from '../sites/budget-access';
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
 *
 * A site's budget is reached through its site (decision 26): the grid
 * of a site outside the caller's budgets scope is not found (R7).
 */
@ModuleAccess('budget')
@Controller('sites/:siteId/budget')
export class BudgetsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @Can('budget.budgets.view')
  get(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<{ siteId: string; plannedTrees: number; cells: BudgetCell[] }> {
    return this.read(access, siteId);
  }

  private async read(
    access: AccessContext,
    siteId: string,
  ): Promise<{ siteId: string; plannedTrees: number; cells: BudgetCell[] }> {
    const site = params();
    const siteParam = site.param(siteId);
    const { rows: sites } = await this.pool.query<{ id: string; plannedTrees: number }>(
      `select s.id, s.planned_trees as "plannedTrees" from sites s
       where s.id = ${siteParam}::uuid and ${scopeWhere(access, 'budget.budgets.view', 'site', 's', site.param)}`,
      site.values,
    );
    if (!sites[0]) throw notFound('site');

    const cells = params();
    const cellSite = cells.param(siteId);
    const { rows } = await this.pool.query<BudgetCell>(
      `select sb.cost_head_id as "costHeadId", sb.period,
              sb.per_tree_paise as "perTreePaise"
       from site_budgets sb
       where sb.site_id = ${cellSite}::uuid and ${scopeWhere(access, 'budget.budgets.view', 'site_budget', 'sb', cells.param)}`,
      cells.values,
    );
    return { siteId: sites[0].id, plannedTrees: sites[0].plannedTrees, cells: rows };
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
  @ModuleRole('budget', 'admin', 'staff')
  @Can('budget.budgets.edit')
  async replace(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Body() body: BudgetGridDto,
    @CurrentAccess() access: AccessContext,
  ): Promise<{ siteId: string; plannedTrees: number; cells: BudgetCell[] }> {
    await inTransaction(this.pool, async (client) => {
      // The site in view (else 404) and its budget editable (else 403), locked.
      await assertRecordAccess(client, access, {
        table: 'sites',
        alias: 's',
        record: 'site',
        id: siteId,
        view: 'budget.budgets.view',
        action: 'budget.budgets.edit',
        notFound: 'That site no longer exists. It may have been deleted.',
        forUpdate: true,
      });

      for (const cell of body.cells) {
        if (cell.perTreePaise === null) {
          await client.query(
            `delete from site_budgets /*scope-exempt: follows the scoped read of its site*/
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
    });

    return this.read(access, siteId);
  }
}
