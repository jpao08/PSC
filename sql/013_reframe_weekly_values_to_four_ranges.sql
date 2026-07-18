-- Reframe indicator monthly inputs from 6 fixed weeks to 4 day ranges.
-- Ranges: 1-7, 8-14, 15-21, 22-end_of_month.
-- This script is idempotent.

-- 1) Merge historical week 4/5/6 into range 4.
--    sum indicators: use sum.
--    avg indicators: use arithmetic mean among week 4/5/6 records.
with merged as (
  select
    v.indicator_id,
    v.year,
    v.month,
    4 as week_number,
    case
      when coalesce(i.aggregation_type, 'sum') = 'sum' then sum(v.value)
      else avg(v.value)
    end as merged_value,
    (array_agg(v.source_user_id order by coalesce(v.updated_at, v.created_at) desc))[1] as merged_source_user_id
  from indicator_values v
  join indicators i
    on i.id = v.indicator_id
  where v.week_number in (4, 5, 6)
  group by
    v.indicator_id,
    v.year,
    v.month,
    coalesce(i.aggregation_type, 'sum')
)
insert into indicator_values (
  indicator_id,
  year,
  month,
  week_number,
  value,
  source_user_id
)
select
  m.indicator_id,
  m.year,
  m.month,
  m.week_number,
  m.merged_value,
  m.merged_source_user_id
from merged m
on conflict (indicator_id, year, month, week_number)
do update
set
  value = excluded.value,
  source_user_id = excluded.source_user_id,
  updated_at = now();

-- Remap history FK references from old buckets (5/6) to consolidated bucket 4.
update indicator_value_history h
set indicator_value_id = v4.id
from indicator_values v_old
join indicator_values v4
  on v4.indicator_id = v_old.indicator_id
 and v4.year = v_old.year
 and v4.month = v_old.month
 and v4.week_number = 4
where h.indicator_value_id = v_old.id
  and v_old.week_number in (5, 6)
  and h.indicator_value_id <> v4.id;

-- Remove old buckets 5 and 6 after merge.
delete from indicator_values
where week_number in (5, 6);

-- Keep history compatible with the new model.
update indicator_value_history
set week_number = 4
where week_number in (5, 6);

-- 2) Replace week constraints from 1..6 to 1..4.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'indicator_values'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%week_number%'
  loop
    execute format('alter table indicator_values drop constraint if exists %I', constraint_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'indicator_values'::regclass
      and conname = 'indicator_values_week_number_check'
      and contype = 'c'
  ) then
    alter table indicator_values
      add constraint indicator_values_week_number_check
      check (week_number between 1 and 4);
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'indicator_value_history'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%week_number%'
  loop
    execute format('alter table indicator_value_history drop constraint if exists %I', constraint_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'indicator_value_history'::regclass
      and conname = 'indicator_value_history_week_number_check'
      and contype = 'c'
  ) then
    alter table indicator_value_history
      add constraint indicator_value_history_week_number_check
      check (week_number between 1 and 4);
  end if;
end;
$$;
