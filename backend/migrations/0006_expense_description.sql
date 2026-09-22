-- A free-text narration field for an expense.
--
-- NULLABLE, no backfill, no default. An expense recorded before this
-- column existed has no description, which is a different fact from
-- having an empty one -- an empty string would be a decision nobody
-- made (the same reasoning 0005 applied to plantation_complete_date).

alter table expenses
  add column description text;
