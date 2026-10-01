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

export class LocationDto {
  @IsString()
  @MinLength(1, { message: 'Enter the location name' })
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export interface LocationRow {
  id: string;
  name: string;
  isActive: boolean;
  siteCount: number;
  complaintCount: number;
}

/**
 * The Locations master (plan 3.1a), shared by every module: budget
 * links a site to one. Complaints raised before 1 Oct 2026 were filed
 * against a location; newer ones name a site (CONTRACT section 10).
 * Served at /locations and at /site-locations, the old path, so the
 * budget screens keep working through the rename.
 *
 * Readable by anyone signed in (pickers need it); writes are platform
 * admin only.
 *
 * A location has no people (removed 1 Oct 2026, user decision): routing
 * is per site (sites.supervisor_id / manager_id), so the old supervisor,
 * manager and userCount fields and PUT :id/assignments are gone. The
 * user_locations table is left in place but nothing reads or writes it.
 */
@Controller(['locations', 'site-locations'])
export class LocationsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private static readonly FROM = `
    locations l
    left join lateral (
      select
        (select count(*)::int from sites s where s.location_id = l.id) as site_count,
        -- Older complaints name the location; since 1 Oct 2026 they name
        -- a site, which counts here through the site's location (0011).
        (select count(*)::int from complaints c
          where c.location_id = l.id
             or c.site_id in (select s2.id from sites s2 where s2.location_id = l.id))
          as complaint_count
    ) a on true`;

  private static readonly SELECT = `
    l.id, l.name, l.is_active as "isActive",
    a.site_count as "siteCount", a.complaint_count as "complaintCount"`;

  @Get()
  list(
    @Query() query: ListQueryDto,
    @Query('isActive') isActive?: string,
  ): Promise<ListResult<LocationRow & MatchInfo>> {
    return runListQuery<LocationRow>(
      this.pool,
      {
        from: LocationsController.FROM,
        select: LocationsController.SELECT,
        titleField: { sql: 'l.name', label: 'Location' },
        sortable: {
          name: 'l.name',
          siteCount: 'a.site_count',
          complaintCount: 'a.complaint_count',
        },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: {
          isActive: (value, param) => `l.is_active = ${param(value === 'true')}`,
        },
      },
      { ...query, filters: { isActive } },
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<LocationRow> {
    return findOneOrFail<LocationRow>(
      this.pool,
      `select ${LocationsController.SELECT}
       from ${LocationsController.FROM} where l.id = $1`,
      [id],
      'location',
    );
  }

  @Post()
  @ModuleRole('platform', 'admin')
  async create(@Body() body: LocationDto): Promise<LocationRow> {
    await this.assertNameFree(body.name, null);
    try {
      const { rows } = await this.pool.query(
        'insert into locations (name, is_active) values ($1, coalesce($2, true)) returning id',
        [body.name.trim(), body.isActive ?? null],
      );
      return this.get(rows[0].id);
    } catch (error) {
      throw LocationsController.translate(error, body.name);
    }
  }

  @Patch(':id')
  @ModuleRole('platform', 'admin')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: LocationDto,
  ): Promise<LocationRow> {
    await this.assertNameFree(body.name, id);
    const { clause, values } = buildUpdate({ name: body.name.trim(), is_active: body.isActive });
    try {
      await findOneOrFail(
        this.pool,
        `update locations set ${clause} where id = $${values.length + 1} returning id`,
        [...values, id],
        'location',
      );
    } catch (error) {
      throw LocationsController.translate(error, body.name);
    }
    return this.get(id);
  }

  @Delete(':id')
  @ModuleRole('platform', 'admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    const row = await this.get(id);
    const uses: string[] = [];
    if (row.siteCount > 0) uses.push(plural(row.siteCount, 'site', 'sites'));
    if (row.complaintCount > 0) uses.push(plural(row.complaintCount, 'complaint', 'complaints'));
    if (uses.length > 0) {
      throw new ConflictException(
        `${row.name} is still used by ${uses.join(', ')}. Deactivate it instead, so it stops ` +
          'appearing in pickers and its history stays intact.',
      );
    }
    try {
      await this.pool.query('delete from locations where id = $1', [id]);
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(`${row.name} is still in use. Deactivate it instead.`);
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
      `select name from locations
       where lower(btrim(name)) = lower(btrim($1)) and ($2::uuid is null or id <> $2::uuid)`,
      [name, exceptId],
    );
    if (rows[0]) {
      throw new ConflictException(`There is already a location called "${rows[0].name}".`);
    }
  }

  private static translate(error: unknown, name: string): unknown {
    if (isPgError(error, PG_UNIQUE_VIOLATION)) {
      return new ConflictException(`There is already a location called "${name.trim()}".`);
    }
    return error;
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
