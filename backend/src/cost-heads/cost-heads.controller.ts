import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, Inject,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { Pool } from 'pg';

import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { Roles } from '../common/roles.decorator';

export class CostHeadDto {
  @IsString()
  @MinLength(1, { message: 'Enter the cost head name' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  sortOrder?: number;

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
}

@Controller('cost-heads')
export class CostHeadsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

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
  list(
    @Query() query: ListQueryDto,
    @Query('isActive') isActive?: string,
  ): Promise<ListResult<CostHeadRow & MatchInfo>> {
    return runListQuery<CostHeadRow>(
      this.pool,
      {
        from: 'cost_heads ch',
        select:
          'ch.id, ch.name, ch.sort_order as "sortOrder", ch.is_active as "isActive"',
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
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<CostHeadRow> {
    return findOneOrFail<CostHeadRow>(
      this.pool,
      `select id, name, sort_order as "sortOrder", is_active as "isActive"
       from cost_heads where id = $1`,
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
  @Roles('admin')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CostHeadDto,
  ): Promise<CostHeadRow> {
    try {
      await findOneOrFail(
        this.pool,
        `update cost_heads
         set name = $1,
             sort_order = coalesce($2, sort_order),
             is_active = coalesce($3, is_active)
         where id = $4 returning id`,
        [body.name, body.sortOrder ?? null, body.isActive ?? null, id],
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
  @Roles('admin')
  async create(@Body() body: CostHeadDto): Promise<CostHeadRow> {
    try {
      const { rows } = await this.pool.query(
        `insert into cost_heads (name, sort_order)
         values ($1, coalesce($2, (select coalesce(max(sort_order), 0) + 1 from cost_heads)))
         returning id`,
        [body.name, body.sortOrder ?? null],
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
  @Roles('admin')
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
