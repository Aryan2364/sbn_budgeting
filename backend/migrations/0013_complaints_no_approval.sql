-- Complaints: no approval step, no designation routing, members see
-- their team.
--
-- Owner decisions, 5 Oct 2026 (access/RESOLUTIONS.md, A1-A3):
--   A1 "There is no need of approvals overall." A complaint goes
--      raised -> started -> resolved, and resolving CLOSES it. There is
--      no awaiting_approval, approve, send back or approver.
--   A2 "The concept of designation should not be linked before acting."
--      Routing no longer looks anyone up by designation: the supervisor
--      and manager come from the site, and who else sees a complaint is
--      the access system's Team scope (the reports_to chain). The HOD,
--      CEO and approver snapshots go.
--   A3 The "Complaints member" seed role views and comments at Team
--      (was Own); work and reassign stay at Own.
--
-- Safe on production (no categories, no complaints today: every data
-- step below matches nothing) and on a database with approval data.
-- Nothing else reads the dropped columns: routing, the read models, the
-- scope filter, the events and the notifications were changed with it.

-- SCHEMA PLACEMENT: complaints and its events live in `complaints`; the
-- access tables in `shared`. Nothing is created here but constraints,
-- which follow their tables.
set local search_path = complaints, shared, budgeting, public;

-- ---------------------------------------------------------------
-- 1. A1: every complaint waiting for approval is closed, as an approval
--    would have closed it, by the person who resolved it, when they
--    resolved it. The timeline says why; actor null = the system.
-- ---------------------------------------------------------------
with closed as (
  update complaints c
     set status = 'closed', closed_at = c.resolved_at, closed_by = c.resolved_by, updated_at = now()
   where c.status = 'awaiting_approval'
  returning c.id
)
insert into complaint_events (complaint_id, kind, actor_id, note, from_status, to_status)
select id, 'closed', null, 'closed: approval removed', 'awaiting_approval', 'closed'
from closed;

-- Earlier approvals and send-backs stay in the timeline under the kinds
-- that remain: an approval was the step that closed the complaint; a
-- send-back becomes a comment that keeps its note and status move.
update complaint_events set kind = 'closed' where kind = 'approved';
update complaint_events
   set kind = 'comment', note = 'Sent back: ' || coalesce(note, '')
 where kind = 'sent_back';

alter table complaint_events drop constraint complaint_events_kind_check;
alter table complaint_events add constraint complaint_events_kind_check
  check (kind in ('raised', 'started', 'resolved', 'closed', 'reassigned', 'comment'));

-- ---------------------------------------------------------------
-- 2. The status check without awaiting_approval, and the checks that
--    existed only for it.
-- ---------------------------------------------------------------
alter table complaints drop constraint complaints_status_check;
alter table complaints add constraint complaints_status_check
  check (status in ('open', 'in_progress', 'closed'));

alter table complaints drop constraint complaints_approver_when_required;

alter table complaints drop constraint complaints_resolved_has_resolution;
alter table complaints add constraint complaints_resolved_has_resolution
  check (status <> 'closed' or resolved_at is not null);

-- ---------------------------------------------------------------
-- 3. A1 and A2: the columns only approval and designation routing used.
--    Their indexes go with them. Kept: supervisor_id and manager_id (the
--    site's people), raised_by, resolved_by and closed_by.
-- ---------------------------------------------------------------
alter table complaints
  drop column requires_approval,
  drop column approver_id,
  drop column hod_id,
  drop column ceo_id;

alter table complaint_categories
  drop column requires_approval,
  drop column approver_designation_id;

-- ---------------------------------------------------------------
-- 4. Roles. Every role loses complaints.complaints.approve (the key is
--    gone from the catalogue); the Complaints member seed role (fixed id,
--    C2) views and comments at Team instead of Own (A3). A role whose
--    rows are already as wanted is left alone. One History row per role
--    changed, in the re-sync's format: the FULL permission set before
--    and after, actor null = System (R9). The access version rises by
--    the role_permissions triggers of migration 0012, so every running
--    process reloads its role map.
-- ---------------------------------------------------------------
create temporary table m0013_changes (
  role_id uuid not null,
  permission_key text not null,
  from_scope access_scope not null,
  to_scope access_scope
) on commit drop;

insert into m0013_changes
select rp.role_id, rp.permission_key, rp.scope, null
from role_permissions rp
where rp.permission_key = 'complaints.complaints.approve';

insert into m0013_changes
select rp.role_id, rp.permission_key, rp.scope, 'team'
from role_permissions rp
where rp.role_id = '5eed0000-0000-4000-8000-000000000005'
  and rp.permission_key in ('complaints.complaints.view', 'complaints.complaints.comment')
  and rp.scope = 'own';

create temporary table m0013_before on commit drop as
select r.id, r.name,
       jsonb_build_object('permissions', (
         select coalesce(jsonb_object_agg(k.permission_key, k.scopes), '{}'::jsonb)
         from (select rp.permission_key, jsonb_agg(rp.scope::text order by rp.scope) as scopes
               from role_permissions rp where rp.role_id = r.id
               group by rp.permission_key) k
       )) as permissions
from roles r
where r.id in (select role_id from m0013_changes);

-- Only when a role changes: the version triggers fire on every
-- statement, even one that matches nothing, and a database with no such
-- rows (a fresh one) must keep its version.
do $m0013$
begin
  if not exists (select 1 from m0013_changes) then
    return;
  end if;

  insert into role_permissions (role_id, permission_key, scope)
  select role_id, permission_key, to_scope from m0013_changes where to_scope is not null
  on conflict do nothing;

  delete from role_permissions rp
  using m0013_changes ch
  where rp.role_id = ch.role_id and rp.permission_key = ch.permission_key and rp.scope = ch.from_scope;

  update roles set updated_at = now() where id in (select id from m0013_before);

  insert into access_audit (actor_id, actor_name, action, target_type, target_id, target_name,
                            role_id, role_name, before, after, note)
  select null, 'System', 'role.permissions_changed', 'role', b.id, b.name, b.id, b.name, b.permissions,
         jsonb_build_object('permissions', (
           select coalesce(jsonb_object_agg(k.permission_key, k.scopes), '{}'::jsonb)
           from (select rp.permission_key, jsonb_agg(rp.scope::text order by rp.scope) as scopes
                 from role_permissions rp where rp.role_id = b.id
                 group by rp.permission_key) k
         )),
         'Migration 0013: complaint approvals removed; Complaints member views and comments at Team (owner, 2026-10-05)'
  from m0013_before b
  order by b.name, b.id;
end
$m0013$;
