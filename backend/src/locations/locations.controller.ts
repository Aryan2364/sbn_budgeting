import {
  Body, ConflictException, Controller, Delete, Get, HttpCode, Inject,
  Param, ParseUUIDPipe, Patch, Post, Put, Query, UnprocessableEntityException,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';
import type { Pool } from 'pg';

import {
  buildUpdate, findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { ModuleRole } from '../common/module-access.decorator';
import { assertOneEach, lockLocations } from '../common/one-each';
import { PG_POOL } from '../db/db.module';

export class LocationDto {
  @IsString()
  @MinLength(1, { message: 'Enter the location name' })
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignmentsDto {
  /** null removes the supervisor; leaving the key out leaves it alone. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Choose a supervisor from the list' })
  supervisorId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Choose a manager from the list' })
  managerId?: string | null;
}

interface Person {
  id: string;
  name: string;
}

export interface LocationRow {
  id: string;
  name: string;
  isActive: boolean;
  siteCount: number;
  userCount: number;
  complaintCount: number;
  supervisor: Person | null;
  manager: Person | null;
}

/** The person at a location who holds the designation with this seed key. */
const holder = (seedKey: 'supervisor' | 'manager'): string => `
  (select json_build_object('id', u.id, 'name', u.name)
   from user_locations ul
   join users u on u.id = ul.user_id
   join designations d on d.id = u.designation_id
   where ul.location_id = l.id and d.seed_key = '${seedKey}'
   order by u.name limit 1)`;

/**
 * The Locations master (plan 3.1a), shared by every module: budget
 * links a site to one, complaints files every complaint against one.
 * Served at /locations and at /site-locations, the old path, so the
 * budget screens keep working through the rename.
 *
 * Readable by anyone signed in (pickers need it); writes are platform
 * admin only.
 */
@Controller(['locations', 'site-locations'])
export class LocationsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private static readonly FROM = `
    locations l
    left join lateral (
      select
        (select count(*)::int from sites s where s.location_id = l.id) as site_count,
        (select count(*)::int from user_locations ul where ul.location_id = l.id) as user_count,
        (select count(*)::int from complaints c where c.location_id = l.id) as complaint_count
    ) a on true`;

  private static readonly SELECT = `
    l.id, l.name, l.is_active as "isActive",
    a.site_count as "siteCount", a.user_count as "userCount",
    a.complaint_count as "complaintCount",
    ${holder('supervisor')} as supervisor,
    ${holder('manager')} as manager`;

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
        // The supervisor and manager are searched too: "who covers Vesu"
        // and "where is Ramesh" are the same question asked both ways.
        searchFields: [
          { sql: `(${holder('supervisor')} ->> 'name')`, label: 'Supervisor' },
          { sql: `(${holder('manager')} ->> 'name')`, label: 'Manager' },
        ],
        sortable: {
          name: 'l.name',
          siteCount: 'a.site_count',
          userCount: 'a.user_count',
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

  /**
   * Sets who supervises and manages this location (plan 3.3: the same
   * table is the access scope and the routing map). The previous
   * holder loses THIS location only; their other locations are theirs.
   */
  @Put(':id/assignments')
  @ModuleRole('platform', 'admin')
  async assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AssignmentsDto,
  ): Promise<LocationRow> {
    await this.get(id);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await lockLocations(client, [id]);

      const touched: string[] = [];
      for (const [seedKey, personId] of [
        ['supervisor', body.supervisorId],
        ['manager', body.managerId],
      ] as const) {
        if (personId === undefined) continue;

        if (personId !== null) {
          const { rows } = await client.query<{ name: string; seedKey: string | null }>(
            `select u.name, d.seed_key as "seedKey"
             from users u left join designations d on d.id = u.designation_id
             where u.id = $1`,
            [personId],
          );
          const person = rows[0];
          if (!person) {
            throw new UnprocessableEntityException(
              `The chosen ${seedKey} no longer exists. Refresh and choose again.`,
            );
          }
          if (person.seedKey !== seedKey) {
            const label = seedKey === 'supervisor' ? 'Supervisor' : 'Manager';
            throw new UnprocessableEntityException(
              `${person.name} is not a ${label}. Set their designation to ${label} in ` +
                `Settings → People first, or choose someone who is.`,
            );
          }
        }

        // Remove whoever held this role here, unless it is the same person.
        await client.query(
          `delete from user_locations ul
           using users u, designations d
           where ul.location_id = $1 and u.id = ul.user_id
             and d.id = u.designation_id and d.seed_key = $2
             and ($3::uuid is null or ul.user_id <> $3::uuid)`,
          [id, seedKey, personId],
        );
        if (personId !== null) {
          await client.query(
            `insert into user_locations (user_id, location_id) values ($1, $2)
             on conflict do nothing`,
            [personId, id],
          );
          touched.push(personId);
        }
      }

      await assertOneEach(client, touched);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
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
    if (row.userCount > 0) uses.push(plural(row.userCount, 'person', 'people'));
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
