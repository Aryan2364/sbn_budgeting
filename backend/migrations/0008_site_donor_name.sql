-- A site gets its own donor name.
--
-- CLIENT INSTRUCTION, via the consultant: a site's donor defaults from
-- its project when one is chosen, but a site is free to carry a
-- different donor, or a donor of its own with no project at all --
-- 0007 already made the project link optional and ordinary, and a
-- donor cannot depend on a link the site may not have.
--
-- NULLABLE, and NO BACKFILL. `projects.donor_name` is `not null`
-- because a project has always required one; a site did not, so a
-- site recorded before this column existed simply has no donor of its
-- own to write in. That is a different fact from an empty string, and
-- treating it as one by backfilling from the project would assert a
-- link the site's own data never made -- some sites have no project
-- at all, and even those that do may since have been given a
-- different donor on the site itself.

alter table sites
  add column donor_name text;

comment on column sites.donor_name is
  'This site''s own donor. Null means none recorded, which is
   different from an empty string. Prefilled client-side from the
   chosen project''s donor_name when a project is picked, but always
   editable and never synced back to the project.';

-- ONE-OFF BACKFILL, requested by the client after the column above
-- landed (not part of the original donor feature, and not to be
-- confused with the "NO BACKFILL" note above, which explains why the
-- column itself starts out empty rather than copied from anywhere).
--
-- The form's prefill above only ever fires when someone actively
-- picks a project on the site form. A site created before this
-- column existed never goes through that moment again, so without
-- this statement it would show an em dash for its donor forever, even
-- though its project has one on record. This corrects that for
-- existing data only, once, at migration time:
--
-- sites that HAVE a project and have no donor of their own inherit
-- that project's donor_name. Sites with no project are left null --
-- since 0007 a site without a project is ordinary, and there is
-- nothing to inherit from. A site that already has its own donor_name
-- is left untouched, since the site's own data already answered the
-- question.
update sites s
set donor_name = p.donor_name
from projects p
where s.project_id = p.id
  and s.donor_name is null;
