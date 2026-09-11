-- A fourth grain: the site total FOR ONE PERIOD.
--
-- Why this exists. The site detail Variance tab has a period selector
-- (question 8). Its rows already came from the 'site_head_period'
-- grain, filtered to the chosen period — but its TOTAL row came from
-- `siteTotal()`, which reads grain 'site' and is all-time. So choosing
-- "Initial" gave Rajkot nineteen rows summing to 28,80,000 under a
-- total row reading 1,02,96,000, and choosing "Year 1" put a total
-- actual of 30,029 over a column of zeroes.
--
-- Found by querying the endpoint, not by reading it.
--
-- The fix is NOT to add up the rows in the service. Plan section 3 is
-- explicit: one definition, rolled up in the same SQL, because
-- separate queries let the totals and the rows drift apart — which is
-- exactly the bug above, in the other direction. So the roll-up the
-- screen needs becomes a grouping set in the one view, and
-- `siteTotal()` reads it.
--
-- Nothing else changes. `variance_cell` is untouched, the three
-- existing grains emit exactly the same rows, and every existing
-- consumer filters on `grain` and so cannot see the new one.

drop view variance;

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
    -- Four grains now, so the head test alone no longer identifies
    -- 'site': a row with no head and a period is the new one. Both
    -- GROUPING bits are read before either is trusted.
    case
      when grouping(c.cost_head_id) = 1 and grouping(c.period) = 1 then 'site'
      when grouping(c.cost_head_id) = 1                            then 'site_period'
      when grouping(c.period) = 1                                  then 'site_head'
      else 'site_head_period'
    end             as grain,
    sum(c.budget_paise)              as budget_paise,
    coalesce(sum(c.actual_paise), 0) as actual_paise,
    sum(c.budget_paise) - coalesce(sum(c.actual_paise), 0) as variance_paise,
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
    (s.id, s.name, s.project_id, p.name, s.planned_trees, c.period),
    (s.id, s.name, s.project_id, p.name, s.planned_trees)
  )
) v
-- A site with no budget and no expenses still has to appear on the
-- Reports list, so its 'site' row survives. The same site produces one
-- all-null phantom at each of the other three grains, and each is
-- dropped by the key that grain is grouped on.
where v.grain = 'site'
   or (v.grain = 'site_period' and v.period is not null)
   or (v.grain in ('site_head', 'site_head_period') and v.cost_head_id is not null);
