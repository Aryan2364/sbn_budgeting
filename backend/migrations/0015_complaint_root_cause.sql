-- Resolving a complaint records its root cause.
--
-- Owner decision, 7 Oct 2026: the Resolve dialog asks for a compulsory
-- "Root cause analysis" (why the problem happened) beside the existing
-- resolution note (what was done) and the photos of the fix. It is
-- trimmed and 1-2000 characters long.
--
-- Complaints closed before this migration have no root cause, so the
-- column is nullable. The rule that a resolve must carry one applies
-- only to complaints closed AFTER this migration ran: resolving is the
-- only way a complaint closes (0013), so "closed after the cutoff" is
-- "closed by a resolve after this migration". The cutoff is the moment
-- this migration runs, written into the check as a literal (a check
-- cannot read the clock), so the constraint is fully VALID on every
-- existing row and keeps holding if an old closed row is ever updated.
-- The API refuses a resolve without a root cause first (422, in
-- Gujarati); this check is the backstop.

-- SCHEMA PLACEMENT: complaints lives in `complaints`. Nothing is created
-- here but a column and checks, which follow their table.
set local search_path = complaints, shared, budgeting, public;

alter table complaints add column root_cause text;

-- Present means real text: never blank, at most 2000 characters (the API
-- stores it trimmed).
alter table complaints add constraint complaints_root_cause_text
  check (root_cause is null or (btrim(root_cause) <> '' and char_length(root_cause) <= 2000));

-- Closed after this migration means resolved with a root cause.
-- clock_timestamp(), not now(): if an earlier migration closed rows in
-- this same transaction (0013 sets closed_at to the resolve time, never
-- later than now()), they still fall at or before the cutoff.
do $$
begin
  execute format(
    'alter table complaints add constraint complaints_root_cause_when_resolved
       check (status <> %L or coalesce(closed_at <= %L::timestamptz, false) or root_cause is not null)',
    'closed',
    clock_timestamp()
  );
end
$$;

comment on column complaints.root_cause is
  'Why the problem happened, written by the supervisor when resolving (owner, 7 Oct 2026). Null on complaints closed before migration 0015.';
