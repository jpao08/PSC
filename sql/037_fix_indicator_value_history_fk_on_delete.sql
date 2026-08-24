-- Keep weekly value history even when the current Dashboard value row is removed.
--
-- The application stores a denormalized history row with indicator_id/year/month/week,
-- so indicator_value_id is useful context but should not block deletes of
-- indicator_values. Without ON DELETE SET NULL, month cleanup/reframing can raise:
-- update or delete on table "indicator_values" violates foreign key constraint
-- "indicator_value_history_indicator_value_id_fkey" on table "indicator_value_history".

alter table indicator_value_history
  drop constraint if exists indicator_value_history_indicator_value_id_fkey;

alter table indicator_value_history
  add constraint indicator_value_history_indicator_value_id_fkey
  foreign key (indicator_value_id)
  references indicator_values(id)
  on delete set null;

-- Optional verification:
-- select
--   conname,
--   pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid = 'indicator_value_history'::regclass
--   and conname = 'indicator_value_history_indicator_value_id_fkey';
