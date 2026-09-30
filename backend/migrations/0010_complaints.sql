-- The complaints module.
--
-- Plan: complain/plan-2026-09-30-1500.md sections 3.4–3.6 and 5.
--
-- A complaint is raised against a LOCATION, never a site (plan 3.1a).
-- Who handles it is decided once, at raise time, and written onto the
-- row (plan 3.4): a later change to a location's supervisor must not
-- silently move an open complaint, and a closed one must still say who
-- actually handled it. Reassignment is an explicit, logged action.

-- SCHEMA PLACEMENT: the complaints module's tables live in their own
-- `complaints` schema; users, locations and designations are read from
-- `shared`. `set local` scopes this to the migration's transaction.
create schema if not exists complaints;
set local search_path = complaints, shared, budgeting, public;

-- ---------------------------------------------------------------
-- complaint_categories — admin-editable master, the cost_heads pattern
--
-- requires_approval and approver_designation_id answer plan Q3's
-- default: approval is per category, and the approver is whoever holds
-- that designation in the chain (HOD unless changed).
-- ---------------------------------------------------------------
create table complaint_categories (
  id                      uuid    primary key default gen_random_uuid(),
  name                    text    not null unique,
  seed_key                text,
  sort_order              integer not null default 0,
  is_active               boolean not null default true,
  requires_approval       boolean not null default true,
  approver_designation_id uuid    references designations (id),
  created_at              timestamptz not null default now()
);

create unique index complaint_categories_seed_key_unique
  on complaint_categories (seed_key) where seed_key is not null;

-- ---------------------------------------------------------------
-- complaints
--
-- number is the human reference, shown as C-000123. A sequence, not
-- a count: numbers are never reused, even after a failed insert.
-- ---------------------------------------------------------------
create sequence complaint_number_seq;

create table complaints (
  id                uuid        primary key default gen_random_uuid(),
  number            bigint      not null unique default nextval('complaint_number_seq'),
  location_id       uuid        not null references locations (id),
  category_id       uuid        not null references complaint_categories (id),

  complainant_name  text        not null,
  complainant_phone text        not null,
  location_note     text,
  description       text        not null,

  status            text        not null default 'open',

  -- Snapshot of category.requires_approval at raise time, for the same
  -- reason as the people below: editing a category does not rewrite
  -- the rules a complaint was raised under.
  requires_approval boolean     not null,

  raised_by         uuid        not null references users (id),
  raised_at         timestamptz not null default now(),

  -- The routing snapshot (plan 3.4).
  supervisor_id     uuid        not null references users (id),
  manager_id        uuid        references users (id),
  hod_id            uuid        references users (id),
  ceo_id            uuid        references users (id),
  approver_id       uuid        references users (id),

  started_at        timestamptz,
  resolution_note   text,
  resolved_at       timestamptz,
  resolved_by       uuid        references users (id),
  closed_at         timestamptz,
  closed_by         uuid        references users (id),
  updated_at        timestamptz not null default now(),

  constraint complaints_status_check
    check (status in ('open', 'in_progress', 'awaiting_approval', 'closed')),

  -- A complaint that needs approval and has nobody to approve it would
  -- sit in "Awaiting approval" forever. Refused at raise time instead.
  constraint complaints_approver_when_required
    check (not requires_approval or approver_id is not null),

  constraint complaints_resolved_has_resolution
    check (status not in ('awaiting_approval', 'closed') or resolved_at is not null),

  constraint complaints_closed_has_close
    check (status <> 'closed' or closed_at is not null)
);

create index complaints_status_idx      on complaints (status);
create index complaints_location_id_idx on complaints (location_id);
create index complaints_category_id_idx on complaints (category_id);
create index complaints_supervisor_idx  on complaints (supervisor_id);
create index complaints_manager_idx     on complaints (manager_id);
create index complaints_hod_idx         on complaints (hod_id);
create index complaints_approver_idx    on complaints (approver_id);
create index complaints_raised_by_idx   on complaints (raised_by);
create index complaints_raised_at_idx   on complaints (raised_at);

-- ---------------------------------------------------------------
-- complaint_photos
--
-- The file lives on disk under UPLOAD_DIR at storage_key, a server-
-- generated name. It is served only through an authorised endpoint,
-- never as a public static path.
-- ---------------------------------------------------------------
create table complaint_photos (
  id            uuid        primary key default gen_random_uuid(),
  complaint_id  uuid        not null references complaints (id) on delete cascade,
  stage         text        not null,
  storage_key   text        not null unique,
  content_type  text        not null,
  bytes         integer     not null,
  original_name text,
  uploaded_by   uuid        not null references users (id),
  uploaded_at   timestamptz not null default now(),

  constraint complaint_photos_stage_check check (stage in ('raise', 'resolve')),
  constraint complaint_photos_bytes_check check (bytes > 0)
);

create index complaint_photos_complaint_idx on complaint_photos (complaint_id);

-- ---------------------------------------------------------------
-- complaint_events — append-only history (plan 3.6)
-- ---------------------------------------------------------------
create table complaint_events (
  id           uuid        primary key default gen_random_uuid(),
  complaint_id uuid        not null references complaints (id) on delete cascade,
  kind         text        not null,
  actor_id     uuid        references users (id),
  note         text,
  from_status  text,
  to_status    text,
  payload      jsonb,
  at           timestamptz not null default now(),

  constraint complaint_events_kind_check check (kind in (
    'raised', 'started', 'resolved', 'approved', 'sent_back',
    'closed', 'reassigned', 'comment'
  ))
);

create index complaint_events_complaint_idx on complaint_events (complaint_id, at);

-- ---------------------------------------------------------------
-- notifications — in-app, per person (plan Q5 default)
-- ---------------------------------------------------------------
create table notifications (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users (id) on delete cascade,
  complaint_id uuid        references complaints (id) on delete cascade,
  kind         text        not null,
  title        text        not null,
  body         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_unread_idx on notifications (user_id, read_at, created_at desc);
