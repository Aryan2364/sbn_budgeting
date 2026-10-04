import { ForbiddenException } from '@nestjs/common';
import type { Pool } from 'pg';

import { type AccessContext, type PickSection, can } from '../access/access-context';
import { PICK_ACTION, keyInfo, type PermissionKey, type RecordType } from '../access/catalogue';
import { reasonFor } from '../access/permission.guard';
import { type Param, scopeWhere } from '../access/scope';

/**
 * The one query behind every Pick endpoint, `GET /pick/<module>/<section>?q=`
 * (access plan 6.1.4 item 7, R11.7, backend kit 3.5).
 *
 * - Returns the section's declared Pick fields only (never an amount,
 *   phone or email), as the spec's `select` names them.
 * - Scoped by the union of the Pick scopes the caller holds, through
 *   scopeWhere. A master section's Pick is held by everyone at All and
 *   is not scoped.
 * - Searched by `q` on the name (server-side ilike; the client sends it
 *   300 ms after typing stops), at most 50 matches, ordered by name.
 * - No `ids=` and no paging: a form shows its saved values from the
 *   names embedded in the record (kit 3.5 rule 6), never through a Pick.
 *
 * P3b's per-module pick controllers (pick/<module>-pick.controller.ts)
 * call this; PickModule registers them.
 */

export const PICK_LIMIT = 50;

export interface PickSpec {
  /** 'budget.sites': the Pick key is '<section>.pick'. */
  section: PickSection;
  /** `sites s`, plus any joins the fields need. */
  from: string;
  /** The record's alias in `from` (scoped sections only). */
  alias: string;
  /** The declared fields, aliased: `s.id, s.name`. */
  select: string;
  /** The name expression, for `q` and the order. */
  nameSql: string;
  /**
   * Narrowing filters the Pick declares (the people Pick's designationId
   * and canReceive, plan 5.3.3). They may narrow, never widen.
   */
  where?: (param: Param) => string[];
}

export async function runPickQuery<T>(pool: Pool, ctx: AccessContext, spec: PickSpec, q?: string): Promise<T[]> {
  const key = `${spec.section}.${PICK_ACTION}` as PermissionKey;
  if (!can(ctx, key)) {
    const reason = reasonFor(key);
    throw new ForbiddenException({ error: 'forbidden', permission: key, reason, message: reason });
  }
  const values: unknown[] = [];
  const param: Param = (v) => {
    values.push(v);
    return `$${values.length}`;
  };

  const record = keyInfo(key)?.section?.record;
  const conditions: string[] = [];
  if (record && record !== 'master' && record !== 'none') {
    conditions.push(scopeWhere(ctx, key, record as RecordType, spec.alias, param));
  }
  conditions.push(...(spec.where?.(param) ?? []).map((c) => `(${c})`));
  const search = q?.trim();
  if (search) conditions.push(`${spec.nameSql} ilike ${param(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}`);

  const { rows } = await pool.query(
    `select ${spec.select}
     from ${spec.from}
     ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
     order by ${spec.nameSql} asc nulls last
     limit ${PICK_LIMIT}`,
    values,
  );
  return rows as T[];
}
