import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import type { Pool } from 'pg';

import { type AccessContext, CurrentAccess } from '../access/access-context';
import { PickOf } from '../access/decorators';
import { PG_POOL } from '../db/db.module';
import { runPickQuery } from './pick-query';

/**
 * The Complaints module's Picks (access plan 5.3.2, 6.1.4 item 7,
 * R11.7): `GET /pick/complaints/<section>?q=`.
 *
 * The complaints catalogue declares one Pick: categories, a master that
 * every active signed-in user picks (`pick.everyone`, decision 26). The
 * complaints section itself has no Pick (O10 Q8), and raising chooses
 * its site through `GET /complaints/sites` under the raise key (O5),
 * not through a Pick.
 *
 * Same contract as the other lanes' Pick controllers: the declared
 * fields only, at most 50 matches ordered by name, searched on the
 * server by `q`, no paging and no `ids=` (a form shows its saved value
 * from the name embedded in the record, kit 3.5 rule 6). Decided by the
 * new route guard from the start (NEW_SYSTEM_PREFIXES).
 */

/** A single query-string value, or a 400; `?q=a&q=b` is not a search. */
function one(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`Send ${name} once, as text.`);
  return value;
}

/** `true` widens to retired categories too; `false` or absent leaves them out. */
function flag(value: unknown, name: string): boolean {
  const v = one(value, name);
  if (v === undefined || v === '' || v === 'false') return false;
  if (v === 'true') return true;
  throw new BadRequestException(`${name} must be true or false.`);
}

/**
 * One category to choose from: the catalogue's declared pick fields
 * (`complaints.categories` pick.fields). `requiresApproval` and
 * `approverDesignation` are what the raise form tells the raiser before
 * they submit ("closing needs approval by the HOD"); never a usage
 * count, which stays on the managed list.
 */
export interface CategoryOption {
  id: string;
  name: string;
  isActive: boolean;
  requiresApproval: boolean;
  approverDesignation: { id: string; name: string } | null;
}

@Controller('pick/complaints')
export class ComplaintsPickController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Complaint categories. Retired ones are left out unless
   * `includeInactive=true`: the raise form must not offer a retired
   * category (kit 15.2), while the list's filter still needs them,
   * because an old complaint keeps its category. `isActive` says which
   * is which.
   */
  @PickOf('complaints.categories')
  @Get('categories')
  categories(
    @CurrentAccess() access: AccessContext,
    @Query('q') q?: unknown,
    @Query('includeInactive') includeInactive?: unknown,
  ): Promise<CategoryOption[]> {
    const all = flag(includeInactive, 'includeInactive');
    return runPickQuery<CategoryOption>(
      this.pool,
      access,
      {
        section: 'complaints.categories',
        from: 'complaint_categories cc left join designations ad on ad.id = cc.approver_designation_id',
        alias: 'cc',
        select: `cc.id, cc.name, cc.is_active as "isActive", cc.requires_approval as "requiresApproval",
                 case when ad.id is null then null
                      else json_build_object('id', ad.id, 'name', ad.name) end as "approverDesignation"`,
        nameSql: 'cc.name',
        where: () => (all ? [] : ['cc.is_active']),
      },
      one(q, 'q'),
    );
  }
}
