-- Sadbhavna tracking — initial schema.
-- Plan: plan-2026-09-05-1218.md section 5.
--
-- MONEY IS bigint PAISE. Never numeric, never money, never a float.
-- Every column holding an amount is named *_paise so that a reader
-- cannot mistake it for rupees.

-- ---------------------------------------------------------------
-- users — one list of people (plan section 5, question 3)
--
-- Office staff log in. Managers and supervisors are people records
-- that may or may not have a login. There is no roles table and no
-- permission grid: two roles, and they are a column.
-- ---------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  email         text,
  phone         text,
  role          text        not null,
  password_hash text,
  can_login     boolean     not null default false,
  created_at    timestamptz not null default now(),

  constraint users_role_check check (role in ('admin', 'staff')),

  -- can_login = false cannot authenticate even if a password is set:
  -- the API refuses it, and this stops the other half of the mistake,
  -- a login-enabled row with nothing to log in with.
  constraint users_login_needs_credentials
    check (not can_login or (email is not null and password_hash is not null))
);

-- Unique only where an email exists. A person who never logs in has
-- no email, and any number of them may exist.
create unique index users_email_unique on users (lower(email)) where email is not null;

-- ---------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------
create table projects (
  id            uuid primary key default gen_random_uuid(),
  donor_name    text        not null,
  name          text        not null,
  planned_trees integer     not null,
  created_at    timestamptz not null default now(),

  constraint projects_planned_trees_check check (planned_trees > 0)
);

-- ---------------------------------------------------------------
-- site_locations — master
-- ---------------------------------------------------------------
create table site_locations (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ---------------------------------------------------------------
-- sites
--
-- plantation_start_date is REQUIRED: the expense form derives a
-- period from it (question 6).
--
-- The sites of a project may sum past the project's planned_trees.
-- That is a warning, never a block (question 5), so there is
-- deliberately NO constraint here enforcing it.
-- ---------------------------------------------------------------
create table sites (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid        not null references projects (id),
  name                  text        not null,
  site_location_id      uuid        references site_locations (id),
  planned_trees         integer     not null,
  plantation_start_date date        not null,
  manager_id            uuid        references users (id),
  supervisor_id         uuid        references users (id),
  created_at            timestamptz not null default now(),

  constraint sites_planned_trees_check check (planned_trees > 0)
);

create index sites_project_id_idx on sites (project_id);
create index sites_manager_id_idx on sites (manager_id);
create index sites_supervisor_id_idx on sites (supervisor_id);

-- ---------------------------------------------------------------
-- cost_heads — master, the fixed 19 from plan section 2.1
--
-- Editable in Settings by an admin, which is why the spreadsheet's
-- spelling of "Miscellenous" is seeded as-is rather than corrected
-- in a migration.
-- ---------------------------------------------------------------
create table cost_heads (
  id         uuid primary key default gen_random_uuid(),
  name       text    not null unique,
  sort_order integer not null,
  is_active  boolean not null default true
);

create index cost_heads_sort_order_idx on cost_heads (sort_order);

-- ---------------------------------------------------------------
-- site_budgets — one row per site per head per PERIOD
--
-- period: 0 = Initial, 1..4 = Year 1..Year 4.
--
-- A blank cell in the entry grid writes NO ROW (question 7). Only a
-- cell carrying a number, zero included, becomes a row. That is what
-- makes "Budget not set" and "0.00" different states rather than the
-- same one.
-- ---------------------------------------------------------------
create table site_budgets (
  id             uuid     primary key default gen_random_uuid(),
  site_id        uuid     not null references sites (id) on delete cascade,
  cost_head_id   uuid     not null references cost_heads (id),
  period         smallint not null,
  per_tree_paise bigint   not null,

  constraint site_budgets_period_check check (period between 0 and 4),
  constraint site_budgets_amount_check check (per_tree_paise >= 0),
  constraint site_budgets_unique unique (site_id, cost_head_id, period)
);

create index site_budgets_site_id_idx on site_budgets (site_id);
create index site_budgets_cost_head_id_idx on site_budgets (cost_head_id);

-- ---------------------------------------------------------------
-- expenses
--
-- period is STORED, never derived at read time (question 6). The
-- form pre-fills it from spent_on against the site's
-- plantation_start_date and the user may override it; what is on the
-- row is the record. A late-booked invoice or a corrected start date
-- must not silently reclassify an expense somebody has already read
-- in a report.
--
-- No description column (question 2). No attachments (question 4).
-- ---------------------------------------------------------------
create table expenses (
  id           uuid     primary key default gen_random_uuid(),
  site_id      uuid     not null references sites (id),
  cost_head_id uuid     not null references cost_heads (id),
  spent_on     date     not null,
  period       smallint not null,
  amount_paise bigint   not null,
  bill_number  text,
  approved_by  text,
  created_by   uuid     references users (id),
  created_at   timestamptz not null default now(),

  constraint expenses_period_check check (period between 0 and 4),
  -- ASSUMPTION, not a ruling: no rule was given for negative or zero
  -- expenses. Nothing in the spreadsheet is either. Relax this if a
  -- credit note has to be booked as a negative amount.
  constraint expenses_amount_check check (amount_paise >= 0)
);

create index expenses_site_id_idx on expenses (site_id);
create index expenses_cost_head_id_idx on expenses (cost_head_id);
create index expenses_spent_on_idx on expenses (spent_on);
create index expenses_variance_idx on expenses (site_id, cost_head_id, period);
