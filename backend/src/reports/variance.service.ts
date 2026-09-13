import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { PG_POOL } from '../db/db.module';

/**
 * The only code in this service that reads a budget, an actual or a
 * variance. Every figure comes from the single `variance` view in
 * migrations/0002_variance.sql — the Reports landing list is that view
 * at grain 'site', and the site detail Variance tab is the same view at
 * grain 'site_head' or 'site_head_period'.
 *
 * Not separate queries. Two definitions let the site totals and the
 * head rows drift apart, and the drift is invisible until somebody adds
 * up a column by hand.
 *
 * NOTHING BELOW DOES ARITHMETIC. Amounts arrive from Postgres as
 * strings, are passed through as strings, and are formatted for a
 * reader by lib/format.ts on the other side of the wire. A paise amount
 * that becomes a JS number is silently approximate.
 */

export const PERIODS = ['Initial', 'Year 1', 'Year 2', 'Year 3', 'Year 4'] as const;

/** Phase 7b, Report 1. One period, at whatever scope was asked for. */
export interface VariancePeriodRow {
  /** null on the total row, where the period axis is collapsed. */
  period: number | null;
  /** null means no budget rows exist — "Budget not set". */
  budgetPaise: string | null;
  actualPaise: string;
  variancePaise: string | null;
  variancePct: string | null;
}

/** Phase 7b, Report 2. One cost head across the five periods. */
export interface HeadPeriodRow {
  costHeadId: string;
  costHeadName: string;
  /** Always five, in period order, whatever the data carries. */
  cells: VariancePeriodRow[];
  /** The head's own row total, summed in SQL beside the cells. */
  total: VariancePeriodRow;
}

export interface HeadPeriodReport {
  rows: HeadPeriodRow[];
  /** The column totals, one per period. */
  periodTotals: VariancePeriodRow[];
  /** Where the row totals and the column totals meet. */
  total: VariancePeriodRow;
}

export interface VarianceRow {
  siteId: string;
  siteName: string;
  projectId: string;
  projectName: string;
  plannedTrees: number;
  costHeadId: string | null;
  costHeadName: string | null;
  period: number | null;
  /** null means no budget rows exist — the screen reads "Budget not set". */
  budgetPaise: string | null;
  actualPaise: string;
  variancePaise: string | null;
  variancePct: string | null;
}

@Injectable()
export class VarianceService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Screen 1. Every site with its all-time totals.
   *
   * All-time, with no filter of any kind (question 8) — no date range
   * and no period selector on this screen. Default sort is variance
   * ascending, so the most overspent sites are on screen without
   * anyone filtering, with NULLS LAST in both directions so that
   * unbudgeted sites do not float to the top of a descending sort.
   */
  async sites(params: {
    search?: string;
    projectId?: string;
    managerId?: string;
    sort?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<{ data: VarianceRow[]; total: number; page: number; pageSize: number }> {
    const values: unknown[] = [];
    const param = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    const where: string[] = [`v.grain = 'site'`];

    if (params.search?.trim()) {
      const pattern = param(`%${params.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where.push(`(v.site_name ilike ${pattern} or v.project_name ilike ${pattern})`);
    }
    if (params.projectId) where.push(`v.project_id = ${param(params.projectId)}`);
    if (params.managerId) where.push(`s.manager_id = ${param(params.managerId)}`);

    const sortable: Record<string, string> = {
      variance: 'v.variance_paise',
      site: 'v.site_name',
      project: 'v.project_name',
      trees: 'v.planned_trees',
      budget: 'v.budget_paise',
      actual: 'v.actual_paise',
      variancePct: 'v.variance_pct',
    };
    const sortKey = params.sort ?? 'variance';
    const sortSql = sortable[sortKey];
    if (!sortSql) {
      throw new BadRequestException(
        `Cannot sort by "${sortKey}". Sortable: ${Object.keys(sortable).join(', ')}.`,
      );
    }
    const direction = params.direction === 'desc' ? 'desc' : 'asc';

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 25)));

    const limit = param(pageSize);
    const offset = param((page - 1) * pageSize);

    const { rows } = await this.pool.query(
      `
      select
        v.site_id        as "siteId",
        v.site_name      as "siteName",
        v.project_id     as "projectId",
        v.project_name   as "projectName",
        v.planned_trees  as "plannedTrees",
        null::uuid       as "costHeadId",
        null::text       as "costHeadName",
        null::smallint   as "period",
        v.budget_paise   as "budgetPaise",
        v.actual_paise   as "actualPaise",
        v.variance_paise as "variancePaise",
        v.variance_pct   as "variancePct",
        count(*) over () as "totalCount"
      from variance v
      join sites s on s.id = v.site_id
      where ${where.join(' and ')}
      order by ${sortSql} ${direction} nulls last, v.site_name asc
      limit ${limit} offset ${offset}
      `,
      values,
    );

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
    return {
      data: rows.map(stripCount),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Screen 2. One site, one row per cost head.
   *
   * `period` undefined is "All periods" and reads the 'site_head'
   * grain; a period reads 'site_head_period' filtered to it. The table
   * stays five columns either way — the selector changes which period
   * the columns are showing, not how many columns there are. Fifteen
   * columns would force horizontal scroll (§10, question 8).
   *
   * A head with a budget and no expenses appears with actual 0. A head
   * with expenses and no budget appears too, with budget null —
   * Rajkot's Irrigation is exactly that row.
   */
  async siteHeads(siteId: string, period?: number): Promise<VarianceRow[]> {
    if (period !== undefined && (!Number.isInteger(period) || period < 0 || period > 4)) {
      throw new BadRequestException('period must be 0 (Initial) to 4 (Year 4)');
    }

    const grain = period === undefined ? 'site_head' : 'site_head_period';
    const values: unknown[] = [siteId, grain];
    let periodFilter = '';
    if (period !== undefined) {
      values.push(period);
      periodFilter = 'and v.period = $3';
    }

    /**
     * Driven from cost_heads, not from the view.
     *
     * The view only emits a cell that exists — a head with neither a
     * budget row nor an expense is simply absent from it. That would
     * give two sites different row counts on the same tab, and a head
     * that has not been budgeted yet would vanish rather than reading
     * "Budget not set". The plan asks for one row per active cost head
     * (Phase 7), so the head list is the spine and the view hangs off
     * it.
     *
     * An INACTIVE head still appears when it has data for this site: a
     * head is deactivated rather than deleted precisely because
     * expenses reference it, and hiding the row would hide the spend.
     *
     * The maths is still only in the view. This join decides which rows
     * exist, never what is in them.
     */
    const { rows } = await this.pool.query(
      `
      select
        s.id             as "siteId",
        s.name           as "siteName",
        s.project_id     as "projectId",
        p.name           as "projectName",
        s.planned_trees  as "plannedTrees",
        ch.id            as "costHeadId",
        ch.name          as "costHeadName",
        v.period         as "period",
        v.budget_paise   as "budgetPaise",
        coalesce(v.actual_paise, 0) as "actualPaise",
        v.variance_paise as "variancePaise",
        v.variance_pct   as "variancePct"
      from sites s
      join projects p on p.id = s.project_id
      cross join cost_heads ch
      left join variance v
        on  v.site_id      = s.id
        and v.cost_head_id = ch.id
        and v.grain        = $2
        ${periodFilter}
      where s.id = $1
        and (ch.is_active or v.cost_head_id is not null)
      order by ch.sort_order asc
      `,
      values,
    );

    return rows as VarianceRow[];
  }

  /**
   * Everything the dashboard shows, in one round trip.
   *
   * **Every sum happens in SQL**, including the month-over-month spend
   * the change indicators need. The dashboard used to be a static
   * shell with no data source at all; pulling every expense to the
   * browser and adding them up there would have been the other way to
   * get this wrong.
   *
   * Budgets and variances come from the same `variance` view every
   * other screen reads, at the 'site' grain. Not a second definition.
   */
  async dashboard(): Promise<DashboardSummary> {
    const [counts, totals, spend, attention, recent] = await Promise.all([
      this.pool.query<{
        project_count: string;
        site_count: string;
        planned_trees: string;
      }>(
        `select
           (select count(*) from projects)::text            as project_count,
           (select count(*) from sites)::text               as site_count,
           (select coalesce(sum(planned_trees), 0) from sites)::text as planned_trees`,
      ),
      this.pool.query<{
        budget_paise: string | null;
        actual_paise: string;
        over_budget: string;
      }>(
        `select
           sum(v.budget_paise)::text                        as budget_paise,
           coalesce(sum(v.actual_paise), 0)::text           as actual_paise,
           count(*) filter (where v.variance_paise < 0)::text as over_budget
         from variance v
         where v.grain = 'site'`,
      ),
      this.pool.query<{ this_month: string; last_month: string }>(
        `select
           coalesce(sum(amount_paise) filter (
             where spent_on >= date_trunc('month', current_date)
           ), 0)::text as this_month,
           coalesce(sum(amount_paise) filter (
             where spent_on >= date_trunc('month', current_date) - interval '1 month'
               and spent_on <  date_trunc('month', current_date)
           ), 0)::text as last_month
         from expenses`,
      ),
      // Section 11.4: "items needing attention". Worst overspend first,
      // which is the same default sort the Reports list uses.
      this.pool.query(
        `select
           v.site_id        as "siteId",
           v.site_name      as "siteName",
           v.project_name   as "projectName",
           v.budget_paise   as "budgetPaise",
           v.actual_paise   as "actualPaise",
           v.variance_paise as "variancePaise"
         from variance v
         where v.grain = 'site' and v.variance_paise < 0
         order by v.variance_paise asc
         limit 5`,
      ),
      this.pool.query(
        `select e.id, s.name as "siteName", ch.name as "costHeadName",
                e.spent_on as "spentOn", e.amount_paise as "amountPaise"
         from expenses e
         join sites s on s.id = e.site_id
         join cost_heads ch on ch.id = e.cost_head_id
         order by e.spent_on desc, e.created_at desc
         limit 5`,
      ),
    ]);

    const c = counts.rows[0]!;
    const t = totals.rows[0]!;
    const sp = spend.rows[0]!;

    const budget = t.budget_paise;
    const actual = t.actual_paise;

    return {
      projectCount: Number(c.project_count),
      siteCount: Number(c.site_count),
      plannedTrees: Number(c.planned_trees),
      budgetPaise: budget,
      actualPaise: actual,
      // Subtracted in bigint, not as numbers, and null when there is
      // no budget to compare against.
      variancePaise:
        budget === null ? null : (BigInt(budget) - BigInt(actual)).toString(),
      sitesOverBudget: Number(t.over_budget),
      spendThisMonthPaise: sp.this_month,
      spendLastMonthPaise: sp.last_month,
      attention: attention.rows as DashboardSummary['attention'],
      recent: recent.rows as DashboardSummary['recent'],
    };
  }

  /**
   * Phase 7b, Report 1. One row per period, for a project or for one
   * site inside it.
   *
   * CLIENT INSTRUCTION, 7 Sep 2026: "total year wise", which reads as a
   * rollup, so a project is the default scope and a site narrows it.
   *
   * **This is a roll-up of the view's own rows, not a second
   * definition.** It sums `variance` at the 'site_period' grain that
   * migration 0004 added, so it cannot disagree with the site figures
   * it is made of — SUM of those rows IS this answer. A project grain
   * inside the view itself would have been the purer home for it, and
   * it is not available cheaply: `planned_trees` is a GROUP BY column
   * at every existing grain and would have to become a per-site
   * DISTINCT sum at a project grain, which is not expressible in the
   * same select list. That is a real reason, not a shortcut, and it is
   * worth writing down so nobody re-attempts it.
   *
   * THE FIVE PERIODS ARE A SPINE, not whatever the data happens to
   * carry. A project with nothing budgeted in Year 3 still shows a
   * Year 3 row reading "Budget not set" — the same reason the head
   * grain is driven from `cost_heads` rather than from the view.
   */
  async periods(params: {
    projectId?: string;
    siteId?: string;
  }): Promise<{ rows: VariancePeriodRow[]; total: VariancePeriodRow }> {
    const values: unknown[] = [];
    const where: string[] = [`v.grain = 'site_period'`];
    if (params.projectId) {
      values.push(params.projectId);
      where.push(`v.project_id = $${values.length}`);
    }
    if (params.siteId) {
      values.push(params.siteId);
      where.push(`v.site_id = $${values.length}`);
    }

    const { rows } = await this.pool.query(
      `
      with scoped as (
        select v.period, v.budget_paise, v.actual_paise
        from variance v
        where ${where.join(' and ')}
      ),
      spine as (select generate_series(0, 4) as period)
      select
        spine.period                                as "period",
        sum(scoped.budget_paise)                    as "budgetPaise",
        coalesce(sum(scoped.actual_paise), 0)::text as "actualPaise",
        (sum(scoped.budget_paise) - coalesce(sum(scoped.actual_paise), 0))::text
                                                    as "variancePaise",
        round(
          ((sum(scoped.budget_paise) - coalesce(sum(scoped.actual_paise), 0)) * 100.0)
            / nullif(sum(scoped.budget_paise), 0),
          1
        )::text                                     as "variancePct"
      from spine
      left join scoped on scoped.period = spine.period
      group by spine.period
      order by spine.period
      `,
      values,
    );

    // The total row is the same sum with the period axis collapsed,
    // taken from the same scoped set. Not added up in JavaScript.
    const { rows: totals } = await this.pool.query(
      `
      select
        null::smallint                       as "period",
        sum(v.budget_paise)::text            as "budgetPaise",
        coalesce(sum(v.actual_paise), 0)::text as "actualPaise",
        (sum(v.budget_paise) - coalesce(sum(v.actual_paise), 0))::text
                                             as "variancePaise",
        round(
          ((sum(v.budget_paise) - coalesce(sum(v.actual_paise), 0)) * 100.0)
            / nullif(sum(v.budget_paise), 0),
          1
        )::text                              as "variancePct"
      from variance v
      where ${where.join(' and ')}
      `,
      values,
    );

    return {
      rows: rows.map(asPeriodRow),
      total: asPeriodRow(totals[0] ?? {}),
    };
  }

  /**
   * Phase 7b, Report 2. Cost head down the side, period across the top.
   *
   * CLIENT INSTRUCTION, 7 Sep 2026, with the cell content settled on
   * 12 Sep: **one measure at a time**, chosen on the screen. Five
   * period columns, not a budget / actual / variance triple per period
   * — that is fifteen columns and question 8 ruled it out by name. All
   * four measures are returned for every cell and the screen picks; the
   * alternative is a round trip every time somebody changes the
   * dropdown, for data already in hand.
   *
   * **NO COLUMN GROUP PER SITE.** The per-site cross-tab was scoped out
   * deliberately. A project scope sums its sites into one set of five
   * columns; it does not widen the table.
   *
   * THE HEADS ARE A SPINE and so are the five periods. All nineteen
   * heads appear whether or not they have a budget or an expense, and
   * an inactive head still appears when it has data — it was
   * deactivated rather than deleted precisely because expenses
   * reference it, and hiding the row would hide the spend.
   *
   * ONE QUERY, four grains, from one GROUPING SETS: the cells, each
   * head's row total, each period's column total, and the grand total
   * where the two meet. They are sums of the same scoped set, so a row
   * total cannot disagree with the cells it sits beside.
   */
  async headPeriods(params: {
    projectId?: string;
    siteId?: string;
  }): Promise<HeadPeriodReport> {
    const values: unknown[] = [];
    const where: string[] = [`v.grain = 'site_head_period'`];
    if (params.projectId) {
      values.push(params.projectId);
      where.push(`v.project_id = $${values.length}`);
    }
    if (params.siteId) {
      values.push(params.siteId);
      where.push(`v.site_id = $${values.length}`);
    }

    const { rows } = await this.pool.query(
      `
      with scoped as (
        select v.cost_head_id, v.period, v.budget_paise, v.actual_paise
        from variance v
        where ${where.join(' and ')}
      ),
      heads as (
        select ch.id, ch.name, ch.sort_order
        from cost_heads ch
        where ch.is_active
           or exists (select 1 from scoped s where s.cost_head_id = ch.id)
      ),
      spine as (
        select h.id as cost_head_id, h.name, h.sort_order, p.period
        from heads h
        cross join generate_series(0, 4) as p(period)
      ),
      cells as (
        select
          spine.cost_head_id, spine.name, spine.sort_order, spine.period,
          scoped.budget_paise, scoped.actual_paise
        from spine
        left join scoped
          on  scoped.cost_head_id = spine.cost_head_id
          and scoped.period       = spine.period
      )
      select
        cost_head_id                          as "costHeadId",
        name                                  as "costHeadName",
        sort_order                            as "sortOrder",
        period                                as "period",
        grouping(cost_head_id, name, sort_order) as "headGrouped",
        grouping(period)                      as "periodGrouped",
        sum(budget_paise)::text               as "budgetPaise",
        coalesce(sum(actual_paise), 0)::text  as "actualPaise",
        (sum(budget_paise) - coalesce(sum(actual_paise), 0))::text
                                              as "variancePaise",
        round(
          ((sum(budget_paise) - coalesce(sum(actual_paise), 0)) * 100.0)
            / nullif(sum(budget_paise), 0),
          1
        )::text                               as "variancePct"
      from cells
      group by grouping sets (
        (cost_head_id, name, sort_order, period),
        (cost_head_id, name, sort_order),
        (period),
        ()
      )
      order by sort_order nulls last, period nulls last
      `,
      values,
    );

    // Bucketing, not arithmetic. Every figure below was summed in SQL.
    const byHead = new Map<string, HeadPeriodRow>();
    const periodTotals: VariancePeriodRow[] = [];
    let total: VariancePeriodRow | null = null;

    for (const row of rows as Record<string, unknown>[]) {
      const headGrouped = Number(row.headGrouped) !== 0;
      const periodGrouped = Number(row.periodGrouped) !== 0;
      const figures = asPeriodRow(row);

      if (headGrouped && periodGrouped) {
        total = figures;
      } else if (headGrouped) {
        periodTotals.push(figures);
      } else {
        const id = String(row.costHeadId);
        let head = byHead.get(id);
        if (!head) {
          head = {
            costHeadId: id,
            costHeadName: String(row.costHeadName),
            cells: [],
            total: figures,
          };
          byHead.set(id, head);
        }
        if (periodGrouped) head.total = figures;
        else head.cells.push(figures);
      }
    }

    for (const head of byHead.values()) {
      head.cells.sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
    }

    return {
      rows: [...byHead.values()],
      periodTotals,
      total: total ?? asPeriodRow({}),
    };
  }

  /**
   * The site's own total, read from the same view.
   *
   * The tab's total row is this, not the sum of the rows above it — if
   * the two ever disagree, the view is wrong and it should be visible.
   *
   * **It has to answer the same question the rows are answering.** It
   * did not: it read grain 'site', which is all-time, while the rows
   * were filtered to the chosen period. Picking "Initial" put Rajkot's
   * 1,02,96,000 all-time budget over nineteen rows summing to
   * 28,80,000. Migration 0004 adds the 'site_period' grain to the one
   * view so the period total is a roll-up of the same definition
   * rather than an addition done here.
   */
  async siteTotal(siteId: string, period?: number): Promise<VarianceRow | null> {
    if (period !== undefined && (!Number.isInteger(period) || period < 0 || period > 4)) {
      throw new BadRequestException('period must be 0 (Initial) to 4 (Year 4)');
    }

    const { rows } = await this.pool.query(
      `
      select
        v.site_id        as "siteId",
        v.site_name      as "siteName",
        v.project_id     as "projectId",
        v.project_name   as "projectName",
        v.planned_trees  as "plannedTrees",
        null::uuid       as "costHeadId",
        null::text       as "costHeadName",
        v.period         as "period",
        v.budget_paise   as "budgetPaise",
        v.actual_paise   as "actualPaise",
        v.variance_paise as "variancePaise",
        v.variance_pct   as "variancePct"
      from variance v
      where v.site_id = $1
        and v.grain = $2
        ${period === undefined ? '' : 'and v.period = $3'}
      `,
      period === undefined ? [siteId, 'site'] : [siteId, 'site_period', period],
    );
    return (rows[0] as VarianceRow | undefined) ?? null;
  }
}

export interface DashboardSummary {
  projectCount: number;
  siteCount: number;
  plannedTrees: number;
  /** null when nothing anywhere is budgeted — "Budget not set". */
  budgetPaise: string | null;
  actualPaise: string;
  variancePaise: string | null;
  sitesOverBudget: number;
  spendThisMonthPaise: string;
  spendLastMonthPaise: string;
  attention: {
    siteId: string;
    siteName: string;
    projectName: string;
    budgetPaise: string | null;
    actualPaise: string;
    variancePaise: string | null;
  }[];
  recent: {
    id: string;
    siteName: string;
    costHeadName: string;
    spentOn: string;
    amountPaise: string;
  }[];
}

/**
 * A period row, with the null budget preserved through the arithmetic.
 *
 * Postgres returns NULL for the variance and the percentage wherever
 * the budget is NULL, because NULL minus a number is NULL — which is
 * the "Budget not set" state travelling through the maths for free,
 * exactly as it does in the view. The only thing needed here is to not
 * coalesce it away.
 */
function asPeriodRow(row: Record<string, unknown>): VariancePeriodRow {
  return {
    period: row.period === null || row.period === undefined ? null : Number(row.period),
    budgetPaise: (row.budgetPaise as string | null) ?? null,
    actualPaise: (row.actualPaise as string | null) ?? '0',
    variancePaise: (row.variancePaise as string | null) ?? null,
    variancePct: (row.variancePct as string | null) ?? null,
  };
}

function stripCount(row: Record<string, unknown>): VarianceRow {
  const { totalCount, ...rest } = row;
  void totalCount;
  return rest as unknown as VarianceRow;
}
