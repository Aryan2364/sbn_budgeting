-- Complaints get a short title; description and the complainant become
-- optional.
--
-- Owner decision, 6 Oct 2026 (the raise form): the form asks for a
-- complaint title first, then site, category, description, complainant's
-- name and complainant's phone. Title, site and category are compulsory.
-- Description, complainant's name and phone are optional; empty means
-- none and is stored as null, never as an empty string. The title is the
-- complaint's main line on every list, the detail and the dashboard.
--
-- Existing rows (production has none on 6 Oct 2026; local and test
-- databases have some) get a title from their description: its first
-- non-blank line, trimmed, cut to 120 characters. A description with no
-- text at all (the API never allowed one) falls back to "Complaint
-- C-000123".

-- SCHEMA PLACEMENT: complaints lives in `complaints`. Nothing is created
-- here but a column and checks, which follow their table.
set local search_path = complaints, shared, budgeting, public;

-- ---------------------------------------------------------------
-- 1. The title: added, filled, then required.
-- ---------------------------------------------------------------
alter table complaints add column title text;

update complaints c
   set title = coalesce(
         nullif(rtrim(left(btrim(substring(btrim(c.description, E' \t\r\n') from '^[^\r\n]*')), 120)), ''),
         'Complaint C-' || lpad(c.number::text, greatest(6, length(c.number::text)), '0')
       );

alter table complaints alter column title set not null;

alter table complaints add constraint complaints_title_check
  check (btrim(title) <> '' and char_length(title) <= 120);

-- ---------------------------------------------------------------
-- 2. Description and the complainant: optional. "None" is null, so a
--    blank value already stored becomes null before the checks.
-- ---------------------------------------------------------------
alter table complaints
  alter column description drop not null,
  alter column complainant_name drop not null,
  alter column complainant_phone drop not null;

update complaints set description = null where btrim(description) = '';
update complaints set complainant_name = null where btrim(complainant_name) = '';
update complaints set complainant_phone = null where btrim(complainant_phone) = '';

alter table complaints add constraint complaints_optional_text_not_blank
  check (
    (description is null or btrim(description) <> '')
    and (complainant_name is null or btrim(complainant_name) <> '')
    and (complainant_phone is null or btrim(complainant_phone) <> '')
  );
