import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, Inject,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import type { Pool } from 'pg';

import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { Roles } from '../common/roles.decorator';
import { PG_POOL } from '../db/db.module';

export class LocationDto {
  @IsString()
  @MinLength(1, { message: 'Enter the location name' })
  name!: string;
}

export interface LocationRow {
  id: string;
  name: string;
  siteCount: number;
}

/** Master data. Readable by anyone signed in, writable by an admin (§26). */
@Controller('site-locations')
export class LocationsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private static readonly FROM = `
    site_locations l
    left join lateral (
      select count(*)::int as site_count from sites s where s.site_location_id = l.id
    ) a on true`;

  @Get()
  list(@Query() query: ListQueryDto): Promise<ListResult<LocationRow & MatchInfo>> {
    return runListQuery<LocationRow>(
      this.pool,
      {
        from: LocationsController.FROM,
        select: 'l.id, l.name, a.site_count as "siteCount"',
        titleField: { sql: 'l.name', label: 'Location' },
        searchFields: [],
        sortable: { name: 'l.name', siteCount: 'a.site_count' },
        defaultSort: { key: 'name', direction: 'asc' },
      },
      query,
    );
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: LocationDto): Promise<LocationRow> {
    try {
      const { rows } = await this.pool.query(
        'insert into site_locations (name) values ($1) returning id',
        [body.name],
      );
      return this.get(rows[0].id);
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`There is already a location called "${body.name}".`);
      }
      throw error;
    }
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<LocationRow> {
    return findOneOrFail<LocationRow>(
      this.pool,
      `select l.id, l.name, a.site_count as "siteCount"
       from ${LocationsController.FROM} where l.id = $1`,
      [id],
      'location',
    );
  }

  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: LocationDto,
  ): Promise<LocationRow> {
    try {
      await findOneOrFail(
        this.pool,
        'update site_locations set name = $1 where id = $2 returning id',
        [body.name, id],
        'location',
      );
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`There is already a location called "${body.name}".`);
      }
      throw error;
    }
    return this.get(id);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    try {
      await findOneOrFail(
        this.pool, 'delete from site_locations where id = $1 returning id', [id], 'location',
      );
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException('Sites still use this location. Change them first.');
      }
      throw error;
    }
  }
}
