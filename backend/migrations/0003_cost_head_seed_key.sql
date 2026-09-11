-- cost_heads needs a stable key that is not its display name.
--
-- The ruling in plan section 3 is that "Miscellenous" ships misspelled
-- because cost_heads is admin-editable in Settings, so a correction is
-- a row edit rather than a migration. That only holds if the seed can
-- tell "the head I shipped, since renamed" from "a head I have not
-- shipped yet".
--
-- Keyed on `name`, it cannot. An admin renames Miscellenous to
-- Miscellaneous, the next deploy runs the seed, finds no row called
-- Miscellenous, and inserts it again — twenty heads, one of them a
-- duplicate nobody asked for, and the correction quietly undone.
--
-- seed_key is that stable identity. It is set once, at seed time, and
-- never displayed.

alter table cost_heads add column seed_key text;

-- Backfill from the shipped names, which is safe precisely because
-- nothing has been renamed yet. From here on the key carries the
-- identity and the name is free to change.
update cost_heads
set seed_key = btrim(
  regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '-', 'g'),
  '-'
);

create unique index cost_heads_seed_key_unique
  on cost_heads (seed_key)
  where seed_key is not null;
