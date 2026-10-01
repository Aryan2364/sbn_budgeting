-- Complaints are filed against a budget SITE, not a location.
--
-- Client decision, 1 Oct 2026. It reverses plan 3.1a ("by location,
-- never by site"); see complain/CONTRACT.md section 10. The site already
-- names the two people who answer for it (sites.supervisor_id and
-- sites.manager_id), so routing reads those instead of user_locations.
--
-- Complaints raised before today stay filed against their location and
-- are not rewritten: a location can hold several sites, so there is no
-- honest way to pick one after the fact. Hence location_id becomes
-- optional and every row must carry at least one of the two.

-- SCHEMA PLACEMENT: complaints lives in `complaints`, sites in
-- `budgeting`, locations and users in `shared`. Nothing is created
-- here except a column, a check and an index, which follow their table.
set local search_path = complaints, budgeting, shared, public;

alter table complaints add column site_id uuid references sites (id);

alter table complaints alter column location_id drop not null;

alter table complaints add constraint complaints_site_or_location
  check (site_id is not null or location_id is not null);

create index complaints_site_id_idx on complaints (site_id);
