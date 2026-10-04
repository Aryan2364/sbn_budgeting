import {
  Body,
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
  Matches,
  Max,
  Min,
} from 'class-validator';
import type { Pool } from 'pg';

import { buildUpdate } from '../common/crud';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo, type WithCan } from '../common/list-query';
import { ModuleAccess, ModuleRole } from '../common/module-access.decorator';
import { type AccessContext, CurrentAccess } from '../access/access-context';
import type { PermissionKey } from '../access/catalogue';
import { Can } from '../access/decorators';
import { assertRecordAccess, canSelect, scopeWhere } from '../access/scope';
import { assertSiteCreatable, inTransaction, notFound, params } from '../sites/budget-access';
import { PG_POOL } from '../db/db.module';

export class ExpenseDto {
  @IsUUID(undefined, { message: 'Choose the site this expense belongs to' })
  siteId!: string;

  @IsUUID(undefined, { message: 'Choose a cost head' })
  costHeadId!: string;

  @IsDateString({}, { message: 'Enter the date, like 21/03/26' })
  spentOn!: string;

  /**
   * Stored, never derived at read time (question 6). The form
   * pre-fills it from `spentOn` against the site's plantation start
   * date and the user may override it; what arrives here is the record.
   */
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0, { message: 'Choose a period' })
  @Max(4, { message: 'Choose a period' })
  period!: number;

  /** Paise, as a string. Never a JS number. */
  @Matches(/^\d+$/, { message: 'Enter an amount, like 4,200.00' })
  amountPaise!: string;

  @IsOptional()
  @IsString()
  billNumber?: string | null;

  @IsOptional()
  @IsString()
  approvedBy?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

/**
 * The four new list filters, validated the same way the corresponding
 * `ExpenseDto` fields are: dates via `@IsDateString`, paise amounts as
 * digit strings via `@Matches`. Bound with `@Query()` alongside the
 * existing single-param filters, so an invalid value 400s before it
 * ever reaches `runListQuery`.
 */
export class ExpenseFilterQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'Enter the date, like 21/03/26' })
  spentOnFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enter the date, like 21/03/26' })
  spentOnTo?: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'Enter an amount, like 4,200.00' })
  amountMin?: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'Enter an amount, like 4,200.00' })
  amountMax?: string;
}

export interface ExpenseRow {
  id: string;
  siteId: string;
  siteName: string;
  costHeadId: string;
  costHeadName: string;
  spentOn: string;
  period: number;
  amountPaise: string;
  billNumber: string | null;
  approvedBy: string | null;
  description: string | null;
  createdAt: string;
  /**
   * Who entered it. Null on rows from before this was recorded (the
   * seed and imports), which match no Own scope, so only someone who
   * edits expenses at a wider scope can edit them. The row's `can.edit`
   * says so before the click.
   */
  createdById: string | null;
}

/** The existing not-found wording (R7: an expense outside your scope reads exactly the same). */
const NOT_FOUND = 'That expense no longer exists. It may have been deleted.';

/**
 * The expense's per-record answers (plan 6.1.4 item 6). The form reads
 * `can.edit` to disable Save, with the reason, before the click: the
 * same SQL the PATCH below checks.
 */
const EXPENSE_CAN = {
  edit: 'budget.expenses.edit',
  delete: 'budget.expenses.delete',
} as const satisfies Record<string, PermissionKey>;

const SELECT = `
  e.id, e.site_id as "siteId", s.name as "siteName",
  e.cost_head_id as "costHeadId", ch.name as "costHeadName",
  e.spent_on as "spentOn", e.period, e.amount_paise as "amountPaise",
  e.bill_number as "billNumber", e.approved_by as "approvedBy",
  e.description, e.created_at as "createdAt", e.created_by as "createdById"`;

const FROM = `
  expenses e
  join sites s on s.id = e.site_id
  join cost_heads ch on ch.id = e.cost_head_id`;

@ModuleAccess('budget')
@Controller('expenses')
export class ExpensesController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @Can('budget.expenses.view')
  list(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
    @Query('siteId') siteId?: string,
    @Query('costHeadId') costHeadId?: string,
    @Query('period') period?: string,
    @Query() rangeFilters?: ExpenseFilterQueryDto,
  ): Promise<ListResult<ExpenseRow & MatchInfo & WithCan>> {
    return runListQuery<ExpenseRow & WithCan>(
      this.pool,
      {
        scope: { key: 'budget.expenses.view', record: 'expense', alias: 'e' },
        can: EXPENSE_CAN,
        from: FROM,
        select: SELECT,
        titleField: { sql: 's.name', label: 'Site' },
        /**
         * Section 27.1. bill_number and approved_by are exactly the
         * fields a "chosen few" search would miss and a bookkeeper
         * would search first.
         */
        searchFields: [
          { sql: 'ch.name', label: 'Cost head' },
          { sql: 'e.bill_number', label: 'Bill number' },
          { sql: 'e.approved_by', label: 'Approved by' },
          { sql: 'e.description', label: 'Description' },
        ],
        sortable: {
          spentOn: 'e.spent_on',
          siteName: 's.name',
          costHeadName: 'ch.name',
          amountPaise: 'e.amount_paise',
          period: 'e.period',
          createdAt: 'e.created_at',
        },
        defaultSort: { key: 'spentOn', direction: 'desc' },
        filters: {
          siteId: (v, param) => `e.site_id = ${param(v)}`,
          costHeadId: (v, param) => `e.cost_head_id = ${param(v)}`,
          period: (v, param) => `e.period = ${param(Number(v))}`,
          spentOnFrom: (v, param) => `e.spent_on >= ${param(v)}`,
          spentOnTo: (v, param) => `e.spent_on <= ${param(v)}`,
          amountMin: (v, param) => `e.amount_paise >= ${param(v)}`,
          amountMax: (v, param) => `e.amount_paise <= ${param(v)}`,
        },
        aggregates: { amountPaise: 'sum(e.amount_paise)' },
        // See amounts (plan 6.1.6): refused or dropped without budget.amounts.see.
        amountKeys: ['amountPaise', 'amountMin', 'amountMax'],
      },
      {
        ...query,
        filters: {
          siteId,
          costHeadId,
          period,
          spentOnFrom: rangeFilters?.spentOnFrom,
          spentOnTo: rangeFilters?.spentOnTo,
          amountMin: rangeFilters?.amountMin,
          amountMax: rangeFilters?.amountMax,
        },
      },
      access,
    );
  }

  /** One expense in the caller's view scope, with its `can`. Outside it: 404, as if missing (R7). */
  @Get(':id')
  @Can('budget.expenses.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<ExpenseRow & WithCan> {
    return this.read(access, id);
  }

  private async read(access: AccessContext, id: string): Promise<ExpenseRow & WithCan> {
    const { values, param } = params();
    const idParam = param(id);
    const { rows } = await this.pool.query<ExpenseRow & WithCan>(
      `select ${SELECT}, ${canSelect(access, EXPENSE_CAN, 'expense', 'e', param)} as "can"
       from ${FROM}
       where e.id = ${idParam}::uuid and ${scopeWhere(access, 'budget.expenses.view', 'expense', 'e', param)}`,
      values,
    );
    if (!rows[0]) throw notFound('expense');
    return rows[0];
  }

  /** O5: the site must be within the reach of the caller's create scope. */
  @Post()
  @Can('budget.expenses.create')
  async create(
    @Body() body: ExpenseDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<ExpenseRow & WithCan> {
    await assertSiteCreatable(this.pool, access, 'budget.expenses.create', body.siteId);
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into expenses
         (site_id, cost_head_id, spent_on, period, amount_paise,
          bill_number, approved_by, description, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        body.siteId,
        body.costHeadId,
        body.spentOn,
        body.period,
        body.amountPaise,
        body.billNumber ?? null,
        body.approvedBy ?? null,
        body.description ?? null,
        user.id,
      ],
    );
    return this.read(access, rows[0]!.id);
  }

  /**
   * Which expenses the caller may edit is decided by the record, in the
   * same SQL as the row's `can.edit`: budget staff hold edit at Own, so
   * only what they entered themselves (security fix 3, plan 3.4.8); a
   * legacy row with no creator matches no Own. Moving the expense to
   * another site checks the new site as a create would (O5).
   */
  @Patch(':id')
  @Can('budget.expenses.edit')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ExpenseDto,
    @CurrentAccess() access: AccessContext,
  ): Promise<ExpenseRow & WithCan> {
    await inTransaction(this.pool, async (client) => {
      await assertRecordAccess(client, access, {
        table: 'expenses',
        alias: 'e',
        record: 'expense',
        id,
        view: 'budget.expenses.view',
        action: 'budget.expenses.edit',
        notFound: NOT_FOUND,
        forUpdate: true,
      });
      const { rows } = await client.query<{ siteId: string }>(
        `select site_id as "siteId" from expenses /*scope-exempt: follows the scoped read of this row*/ where id = $1`,
        [id],
      );
      if (rows[0] && body.siteId && body.siteId.toLowerCase() !== rows[0].siteId.toLowerCase()) {
        await assertSiteCreatable(client, access, 'budget.expenses.create', body.siteId);
      }

      const { clause, values } = buildUpdate({
        site_id: body.siteId,
        cost_head_id: body.costHeadId,
        spent_on: body.spentOn,
        period: body.period,
        amount_paise: body.amountPaise,
        bill_number: body.billNumber ?? null,
        approved_by: body.approvedBy ?? null,
        description: body.description ?? null,
      });
      await client.query(
        `update expenses set ${clause} /*scope-exempt: follows the scoped read of this row*/
         where id = $${values.length + 1}`,
        [...values, id],
      );
    });
    return this.read(access, id);
  }

  @Delete(':id')
  @ModuleRole('budget', 'admin')
  @Can('budget.expenses.delete')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      await assertRecordAccess(client, access, {
        table: 'expenses',
        alias: 'e',
        record: 'expense',
        id,
        view: 'budget.expenses.view',
        action: 'budget.expenses.delete',
        notFound: NOT_FOUND,
        forUpdate: true,
      });
      await client.query('delete from expenses /*scope-exempt: follows the scoped read of this row*/ where id = $1', [id]);
    });
  }
}
