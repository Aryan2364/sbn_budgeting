import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import type { Pool } from 'pg';

import { type AccessContext, CurrentAccess } from '../access/access-context';
import { isPermissionKey } from '../access/catalogue';
import { PickOf } from '../access/decorators';
import { RoleMapService } from '../access/role-map.service';
import type { Param } from '../access/scope';
import { PG_POOL } from '../db/db.module';
import { designationFilter, type PersonOption } from '../users/users.controller';
import { runPickQuery } from './pick-query';

/**
 * The Settings module's Picks (access plan 5.3.3, 6.1.4 item 7, R11.7):
 * `GET /pick/platform/<section>?q=`. Each returns the section's declared
 * Pick fields only, at most 50 matches ordered by name, searched on the
 * server by `q`. There is no paging and no `ids=`: the client searches
 * as the user types (300 ms after typing stops, kit 27.1), and a form
 * shows its saved value from the name embedded in its own record (kit
 * 3.5 rule 6), never by looking it up here. That is what retires the
 * old pickers' preload of every person, which stopped at 100.
 *
 * Decided by the permission guard (@PickOf): a caller without the
 * Pick gets 403 with the kit 26.2 reason.
 */

/** A single query-string value, or a 400; `?q=a&q=b` is not a search. */
function one(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`Send ${name} once, as text.`);
  return value;
}

/** `true` narrows; `false` or absent leaves the list alone. Never widens. */
function flag(value: unknown, name: string): boolean {
  const v = one(value, name);
  if (v === undefined || v === '' || v === 'false') return false;
  if (v === 'true') return true;
  throw new BadRequestException(`${name} must be true or false.`);
}

/** `%` and `_` are wildcards in ILIKE. Someone searching "50%" means "50%". */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface DesignationOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface LocationOption {
  id: string;
  name: string;
  isActive: boolean;
}

@Controller('pick/platform')
export class PlatformPickController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly roleMap: RoleMapService,
  ) {}

  /**
   * People to choose from: `{ id, name, designationName }` (O10 Q7),
   * never a phone, an email or a module. Scoped by the union of the
   * people Pick scopes held (Own: yourself; Team: your reporting tree;
   * Selected sites: yourself and the leads of your sites; All: everyone).
   *
   * `q` matches the name or the designation, the two things the option
   * shows (kit 27.1). Narrowing filters (plan 5.3.3):
   *   designationId  one designation's people (`none`: nobody's yet);
   *   canReceive     `true`: only people who can take a complaint over,
   *                  i.e. active and able to sign in (plan 6.2);
   *   holds          a permission key: only people one of whose roles
   *                  grants it at some scope (reassign asks for
   *                  complaints.complaints.work, who can start and resolve).
   */
  @PickOf('platform.people')
  @Get('people')
  people(
    @CurrentAccess() access: AccessContext,
    @Query('q') q?: unknown,
    @Query('designationId') designationId?: unknown,
    @Query('canReceive') canReceive?: unknown,
    @Query('holds') holds?: unknown,
  ): Promise<PersonOption[]> {
    const search = one(q, 'q')?.trim();
    const designation = one(designationId, 'designationId');
    const receivers = flag(canReceive, 'canReceive');
    const key = one(holds, 'holds');
    if (key !== undefined && !isPermissionKey(key)) {
      throw new BadRequestException(`holds must be a permission key, like complaints.complaints.work.`);
    }
    const holders = key === undefined ? null : this.roleMap.rolesHolding(key);
    return runPickQuery<PersonOption>(this.pool, access, {
      section: 'platform.people',
      from: 'users u left join designations d on d.id = u.designation_id',
      alias: 'u',
      select: 'u.id, u.name, d.name as "designationName"',
      nameSql: 'u.name',
      where: (param: Param) => {
        const out: string[] = [];
        if (designation) out.push(designationFilter(designation, param));
        if (receivers) out.push('u.active and u.can_login');
        if (holders) {
          out.push(`exists (select 1 from user_roles hur where hur.user_id = u.id and hur.role_id = any(${param(holders)}::uuid[]))`);
        }
        // Searched here rather than through runPickQuery's `q`, which
        // matches the name only: the designation is on the option too.
        if (search) {
          const pattern = param(likePattern(search));
          out.push(`u.name ilike ${pattern} or d.name ilike ${pattern}`);
        }
        return out;
      },
    });
  }

  /**
   * Designations to choose from. Retired ones are left out unless
   * `includeInactive=true` (a filter, or a form keeping a retired value
   * on screen); `isActive` says which is which.
   */
  @PickOf('platform.designations')
  @Get('designations')
  designations(
    @CurrentAccess() access: AccessContext,
    @Query('q') q?: unknown,
    @Query('includeInactive') includeInactive?: unknown,
  ): Promise<DesignationOption[]> {
    const all = flag(includeInactive, 'includeInactive');
    return runPickQuery<DesignationOption>(
      this.pool,
      access,
      {
        section: 'platform.designations',
        from: 'designations d',
        alias: 'd',
        select: 'd.id, d.name, d.is_active as "isActive"',
        nameSql: 'd.name',
        where: () => (all ? [] : ['d.is_active']),
      },
      one(q, 'q'),
    );
  }

  /** Locations to choose from; retired ones as for designations. */
  @PickOf('platform.locations')
  @Get('locations')
  locations(
    @CurrentAccess() access: AccessContext,
    @Query('q') q?: unknown,
    @Query('includeInactive') includeInactive?: unknown,
  ): Promise<LocationOption[]> {
    const all = flag(includeInactive, 'includeInactive');
    return runPickQuery<LocationOption>(
      this.pool,
      access,
      {
        section: 'platform.locations',
        from: 'locations l',
        alias: 'l',
        select: 'l.id, l.name, l.is_active as "isActive"',
        nameSql: 'l.name',
        where: () => (all ? [] : ['l.is_active']),
      },
      one(q, 'q'),
    );
  }
}
