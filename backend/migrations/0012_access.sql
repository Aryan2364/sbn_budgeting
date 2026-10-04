-- Access rights: roles, scopes, selected sites, the reporting closure,
-- the access version and the append-only access history.
--
-- Plan: access/plan-2026-10-03-1630.md section 5.1, as corrected by
-- access/RESOLUTIONS.md (R1, R4, R5, R9, C2, C4). Phase P1.
--
-- NO BEHAVIOUR CHANGE. Nothing in the running API reads these tables
-- yet; the old module-access guards keep deciding until P9. The only
-- existing rows touched are users.active (new column, section 5.1.8).
--
-- What is deliberately NOT here:
--   * no `permissions` table, no CHECK, enum, regex or foreign key on a
--     permission key (R5): the catalogue is code, in
--     src/access/catalogue/. Only the four scopes are an enum.
--   * no role_permissions rows. The mapping re-sync
--     (npm run access:map-levels) writes them from typed code in
--     src/access/seed-roles.ts, so permission keys exist only in code.
--   * no is_admin, seed_key, status, retired_at or valid_until column
--     (R4, R5, R8, R12).

-- SCHEMA PLACEMENT: every table here is shared by all modules, so it
-- lives in `shared` (already on every connection's search_path). Sites
-- and projects stay where they are (`budgeting` in production, `public`
-- locally); the unqualified names below find them through this path.
set local search_path = shared, budgeting, public;

-- ---------------------------------------------------------------
-- 1. Scopes (R1). Stored values only; "Selected sites" is the label
--    of `units` on screen. Never `selected_sites` or `selected`.
-- ---------------------------------------------------------------
create type access_scope as enum ('own', 'team', 'units', 'all');

-- ---------------------------------------------------------------
-- 2. roles
--
-- A name starting with "+" is an add-on role (decision 7); the kind is
-- read from the name, never stored. system_key is 'admin' on the Admin
-- role and null on every other role (R4, C2). Admin holds every
-- permission automatically, computed from the catalogues; it has no
-- role_permissions rows (trigger below).
-- ---------------------------------------------------------------
create table roles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text        not null default '',
  system_key  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint roles_name_not_blank check (btrim(name) <> '')
);

create unique index roles_name_unique on roles (lower(name));
create unique index roles_system_key_unique on roles (system_key) where system_key is not null;

-- ---------------------------------------------------------------
-- 3. role_permissions
--
-- One scope per ticked permission; a Pick may carry several rows, one
-- per scope that needs it (R6). Unscoped keys (masters, see amounts)
-- are always stored at 'all'; the service enforces that from the
-- catalogue. access.rights.manage is never stored: only Admin holds it.
-- ---------------------------------------------------------------
create table role_permissions (
  role_id        uuid         not null references roles (id) on delete cascade,
  permission_key text         not null,
  scope          access_scope not null,
  primary key (role_id, permission_key, scope)
);

create function access_refuse_admin_rows() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from shared.roles r where r.id = new.role_id and r.system_key = 'admin') then
    raise exception 'The Admin role holds every permission automatically and cannot be given permission rows.';
  end if;
  return new;
end
$$;

create trigger role_permissions_refuse_admin
  before insert or update on role_permissions
  for each row execute function access_refuse_admin_rows();

-- ---------------------------------------------------------------
-- 4. user_roles and user_units
--
-- granted_by is NULLABLE (C4): null means granted by the system, the
-- migration or the mapping re-sync, matching access_audit.actor_id.
-- A role with holders cannot be deleted (on delete restrict, R12).
-- There is no user_permissions table: decision 6 forbids direct
-- permissions on a person.
-- ---------------------------------------------------------------
create table user_roles (
  user_id    uuid        not null references users (id) on delete cascade,
  role_id    uuid        not null references roles (id) on delete restrict,
  granted_by uuid        references users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index user_roles_role_id_idx on user_roles (role_id);

-- Selected sites, one row per site. A location shortcut on screen
-- writes one row per site of the location; the location itself is
-- never stored, so a site added to it later is not covered (decision 4).
-- NOT shared.user_locations, which is dead and holds locations.
create table user_units (
  user_id    uuid        not null references users (id) on delete cascade,
  unit_id    uuid        not null references sites (id) on delete cascade,
  granted_by uuid        references users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);

create index user_units_unit_id_idx on user_units (unit_id);

-- ---------------------------------------------------------------
-- 5. users.active (section 5.1.8)
--
-- "This person is current." can_login keeps its narrower meaning,
-- "this person has a login". Today can_login = false means either
-- "never had a login" (field staff named on sites) or "sign-in turned
-- off"; the password tells them apart. People with no password stay
-- active: routing and the site pickers rely on them. Nothing reads this
-- column until P2a.
-- ---------------------------------------------------------------
alter table users add column active boolean not null default true;

update users set active = false
where not can_login and password_hash is not null;

-- ---------------------------------------------------------------
-- 6. created_by on projects and sites (O10 Q5). Nullable, not
--    backfilled, filled on insert from P3b onward.
-- ---------------------------------------------------------------
alter table projects add column created_by uuid references users (id) on delete set null;
alter table sites    add column created_by uuid references users (id) on delete set null;

-- ---------------------------------------------------------------
-- 7. reporting_closure (decision 15)
--
-- Who reports up to whom, precomputed. Depth 0 is the person
-- themselves, so Team includes me. Rebuilt whole, in the same
-- transaction, by a statement-level trigger on users, so every writer
-- stays correct: the people form, the import, scripts and psql.
-- Inactive people stay in the closure (O10, Q10 default), so a chain
-- runs through a deactivated middle manager.
-- ---------------------------------------------------------------
create table reporting_closure (
  ancestor_id   uuid not null references users (id) on delete cascade,
  descendant_id uuid not null references users (id) on delete cascade,
  depth         int  not null,
  primary key (ancestor_id, descendant_id),

  constraint reporting_closure_depth_check check (depth >= 0)
);

create index reporting_closure_descendant_id_idx on reporting_closure (descendant_id);

-- Cycle-safe (a path array, as complaints/routing.ts walks the chain)
-- and capped at depth 50, so a bad reports_to can never hang a write.
create function rebuild_reporting_closure() returns void
language plpgsql as $$
begin
  lock table shared.reporting_closure in exclusive mode;
  delete from shared.reporting_closure;
  insert into shared.reporting_closure (ancestor_id, descendant_id, depth)
  with recursive chain (ancestor_id, descendant_id, depth, path) as (
    select u.id, u.id, 0, array[u.id]
    from shared.users u
    union all
    select c.ancestor_id, u.id, c.depth + 1, c.path || u.id
    from chain c
    join shared.users u on u.reports_to = c.descendant_id
    where c.depth < 50
      and not (u.id = any (c.path))
  )
  select ancestor_id, descendant_id, min(depth)
  from chain
  group by ancestor_id, descendant_id;
end
$$;

create function access_users_rebuild_closure() returns trigger
language plpgsql as $$
begin
  perform shared.rebuild_reporting_closure();
  return null;
end
$$;

create trigger users_rebuild_reporting_closure
  after insert or delete or update of reports_to, active on users
  for each statement execute function access_users_rebuild_closure();

select rebuild_reporting_closure();

-- ---------------------------------------------------------------
-- 8. Scope helper functions (backend kit section 4.4)
--
-- Plain `language sql stable` with no SET clause, so Postgres inlines
-- them into the data query. `sites` is left unqualified on purpose: it
-- is budgeting.sites in production and public.sites locally, and both
-- are on the connection's search_path.
-- ---------------------------------------------------------------

-- Me and everyone under me.
create function access_team_user_ids(me uuid) returns setof uuid
language sql stable as $$
  select rc.descendant_id from shared.reporting_closure rc where rc.ancestor_id = me
$$;

-- Selected sites: ticked on me, plus the sites I lead (O4).
create function access_my_unit_ids(me uuid) returns setof uuid
language sql stable as $$
  select uu.unit_id from shared.user_units uu where uu.user_id = me
  union
  select s.id from sites s where s.manager_id = me or s.supervisor_id = me
$$;

-- Team sites: sites led by me or anyone under me. Ticks are personal and
-- do not travel up the chain.
create function access_team_unit_ids(me uuid) returns setof uuid
language sql stable as $$
  select s.id from sites s
  where s.manager_id    in (select shared.access_team_user_ids(me))
     or s.supervisor_id in (select shared.access_team_user_ids(me))
$$;

-- ---------------------------------------------------------------
-- 9. access_settings: exactly one row, the access version.
-- ---------------------------------------------------------------
create table access_settings (
  id             boolean primary key default true,
  access_version bigint  not null default 1,

  constraint access_settings_single_row check (id)
);

insert into access_settings default values;

-- ---------------------------------------------------------------
-- 10. access_audit (R9): append-only, enforced by the database.
--
-- No foreign keys, on purpose: a person or role deleted later must not
-- break, or be blocked by, history. Ids are kept for filtering; names
-- are snapshots taken at the time. actor_id null = the system (this
-- migration or the mapping re-sync), actor_name 'System'. Rows are
-- written in the same transaction as the change they record.
-- ---------------------------------------------------------------
create table access_audit (
  id          bigint      generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text        not null,
  action      text        not null,
  target_type text        not null,
  target_id   uuid,
  target_name text,
  role_id     uuid,
  role_name   text,
  before      jsonb,
  after       jsonb,
  note        text
);

create index access_audit_at_idx     on access_audit (at desc);
create index access_audit_target_idx on access_audit (target_type, target_id, at desc);
create index access_audit_actor_idx  on access_audit (actor_id, at desc);
create index access_audit_role_idx   on access_audit (role_id, at desc);

-- ---------------------------------------------------------------
-- 11. Seed roles (C2). Admin carries system_key 'admin'; the four
--     mapped roles carry NO system_key and are found by these fixed ids,
--     which are the constants in src/access/seed-roles.ts (a unit test
--     holds the two in step). Their permissions are written by the
--     mapping re-sync, never here. Names follow O2; the owner renames
--     them later on the Roles screen.
--
--     Inserted BEFORE the version triggers below, so the version starts
--     at 1.
-- ---------------------------------------------------------------
insert into roles (id, name, description, system_key) values
  ('5eed0000-0000-4000-8000-000000000001', 'Admin',
   'Everything, everywhere, including managing access. Holds every permission automatically.', 'admin'),
  ('5eed0000-0000-4000-8000-000000000002', 'Budget administrator',
   'What a budget admin could do before roles: all of Budget, including deleting and cost heads.', null),
  ('5eed0000-0000-4000-8000-000000000003', 'Budget staff',
   'What budget staff could do before roles: projects, sites, budgets and expenses, editing only their own expenses.', null),
  ('5eed0000-0000-4000-8000-000000000004', 'Complaints administrator',
   'What a complaints admin could do before roles: every complaint, and the complaint categories.', null),
  ('5eed0000-0000-4000-8000-000000000005', 'Complaints member',
   'What a complaints member could do before roles: raise complaints, and work on the ones that name them.', null);

insert into access_audit (actor_id, actor_name, action, target_type, target_id, target_name,
                          role_id, role_name, before, after, note)
select null, 'System', 'role.created', 'role', r.id, r.name, r.id, r.name, null,
       jsonb_build_object('name', r.name, 'description', r.description),
       'Access migration 0012'
from roles r;

-- ---------------------------------------------------------------
-- 12. The access version rises on role edits only (decision 14).
--     Assignments, ticked sites, active and reports_to never bump it:
--     the per-request query and the scope filter read those fresh.
--     Service code never bumps it; these triggers do.
-- ---------------------------------------------------------------
create function access_bump_version() returns trigger
language plpgsql as $$
begin
  update shared.access_settings set access_version = access_version + 1;
  return null;
end
$$;

create trigger roles_bump_access_version
  after insert or update or delete or truncate on roles
  for each statement execute function access_bump_version();

create trigger role_permissions_bump_access_version
  after insert or update or delete or truncate on role_permissions
  for each statement execute function access_bump_version();

-- ---------------------------------------------------------------
-- 13. History cannot be rewritten. Statement-level, so they fire even
--     when no row matches (`... where false` errors too). The revoke
--     binds a non-owner connection; if production connects as the table
--     owner, the triggers are what hold.
-- ---------------------------------------------------------------
create function access_audit_refuse() returns trigger
language plpgsql as $$
begin
  raise exception 'access_audit is append-only';
end
$$;

create trigger access_audit_no_update_delete
  before update or delete on access_audit
  for each statement execute function access_audit_refuse();

create trigger access_audit_no_truncate
  before truncate on access_audit
  for each statement execute function access_audit_refuse();

revoke update, delete, truncate on access_audit from public;
