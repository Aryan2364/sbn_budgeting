import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, Inject,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import type { Pool } from 'pg';

import {
  buildUpdate, findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { ModuleRole } from '../common/module-access.decorator';
import { PG_POOL } from '../db/db.module';

export class DesignationDto {
  @IsString()
  @MinLength(1, { message: 'Enter the designation name' })
  name!: string;

  // No sortOrder: the list is in name order and nobody sets a position
  // (kit section 40 was withdrawn on 1 Oct 2026: there is no ordering
  // concept). One sent anyway is stripped by the whitelist and ignored.

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export interface DesignationRow {
  id: string;
  name: string;
  seedKey: string | null;
  /** Internal and never shown or set by anyone; kept so the row shape is unchanged. */
  sortOrder: number;
  isActive: boolean;
  userCount: number;
}

/**
 * Admin-editable master (plan 3.3). seed_key is the stable identity the
 * complaints routing reads, so a seeded row can be renamed or
 * deactivated but never deleted — the cost_heads pattern.
 *
 * Reads are open to anyone signed in, because the people form's picker
 * needs them. Writes are platform admin only.
 */
@Controller('designations')
export class DesignationsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private static readonly FROM = `
    designations d
    left join lateral (
      select count(*)::int as user_count from users u where u.designation_id = d.id
    ) c on true`;

  private static readonly SELECT = `
    d.id, d.name, d.seed_key as "seedKey", d.sort_order as "sortOrder",
    d.is_active as "isActive", c.user_count as "userCount"`;

  @Get()
  list(
    @Query() query: ListQueryDto,
    @Query('isActive') isActive?: string,
  ): Promise<ListResult<DesignationRow & MatchInfo>> {
    return runListQuery<DesignationRow>(
      this.pool,
      {
        from: DesignationsController.FROM,
        select: DesignationsController.SELECT,
        titleField: { sql: 'd.name', label: 'Designation' },
        // seed_key is an internal identifier, not something a person
        // types; name is the only meaningful text on the row.
        searchFields: [],
        sortable: {
          name: 'd.name',
          userCount: 'c.user_count',
        },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: {
          isActive: (value, param) => `d.is_active = ${param(value === 'true')}`,
        },
      },
      { ...query, filters: { isActive } },
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<DesignationRow> {
    return findOneOrFail<DesignationRow>(
      this.pool,
      `select ${DesignationsController.SELECT}
       from ${DesignationsController.FROM} where d.id = $1`,
      [id],
      'designation',
    );
  }

  @Post()
  @ModuleRole('platform', 'admin')
  async create(@Body() body: DesignationDto): Promise<DesignationRow> {
    await this.assertNameFree(body.name, null);
    try {
      const { rows } = await this.pool.query(
        `insert into designations (name, sort_order, is_active)
         values ($1, (select coalesce(max(sort_order), 0) + 1 from designations),
                 coalesce($2, true))
         returning id`,
        [body.name.trim(), body.isActive ?? null],
      );
      return this.get(rows[0].id);
    } catch (error) {
      throw DesignationsController.translate(error, body.name);
    }
  }

  @Patch(':id')
  @ModuleRole('platform', 'admin')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DesignationDto,
  ): Promise<DesignationRow> {
    await this.assertNameFree(body.name, id);
    const { clause, values } = buildUpdate({
      name: body.name.trim(),
      is_active: body.isActive,
    });
    try {
      await findOneOrFail(
        this.pool,
        `update designations set ${clause} where id = $${values.length + 1} returning id`,
        [...values, id],
        'designation',
      );
    } catch (error) {
      throw DesignationsController.translate(error, body.name);
    }
    return this.get(id);
  }

  @Delete(':id')
  @ModuleRole('platform', 'admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    const row = await this.get(id);
    if (row.seedKey) {
      throw new ConflictException(
        `${row.name} is used to route complaints, so it can be renamed or deactivated but not deleted.`,
      );
    }
    if (row.userCount > 0) {
      throw new ConflictException(
        `${row.userCount} ${row.userCount === 1 ? 'person has' : 'people have'} the designation ${row.name}. ` +
          'Change their designation first, or deactivate it instead.',
      );
    }
    try {
      await this.pool.query('delete from designations where id = $1', [id]);
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          `Complaint categories use ${row.name} as their approver. Change their approver first, or deactivate ${row.name} instead.`,
        );
      }
      throw error;
    }
  }

  /**
   * The unique index is case-sensitive, but people (and the import,
   * which matches names case-insensitively) are not: "vesu" and "Vesu"
   * would be two rows nobody can tell apart.
   */
  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const { rows } = await this.pool.query<{ name: string }>(
      `select name from designations
       where lower(btrim(name)) = lower(btrim($1)) and ($2::uuid is null or id <> $2::uuid)`,
      [name, exceptId],
    );
    if (rows[0]) {
      throw new ConflictException(`There is already a designation called "${rows[0].name}".`);
    }
  }

  private static translate(error: unknown, name: string): unknown {
    if (isPgError(error, PG_UNIQUE_VIOLATION)) {
      return new ConflictException(`There is already a designation called "${name.trim()}".`);
    }
    return error;
  }
}
