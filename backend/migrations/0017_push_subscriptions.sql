-- Phone notifications (web push): one row per phone (browser) a person
-- has turned notifications on for.
--
-- Plan: complain/plan-phone-2026-10-13-1035.md, Phase 6a (decisions L11,
-- L12). The phone subscribes with the browser's PushSubscription and
-- sends it to POST /push/subscriptions; the API sends a push to it on the
-- same events that feed the bell (raise, resolve, reassign), after the
-- complaint's transaction has committed.
--
-- `endpoint` is the push service's address for that phone, so it is
-- unique: the same phone signed in as another person moves to them
-- (upsert on endpoint), and a person signed in on two phones has two
-- rows. A dead subscription (the push service answers 404 or 410) is
-- deleted when a send finds it; other failures only count up.
--
-- `p256dh` and `auth` are the phone's public encryption key and secret
-- (base64url, as the browser hands them out). They let the API encrypt a
-- message only that phone can read; they grant nothing else.
--
-- NO BEHAVIOUR CHANGE on its own: nothing is sent unless the VAPID keys
-- are set in the API's environment.

-- SCHEMA PLACEMENT: a phone belongs to a person, not to a module, so the
-- table lives in `shared` beside `users`. `set local` scopes the path to
-- this migration's transaction (as 0010 and 0012 do).
set local search_path = shared, complaints, budgeting, public;

create table push_subscriptions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references users (id) on delete cascade,
  endpoint        text        not null unique,
  p256dh          text        not null,
  auth            text        not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   integer     not null default 0,
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_failure_count_not_negative check (failure_count >= 0)
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

comment on table push_subscriptions is
  'Phones (browser push subscriptions) that receive complaint notifications. One row per endpoint; upserted by POST /push/subscriptions, removed by DELETE /push/subscriptions at sign-out or when the push service answers 404/410.';
comment on column push_subscriptions.endpoint is
  'The push service URL for this phone (https). Unique: a phone belongs to whoever signed in on it last.';
comment on column push_subscriptions.failure_count is
  'Failed sends since the last success or re-subscribe, other than 404/410 (which delete the row).';
