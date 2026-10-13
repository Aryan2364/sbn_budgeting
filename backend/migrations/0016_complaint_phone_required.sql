-- The complainant's mobile number is compulsory again on new complaints.
--
-- Decision (user, 13 Oct 2026): the raise form must have the
-- complainant's mobile number. This reverses the phone half of 0014
-- (owner, 6 Oct 2026), which made it optional; the complainant's name and
-- the description stay optional.
--
-- Complaints raised before this migration may have no phone (0014 let
-- them leave it out), so the column stays nullable and those rows stay
-- valid. The rule applies only to complaints raised AFTER this migration
-- ran. As in 0015, the cutoff is the moment this migration runs, written
-- into the check as a literal (a check cannot read the clock), so the
-- constraint is fully VALID on every existing row and keeps holding if an
-- old phone-less row is ever updated.
--
-- The API refuses a raise without a phone first (422, in Gujarati), and
-- still requires 10 digits; this check is the backstop. "Present" already
-- means "not blank" (0014's complaints_optional_text_not_blank).

-- SCHEMA PLACEMENT: complaints lives in `complaints`. Nothing is created
-- here but a check, which follows its table.
set local search_path = complaints, shared, budgeting, public;

-- Raised after this migration means raised with a phone.
-- clock_timestamp(), not now(): every row that exists when this runs was
-- raised at or before now() (raised_at defaults to now()), so all of them
-- fall at or before the cutoff.
do $$
begin
  execute format(
    'alter table complaints add constraint complaints_phone_when_raised
       check (complainant_phone is not null or raised_at <= %L::timestamptz)',
    clock_timestamp()
  );
end
$$;

comment on column complaints.complainant_phone is
  'The complainant''s mobile number, as typed (trimmed). Required on complaints raised after migration 0016 (user, 13 Oct 2026); may be null on complaints raised between 0014 and 0016.';
