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

import { buildUpdate, findOneOrFail } from '../common/crud';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { Roles } from '../common/roles.decorator';
import { PG_POOL } from '../db/db.module';

export class ExpenseDto {
  @IsUUID(undefined, { message: 'Choose the site this expense belongs to' })
  siteId!: string;

  @IsUUID(undefined, { message: 'Choose a cost head' })
  costHeadId!: string;

  @IsDateString({}, { message: 'Enter the date, like 12 Aug 2026' })
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
  createdAt: string;
}

const SELECT = `
  e.id, e.site_id as "siteId", s.name as "siteName",
  e.cost_head_id as "costHeadId", ch.name as "costHeadName",
  e.spent_on as "spentOn", e.period, e.amount_paise as "amountPaise",
  e.bill_number as "billNumber", e.approved_by as "approvedBy",
  e.created_at as "createdAt"`;

const FROM = `
  expenses e
  join sites s on s.id = e.site_id
  join cost_heads ch on ch.id = e.cost_head_id`;

@Controller('expenses')
export class ExpensesController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  list(
    @Query() query: ListQueryDto,
    @Query('siteId') siteId?: string,
    @Query('costHeadId') costHeadId?: string,
    @Query('period') period?: string,
  ): Promise<ListResult<ExpenseRow & MatchInfo>> {
    return runListQuery<ExpenseRow>(
      this.pool,
      {
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
        },
      },
      { ...query, filters: { siteId, costHeadId, period } },
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ExpenseRow> {
    return findOneOrFail<ExpenseRow>(
      this.pool,
      `select ${SELECT} from ${FROM} where e.id = $1`,
      [id],
      'expense',
    );
  }

  @Post()
  async create(@Body() body: ExpenseDto, @CurrentUser() user: AuthUser): Promise<ExpenseRow> {
    const { rows } = await this.pool.query(
      `insert into expenses
         (site_id, cost_head_id, spent_on, period, amount_paise,
          bill_number, approved_by, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        body.siteId,
        body.costHeadId,
        body.spentOn,
        body.period,
        body.amountPaise,
        body.billNumber ?? null,
        body.approvedBy ?? null,
        user.id,
      ],
    );
    return this.get(rows[0].id);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ExpenseDto,
  ): Promise<ExpenseRow> {
    const { clause, values } = buildUpdate({
      site_id: body.siteId,
      cost_head_id: body.costHeadId,
      spent_on: body.spentOn,
      period: body.period,
      amount_paise: body.amountPaise,
      bill_number: body.billNumber ?? null,
      approved_by: body.approvedBy ?? null,
    });
    await findOneOrFail(
      this.pool,
      `update expenses set ${clause} where id = $${values.length + 1} returning id`,
      [...values, id],
      'expense',
    );
    return this.get(id);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await findOneOrFail(
      this.pool,
      'delete from expenses where id = $1 returning id',
      [id],
      'expense',
    );
  }
}
