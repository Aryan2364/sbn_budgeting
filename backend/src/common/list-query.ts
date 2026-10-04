import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Pool } from 'pg';

import { type AccessContext, can } from '../access/access-context';
import type { PermissionKey, RecordType } from '../access/catalogue';
import { type RecordCan, canSelect, scopeWhere } from '../access/scope';

/**
 * The shared list convention. Written once, used by every list endpoint.
 *
 * AGENTS.md section 11.1 and 27, and the plan's Phase 3:
 *
 *   - server-side pagination, 25 rows a page by default;
 *   - sort by a DECLARED column, never by whatever the caller sends;
 *   - filters, declared the same way;
 *   - search that covers **every meaningful text field by default**,
 *     because search that silently misses is worse than search that
 *     finds too much — a user who types "Finance", gets nothing, and
 *     concludes no such record exists has no way to tell that they
 *     simply searched a field the box does not cover;
 *   - and when the match is on a field other than the title, the row
 *     **says where it matched**, or the results look random.
 *
 * One round trip. The total comes from a window function over the same
 * filtered set as the rows, so a count and a page can never disagree.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type SortDirection = 'asc' | 'desc';

export interface SearchField {
  /** SQL expression, already qualified: `ch.name`, `u.email`. */
  sql: string;
  /** What the user sees when a row matched here: "Email", "Phone". */
  label: string;
  /** Names the field in `amountKeys` when it is an amount. Defaults to `label`. */
  key?: string;
}

/**
 * Which records a list may return (access plan 6.1.4 item 1). REQUIRED,
 * so a list without one does not compile.
 *
 * - `{ key, record, alias }`: scoped. runListQuery calls scopeWhere for
 *   the caller's scopes of `key` over `alias` and ANDs it with every
 *   other condition, so the page, `total` and `aggregates` all cover the
 *   scoped set only.
 * - `{ unscoped: 'master' | 'own-data', why }`: stated, never silent.
 *   'master' = a master list behind its `manage` key (All only);
 *   'own-data' = only the caller's own rows, by construction.
 * - `{ unscoped: 'legacy-until-p9', why }`: a caller the OLD route guard
 *   still lets in but the new one will refuse at P9 (an intended
 *   difference, e.g. D4), answered exactly as before roles until then.
 *   Pair it with a reviewed exemption marker in `baseWhere`. P9
 *   deletes every one: the new guard then refuses these callers first.
 */
export type ListScope =
  | { key: PermissionKey; record: RecordType; alias: string }
  | { unscoped: 'master' | 'own-data' | 'legacy-until-p9'; why: string };

export type FilterBuilder = (
  value: string,
  param: (value: unknown) => string,
) => string;

export interface ListSpec {
  /**
   * `cost_heads ch` — table plus alias, and any joins. A function when a
   * join needs a parameter (a scoped lateral, e.g. a project's totals over
   * its visible sites only, plan 6.1.4 item 2); it gets the list's own
   * `param`, before any other condition.
   */
  from: string | ((param: (value: unknown) => string) => string);
  /** The row's own columns. Do not put aggregates here. */
  select: string;
  /**
   * The field a reader thinks of as the row's name. A match here needs
   * no explanation, so it is the one field that does NOT produce a
   * "matched in" note.
   */
  titleField: SearchField;
  /**
   * Every other meaningful text field on the record. Section 27.1:
   * fields left out of search must be declared and justified where the
   * list is defined, not omitted quietly.
   */
  searchFields?: SearchField[];
  /** Whitelist. A sort key that is not in here is a 400, not a guess. */
  sortable: Record<string, string>;
  defaultSort: { key: string; direction: SortDirection };
  filters?: Record<string, FilterBuilder>;
  /**
   * Always-on restriction, e.g. a soft-delete. A function receives
   * `param`, so a value (the caller's id in a "my work" tab) goes in as
   * a parameter, never inlined into the SQL (plan 6.1.4).
   */
  baseWhere?: string | ((param: (value: unknown) => string) => string);
  /**
   * Optional grand totals over EVERY row matching the current
   * search/filters, not just the page. Each value is a bare SQL
   * aggregate expression (`sum(e.amount_paise)`); this module adds the
   * `over ()` window itself so a caller cannot forget it and silently
   * get a per-row aggregate instead of a grand one. One round trip,
   * over the identical WHERE clause as the page and the total count.
   */
  aggregates?: Record<string, string>;
  /** Required: which records the caller may see. See ListScope. */
  scope: ListScope;
  /**
   * Per-record answers (plan 6.1.4 item 6): action name -> its key, e.g.
   * `{ edit: 'budget.expenses.edit' }`. Each row then carries
   * `can: { edit: true | '<reason>' }` for the actions the caller holds
   * at some scope, computed in the same query. Needs a scoped `scope`.
   */
  can?: Record<string, PermissionKey>;
  /**
   * Sort keys, filter keys, search fields (by `key ?? label`) and
   * aggregate keys that are amounts (plan 6.1.6, R10). Without
   * `<module>.amounts.see`:
   *   - a sort or filter on one is refused (403), or the order or the
   *     matches of the rows would leak the hidden values;
   *   - a search skips them (searching is over every text field at once,
   *     so the box keeps working on the rest);
   *   - an aggregate on one is not computed, and `aggregates` is absent
   *     when nothing is left in it;
   *   - a default sort on one falls back to the first other sortable key.
   * The module is the scope key's. On a scoped list, any sort, filter,
   * search or aggregate whose SQL reads a `*_paise` column counts as an
   * amount even if it is not declared here, so a forgotten declaration
   * fails closed (see `amountKeysOf`).
   */
  amountKeys?: string[];
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  direction?: SortDirection;
  filters?: Record<string, string | undefined>;
}

export interface ListResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: string;
  direction: SortDirection;
  search: string | null;
  /** Which filters were actually applied — the chips the toolbar shows. */
  appliedFilters: Record<string, string>;
  /**
   * Grand totals over every row matching the current search/filters,
   * keyed the same as `spec.aggregates`. Always strings: these are
   * money in paise and a JS number would silently lose precision.
   */
  aggregates?: Record<string, string>;
}

/** A row of a list whose spec declares `can`. */
export interface WithCan {
  can: RecordCan;
}

/** Rows come back carrying where the search hit, when it was not the title. */
export interface MatchInfo {
  matchedField: string | null;
  matchedValue: string | null;
}

/** A column holding money (bigint paise, as everywhere in this product). */
const AMOUNT_SQL = /_paise/i;

/**
 * The spec's amount keys: those declared in `amountKeys`, plus, on a
 * scoped list, every sort, filter, search field and aggregate whose SQL
 * reads a `*_paise` column. A filter's SQL is found by building it with
 * a probe value; builders are pure string functions.
 */
export function amountKeysOf(spec: ListSpec): Set<string> {
  const keys = new Set(spec.amountKeys ?? []);
  if (!('key' in spec.scope)) return keys;
  for (const [key, sql] of Object.entries(spec.sortable)) if (AMOUNT_SQL.test(sql)) keys.add(key);
  for (const [key, expr] of Object.entries(spec.aggregates ?? {})) if (AMOUNT_SQL.test(expr)) keys.add(key);
  for (const f of spec.searchFields ?? []) if (AMOUNT_SQL.test(f.sql)) keys.add(f.key ?? f.label);
  for (const [key, build] of Object.entries(spec.filters ?? {})) {
    try {
      if (AMOUNT_SQL.test(build('0', () => '$0'))) keys.add(key);
    } catch {
      // A builder that validates its value (a status list, a uuid) refuses
      // the probe; it is not an amount filter, or it would take digits.
    }
  }
  return keys;
}

/** `<module>.amounts.see` for the scope key's module. */
function amountsKeyOf(spec: ListSpec): PermissionKey {
  if (!('key' in spec.scope)) {
    throw new Error('runListQuery: amountKeys needs a scoped list (its module names the see-amounts key).');
  }
  return `${spec.scope.key.split('.')[0]}.amounts.see` as PermissionKey;
}

const SEE_AMOUNTS_REASON = {
  sort: 'Sorting by amount needs see amounts.',
  filter: 'Filtering by amount needs see amounts.',
} as const;

/**
 * One page of a list. `access` is the caller's access context
 * (`@CurrentAccess()`); a scoped spec, `can` or `amountKeys` refuses to
 * run without it, so a list can never fall back to unscoped.
 */
export async function runListQuery<T>(
  pool: Pool,
  spec: ListSpec,
  params: ListParams,
  access?: AccessContext,
): Promise<ListResult<T & MatchInfo>> {
  const values: unknown[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  // First, so its values sit inside the WHERE's (the empty-page fallback reuses them).
  const from = typeof spec.from === 'function' ? spec.from(param) : spec.from;
  const scoped = 'key' in spec.scope ? spec.scope : null;
  if ((scoped || spec.can || spec.amountKeys?.length) && !access) {
    throw new Error('runListQuery: this list is scoped; pass the caller\'s access context.');
  }
  if (spec.can && !scoped) throw new Error('runListQuery: `can` needs a scoped list.');

  // ---- see amounts (plan 6.1.6): refuse a sort or filter on an amount --
  const amountKeys = amountKeysOf(spec);
  const seesAmounts = amountKeys.size === 0 || can(access!, amountsKeyOf(spec));
  const refuseAmounts = (reason: string): never => {
    const permission = amountsKeyOf(spec);
    throw new ForbiddenException({ error: 'forbidden', permission, reason, message: reason });
  };

  const conditions: string[] = [];
  // ---- scope (plan 6.1.4 item 1): first, always ANDed -----------------
  if (scoped) conditions.push(scopeWhere(access!, scoped.key, scoped.record, scoped.alias, param));
  const baseWhere = typeof spec.baseWhere === 'function' ? spec.baseWhere(param) : spec.baseWhere;
  if (baseWhere) conditions.push(`(${baseWhere})`);

  // ---- search -------------------------------------------------------
  const search = params.search?.trim() ? params.search.trim() : null;
  const searchFields = (spec.searchFields ?? []).filter(
    (f) => seesAmounts || !amountKeys.has(f.key ?? f.label),
  );
  const allFields = [spec.titleField, ...searchFields];

  let matchSelect = `null::text as "matchedField", null::text as "matchedValue"`;

  if (search) {
    const pattern = param(`%${escapeLike(search)}%`);
    conditions.push(
      `(${allFields.map((f) => `${f.sql} ilike ${pattern}`).join(' or ')})`,
    );

    // Section 27.1: `Rishabh Mehta — Delivery`. A hit on the title needs
    // no note; a hit anywhere else does, or the row looks arbitrary.
    if (searchFields.length > 0) {
      const fieldChain = searchFields
        .map((f) => `when ${f.sql} ilike ${pattern} then ${quote(f.label)}`)
        .join(' ');
      const valueChain = searchFields
        .map((f) => `when ${f.sql} ilike ${pattern} then ${f.sql}`)
        .join(' ');
      matchSelect =
        `case when ${spec.titleField.sql} ilike ${pattern} then null ` +
        `else (case ${fieldChain} else null end) end as "matchedField", ` +
        `case when ${spec.titleField.sql} ilike ${pattern} then null ` +
        `else (case ${valueChain} else null end) end as "matchedValue"`;
    }
  }

  // ---- filters ------------------------------------------------------
  const appliedFilters: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params.filters ?? {})) {
    if (raw === undefined || raw === null || raw === '') continue;
    const builder = spec.filters?.[key];
    if (!builder) {
      throw new BadRequestException(`Unknown filter: ${key}`);
    }
    if (!seesAmounts && amountKeys.has(key)) refuseAmounts(SEE_AMOUNTS_REASON.filter);
    conditions.push(`(${builder(raw, param)})`);
    appliedFilters[key] = raw;
  }

  // ---- sort ---------------------------------------------------------
  // A default sort on an amount would leak the order; fall back quietly.
  const defaultSortKey =
    seesAmounts || !amountKeys.has(spec.defaultSort.key)
      ? spec.defaultSort.key
      : Object.keys(spec.sortable).find((k) => !amountKeys.has(k)) ?? spec.defaultSort.key;
  const sortKey = params.sort ?? defaultSortKey;
  const sortSql = spec.sortable[sortKey];
  if (!sortSql) {
    throw new BadRequestException(
      `Cannot sort by "${sortKey}". Sortable: ${Object.keys(spec.sortable).join(', ')}.`,
    );
  }
  if (!seesAmounts && amountKeys.has(sortKey)) refuseAmounts(SEE_AMOUNTS_REASON.sort);
  const direction: SortDirection = params.direction ?? spec.defaultSort.direction;
  if (direction !== 'asc' && direction !== 'desc') {
    throw new BadRequestException('direction must be asc or desc');
  }

  // NULLS LAST in BOTH directions, explicitly. Postgres defaults to
  // NULLS LAST on ASC but NULLS FIRST on DESC, so a descending sort
  // would otherwise float every empty value to the top of the list.
  const orderBy = `${sortSql} ${direction === 'asc' ? 'asc' : 'desc'} nulls last`;

  // ---- paging -------------------------------------------------------
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const offset = (page - 1) * pageSize;

  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  // The WHERE clause's own values; the empty-page fallback reuses exactly these.
  const whereValueCount = values.length;

  // ---- per-record answers (plan 6.1.4 item 6): same query, same rows --
  const canSql = spec.can && scoped ? `, ${canSelect(access!, spec.can, scoped.record, scoped.alias, param)} as "can"` : '';

  const limitParam = param(pageSize);
  const offsetParam = param(offset);

  // Each aggregate rides the same window as `totalCount`, so it covers
  // every row matching the current search/filters, not just the page,
  // and it costs nothing extra: one round trip, identical WHERE clause.
  // An aggregate on an amount is not computed without see amounts (R10).
  const aggregateEntries = Object.entries(spec.aggregates ?? {}).filter(
    ([key]) => seesAmounts || !amountKeys.has(key),
  );
  const aggregateSelect = aggregateEntries
    .map(([key, expr]) => `, coalesce((${expr} over ())::text, '0') as "agg_${key}"`)
    .join('');

  const sql = `
    select
      ${spec.select},
      ${matchSelect},
      count(*) over () as "totalCount"
      ${canSql}
      ${aggregateSelect}
    from ${from}
    ${where}
    order by ${orderBy}
    limit ${limitParam} offset ${offsetParam}
  `;

  const result = await pool.query(sql, values);

  let total: number;
  let aggregates: Record<string, string> | undefined;

  if (result.rows.length > 0) {
    total = Number(result.rows[0].totalCount);
    if (aggregateEntries.length > 0) {
      aggregates = {};
      for (const [key] of aggregateEntries) {
        aggregates[key] = String(result.rows[0][`agg_${key}`]);
      }
    }
  } else {
    // `count(*) over ()` (and every aggregate riding it) returns nothing
    // when the page itself is empty, which happens whenever someone
    // pages past the end. Asking again is the only way to tell "no
    // records" from "no records on page 9".
    const fallback = await countAndAggregates(
      pool,
      from,
      where,
      values.slice(0, whereValueCount),
      aggregateEntries,
    );
    total = fallback.total;
    aggregates = fallback.aggregates;
  }

  const data = result.rows.map((row) => {
    const rest = { ...(row as Record<string, unknown>) };
    delete rest.totalCount;
    for (const [key] of aggregateEntries) delete rest[`agg_${key}`];
    return rest as T & MatchInfo;
  });

  return {
    data,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sort: sortKey,
    direction,
    search,
    appliedFilters,
    ...(aggregates ? { aggregates } : {}),
  };
}

/**
 * The fallback for an empty result page: a plain count, plus each
 * declared aggregate over the same WHERE clause, with no window and no
 * limit/offset.
 *
 * An empty RESULT SET here is a real zero total -- there genuinely are
 * no matching rows, so `sum(...)` returning null becomes `"0"`. This is
 * NOT the section 31.2 "empty is not zero" case, which is about a blank
 * cell nobody has filled in on an otherwise-existing row; here there is
 * no row at all, and a sum of nothing is unambiguously nothing.
 */
async function countAndAggregates(
  pool: Pool,
  from: string,
  where: string,
  values: unknown[],
  aggregateEntries: [string, string][],
): Promise<{ total: number; aggregates: Record<string, string> | undefined }> {
  const aggregateSelect = aggregateEntries
    .map(([key, expr]) => `, coalesce(${expr}::text, '0') as "agg_${key}"`)
    .join('');
  const { rows } = await pool.query<Record<string, string>>(
    `select count(*)::text as count ${aggregateSelect} from ${from} ${where}`,
    values,
  );
  const row = rows[0];
  const total = Number(row?.count ?? 0);
  let aggregates: Record<string, string> | undefined;
  if (aggregateEntries.length > 0) {
    aggregates = {};
    for (const [key] of aggregateEntries) {
      aggregates[key] = row?.[`agg_${key}`] ?? '0';
    }
  }
  return { total, aggregates };
}

/** `%` and `_` are wildcards in ILIKE. A user searching "50%" means "50%". */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Labels are ours, never user input, but they still get quoted properly. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
