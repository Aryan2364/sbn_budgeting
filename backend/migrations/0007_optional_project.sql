-- A site no longer has to belong to a project.
--
-- CLIENT INSTRUCTION, 23 Sep 2026, via the consultant. Projects stay
-- in the product; the link between a site and a project becomes the
-- client's choice rather than a precondition for entering a site.
-- Most clients are not expected to create a single project, so a site
-- standing alone is the ORDINARY case, not a defect to be flagged.
--
-- NOTHING IS DELETED AND NOTHING IS UNLINKED. Every site that has a
-- project today still has it after this runs. The column only stops
-- being mandatory, which cannot invalidate a row that already exists.

alter table sites
  alter column project_id drop not null;

comment on column sites.project_id is
  'The project this site belongs to, if any. Optional since 0007: a
   site without one is a complete, ordinary site (client instruction,
   23 Sep 2026). Nothing in the product counts or flags these.';

-- ---------------------------------------------------------------
-- The variance view, recreated for the same reason and no other.
--
-- 0004 joins `projects` INNER. That was correct while every site had
-- one; now it is the difference between a site appearing in every
-- report and vanishing from all of them at once. An inner join does
-- not error on a null project_id — it silently drops the row, so a
-- site saved without a project would be missing from the Reports
-- list, from every roll-up, and from its own Variance tab, with
-- nothing on screen to say why.
--
-- LEFT JOIN, therefore, and `project_name` is now nullable. That is
-- the ONLY change: the grains, the grouping sets, the maths and the
-- outer filter are character-for-character 0004's. A recreated view
-- is an opportunity to improve something and this one deliberately
-- takes none of it — a change to the variance definition smuggled in
-- beside a nullability fix is a change nobody reviews.
-- ---------------------------------------------------------------

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
  left join projects p on p.id = s.project_id
  left join variance_cell c on c.site_id = s.id
  group by grouping sets (
    (s.id, s.name, s.project_id, p.name, s.planned_trees, c.cost_head_id, c.period),
    (s.id, s.name, s.project_id, p.name, s.planned_trees, c.cost_head_id),
    (s.id, s.name, s.project_id, p.name, s.planned_trees, c.period),
    (s.id, s.name, s.project_id, p.name, s.planned_trees)
  )
) v
where v.grain = 'site'
   or (v.grain = 'site_period' and v.period is not null)
   or (v.grain in ('site_head', 'site_head_period') and v.cost_head_id is not null);
