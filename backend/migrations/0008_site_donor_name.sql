-- A site gets its own donor name.
--
-- CLIENT INSTRUCTION, via the consultant: a site's donor defaults from
-- its project when one is chosen, but a site is free to carry a
-- different donor, or a donor of its own with no project at all —
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
