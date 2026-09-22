import { BadRequestException } from '@nestjs/common';
import type { Pool } from 'pg';

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
}

export type FilterBuilder = (
  value: string,
  param: (value: unknown) => string,
) => string;

export interface ListSpec {
  /** `cost_heads ch` — table plus alias, and any joins. */
  from: string;
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
  /** Always-on restriction, e.g. a soft-delete or a scope. */
  baseWhere?: string;
  /**
   * Optional grand totals over EVERY row matching the current
   * search/filters, not just the page. Each value is a bare SQL
   * aggregate expression (`sum(e.amount_paise)`); this module adds the
   * `over ()` window itself so a caller cannot forget it and silently
   * get a per-row aggregate instead of a grand one. One round trip,
   * over the identical WHERE clause as the page and the total count.
   */
  aggregates?: Record<string, string>;
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

/** Rows come back carrying where the search hit, when it was not the title. */
export interface MatchInfo {
  matchedField: string | null;
  matchedValue: string | null;
}

export async function runListQuery<T>(
  pool: Pool,
  spec: ListSpec,
  params: ListParams,
): Promise<ListResult<T & MatchInfo>> {
  const values: unknown[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const conditions: string[] = [];
  if (spec.baseWhere) conditions.push(`(${spec.baseWhere})`);

  // ---- search -------------------------------------------------------
  const search = params.search?.trim() ? params.search.trim() : null;
  const searchFields = spec.searchFields ?? [];
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
    conditions.push(`(${builder(raw, param)})`);
    appliedFilters[key] = raw;
  }

  // ---- sort ---------------------------------------------------------
  const sortKey = params.sort ?? spec.defaultSort.key;
  const sortSql = spec.sortable[sortKey];
  if (!sortSql) {
    throw new BadRequestException(
      `Cannot sort by "${sortKey}". Sortable: ${Object.keys(spec.sortable).join(', ')}.`,
    );
  }
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
  const limitParam = param(pageSize);
  const offsetParam = param(offset);

  // Each aggregate rides the same window as `totalCount`, so it covers
  // every row matching the current search/filters, not just the page,
  // and it costs nothing extra: one round trip, identical WHERE clause.
  const aggregateEntries = Object.entries(spec.aggregates ?? {});
  const aggregateSelect = aggregateEntries
    .map(([key, expr]) => `, coalesce((${expr} over ())::text, '0') as "agg_${key}"`)
    .join('');

  const sql = `
    select
      ${spec.select},
      ${matchSelect},
      count(*) over () as "totalCount"
      ${aggregateSelect}
    from ${spec.from}
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
      spec,
      where,
      values.slice(0, values.length - 2),
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
  spec: ListSpec,
  where: string,
  values: unknown[],
  aggregateEntries: [string, string][],
): Promise<{ total: number; aggregates: Record<string, string> | undefined }> {
  const aggregateSelect = aggregateEntries
    .map(([key, expr]) => `, coalesce(${expr}::text, '0') as "agg_${key}"`)
    .join('');
  const { rows } = await pool.query<Record<string, string>>(
    `select count(*)::text as count ${aggregateSelect} from ${spec.from} ${where}`,
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
