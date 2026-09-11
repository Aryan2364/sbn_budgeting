-- The variance definition. Written ONCE.
--
-- Plan section 3, locked: "One row per (site, cost head, period)
-- carrying budget_paise and actual_paise, rolled up to head totals and
-- to site totals IN THE SAME SQL DEFINITION. Not two queries, and now
-- not three. Separate queries let the site totals, the head rows and
-- the period columns drift apart."
--
-- So there is one view below that emits all three grains, and every
-- consumer filters it. The Reports landing list is grain = 'site'. The
-- site detail Variance tab is grain = 'site_head' for All periods, or
-- grain = 'site_head_period' filtered to one period. Nothing else
-- computes a budget, an actual or a variance.
--
-- ALL OF THE MATHS IS HERE, IN SQL. The API formats; it does not add up.

-- ---------------------------------------------------------------
-- The grain: one row per (site, cost head, period) that has either a
-- budget row or expenses, or both.
--
-- budget_paise is deliberately LEFT NULL where no site_budgets row
-- exists. That is what carries the "Budget not set" state through
-- every roll-up for free: SUM ignores NULLs, so a head with three
-- budgeted periods and two blanks totals the three, and a head with
-- five blanks totals to NULL. A row holding an explicit 0 sums as 0.
-- Those two states stay different all the way to the screen.
--
-- actual_paise coalesces to 0, because a head that IS budgeted and has
-- no expenses has spent nothing — that is 0.00, not an em-dash.
-- ---------------------------------------------------------------
create view variance_cell as
select
  coalesce(b.site_id, e.site_id)           as site_id,
  coalesce(b.cost_head_id, e.cost_head_id) as cost_head_id,
  coalesce(b.period, e.period)             as period,
  b.budget_paise                           as budget_paise,
  coalesce(e.actual_paise, 0)              as actual_paise
from (
  -- head budget = per_tree_paise x the site's tree count, live.
  -- There is no snapshot: change planned_trees and this moves.
  select
    sb.site_id,
    sb.cost_head_id,
    sb.period,
    sb.per_tree_paise * s.planned_trees as budget_paise
  from site_budgets sb
  join sites s on s.id = sb.site_id
) b
full join (
  select
    ex.site_id,
    ex.cost_head_id,
    ex.period,
    sum(ex.amount_paise) as actual_paise
  from expenses ex
  group by ex.site_id, ex.cost_head_id, ex.period
) e
  on  e.site_id      = b.site_id
  and e.cost_head_id = b.cost_head_id
  and e.period       = b.period;

-- ---------------------------------------------------------------
-- The three grains, from one GROUPING SETS over that one cell view.
--
-- sites is LEFT joined so that a site with no budget and no expenses
-- still appears on the Reports list, reading "Budget not set" — the
-- list is every site, not every site that has been budgeted.
--
-- The outer WHERE drops the phantom row that a site with no cells at
-- all would otherwise produce at the two head grains.
-- ---------------------------------------------------------------
create view variance as
select *
from (
  select
    s.id            as site_id,
    s.name          as site_name,
    s.project_id    as project_id,
    p.name          as project_name,
    s.planned_trees as planned_trees,
    c.cost_head_id  as cost_head_id,
    c.period        as period,
    case
      when grouping(c.cost_head_id) = 1 then 'site'
      when grouping(c.period) = 1       then 'site_head'
      else 'site_head_period'
    end             as grain,
    sum(c.budget_paise)              as budget_paise,
    coalesce(sum(c.actual_paise), 0) as actual_paise,
    sum(c.budget_paise) - coalesce(sum(c.actual_paise), 0) as variance_paise,
    -- Percentage of budget spent, one decimal (plan section 3).
    -- NULL where there is no budget, and NULL where the budget is an
    -- explicit zero: "infinitely over" is not a number, and the
    -- zero-budget ruling renders both as an em-dash.
    round(
      (coalesce(sum(c.actual_paise), 0) * 100.0)
        / nullif(sum(c.budget_paise), 0),
      1
    ) as spent_pct,
    round(
      ((sum(c.budget_paise) - coalesce(sum(c.actual_paise), 0)) * 100.0)
        / nullif(sum(c.budget_paise), 0),
      1
    ) as variance_pct
  from sites s
  join projects p on p.id = s.project_id
  left join variance_cell c on c.site_id = s.id
  group by grouping sets (
    (s.id, s.name, s.project_id, p.name, s.planned_trees, c.cost_head_id, c.period),
    (s.id, s.name, s.project_id, p.name, s.planned_trees, c.cost_head_id),
    (s.id, s.name, s.project_id, p.name, s.planned_trees)
  )
) v
where v.grain = 'site' or v.cost_head_id is not null;
