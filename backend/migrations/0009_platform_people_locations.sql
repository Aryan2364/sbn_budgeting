-- The platform layer: one list of people and one list of places, shared
-- by every module (budget today, complaints next, more to come).
--
-- Plan: complain/plan-2026-09-30-1500.md sections 3.1–3.3 and 5.
--
-- Three changes, all of them additive or renames. Nothing the budget
-- module reads loses a row.
--
--   1. site_locations becomes `locations`, a platform master. The
--      complaints module files every complaint against a location and
--      never against a site (plan 3.1a). Budget keeps its optional
--      site -> location link.
--   2. Access moves from users.role (a budget-only admin/staff column)
--      to user_module_access, one row per person per module.
--   3. People gain a designation, a reports-to, a location scope, and
--      the option of logging in with a phone instead of an email.

-- SCHEMA PLACEMENT. The tables every module shares live in `shared`;
-- budget's own tables stay where they are (`budgeting` in production,
-- `public` on a plain local database). `set local` lasts only for this
-- migration's transaction, so where these tables land never depends on
-- the order of search_path in anybody's connection string.
create schema if not exists shared;
set local search_path = shared, budgeting, public;

-- users moves into shared first. A move, not a copy: ids, indexes,
-- constraints and every foreign key pointing at users come with it.
alter table users set schema shared;

-- ---------------------------------------------------------------
-- 1. locations
--
-- A rename, not a copy. Views that read site_locations follow the
-- rename by oid, so the variance view needs no rebuild.
-- ---------------------------------------------------------------
alter table site_locations rename to locations;
alter table locations set schema shared;
alter table locations add column is_active  boolean     not null default true;
alter table locations add column created_at timestamptz not null default now();

alter table sites rename column site_location_id to location_id;
alter index if exists site_locations_name_key rename to locations_name_key;
alter index if exists site_locations_pkey rename to locations_pkey;

create index if not exists sites_location_id_idx on sites (location_id);

-- ---------------------------------------------------------------
-- 2. designations — admin-editable master
--
-- seed_key is the stable identity the routing code reads. The name is
-- free to change ("HOD" -> "Head of Department") without breaking who
-- a complaint is sent to. Same reasoning as cost_heads.seed_key (0003).
-- ---------------------------------------------------------------
create table designations (
  id         uuid    primary key default gen_random_uuid(),
  name       text    not null unique,
  seed_key   text,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

create unique index designations_seed_key_unique
  on designations (seed_key) where seed_key is not null;

insert into designations (name, seed_key, sort_order) values
  ('Supervisor', 'supervisor', 10),
  ('Manager',    'manager',    20),
  ('HOD',        'hod',        30),
  ('CEO',        'ceo',        40);

-- ---------------------------------------------------------------
-- 3. people
-- ---------------------------------------------------------------
alter table users add column designation_id uuid references designations (id);
alter table users add column reports_to     uuid references users (id);

-- Field staff often have no email (plan Q7). A login needs a password
-- and at least one of email or phone to type in.
alter table users drop constraint users_login_needs_credentials;
alter table users add constraint users_login_needs_credentials
  check (not can_login
         or ((email is not null or phone is not null) and password_hash is not null));

alter table users add constraint users_not_own_manager
  check (reports_to is null or reports_to <> id);

-- Phone is the import's matching key and a login identifier, so it is
-- unique where present. Compared digits-only, so "+91 98250 12345" and
-- "9825012345" are the same person. The app stores it normalised (last
-- ten digits); the index is the backstop.
create unique index users_phone_unique
  on users (right(regexp_replace(phone, '\D', '', 'g'), 10))
  where phone is not null and phone <> '';

create index users_designation_id_idx on users (designation_id);
create index users_reports_to_idx on users (reports_to);

-- ---------------------------------------------------------------
-- 4. module access
--
-- module: 'platform' | 'budget' | 'complaints'
--   platform   admin            manages people, locations, designations
--   budget     admin | staff    exactly what users.role meant before
--   complaints admin | member   admin manages categories and sees all
--
-- No row = no access to that module; the module is hidden (kit §26).
-- ---------------------------------------------------------------
create table user_module_access (
  user_id uuid not null references users (id) on delete cascade,
  module  text not null,
  role    text not null,
  primary key (user_id, module),

  constraint user_module_access_role_check check (
       (module = 'platform'   and role = 'admin')
    or (module = 'budget'     and role in ('admin', 'staff'))
    or (module = 'complaints' and role in ('admin', 'member'))
  )
);

-- Budget behaves exactly as it did: every existing person keeps their
-- budget role. Budget admins also become platform admins, because
-- until today they were the ones managing people and locations.
insert into user_module_access (user_id, module, role)
select id, 'budget', role from users;

insert into user_module_access (user_id, module, role)
select id, 'platform', 'admin' from users where role = 'admin';

alter table users drop constraint users_role_check;
alter table users drop column role;

-- ---------------------------------------------------------------
-- 5. location scope — AND the complaint routing map (plan 3.3)
--
-- The Supervisor-designation person assigned to a location receives
-- its complaints; the Manager-designation person is copied. One of
-- each per location is enforced in the service, because designation
-- lives on users and a cross-table unique index cannot see it.
-- ---------------------------------------------------------------
create table user_locations (
  user_id     uuid not null references users (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  primary key (user_id, location_id)
);

create index user_locations_location_id_idx on user_locations (location_id);
