-- The period anchor, corrected.
--
-- CLIENT INSTRUCTION, 7 Sep 2026. Not an inference: the client stated
-- that years are calculated from the plantation COMPLETE date, and
-- offered the project start date as her own fallback where that
-- provision does not exist.
--
-- What was built in Phase 4 is `plantation_start_date`, which is a
-- DIFFERENT DATE. Planting takes time. Start and complete are not the
-- same day, and Year 1 begins at a different point depending on which
-- one anchors it — an expense a fortnight after planting finishes is
-- Initial under one anchor and Year 1 under the other.
--
-- So this adds the complete date rather than redefining the start
-- date. Both are kept, because both are real facts about a site and
-- only one of them is the anchor.
--
-- NULLABLE, on purpose. A site that is still being planted has no
-- complete date, and the client's own fallback covers exactly that
-- case: derive from the start date until the complete date exists.
-- Requiring it would block recording a site that is mid-plantation,
-- which is most of them at the moment a site is first entered.

alter table sites
  add column plantation_complete_date date;

comment on column sites.plantation_complete_date is
  'The period anchor when set. Null until plantation finishes, and
   plantation_start_date is the fallback anchor until then (client
   instruction, 7 Sep 2026). Both dates are real and neither replaces
   the other.';

-- A site cannot finish being planted before it started.
alter table sites
  add constraint sites_plantation_dates_ordered
  check (
    plantation_complete_date is null
    or plantation_complete_date >= plantation_start_date
  );

-- ---------------------------------------------------------------
-- EXISTING EXPENSES ARE NOT TOUCHED, and that is the point.
--
-- `expenses.period` is stored on the row and is never derived at read
-- time (question 6). The reason that decision was made, written down
-- in the plan before this change existed, is this exact situation: a
-- corrected anchor must not silently reclassify historical expenses
-- and change a report somebody has already read.
--
-- So there is no UPDATE here. Derivation is a convenience at entry;
-- the stored value is the record. New expenses pre-fill from the new
-- anchor, and the user can still override.
-- ---------------------------------------------------------------
