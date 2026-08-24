-- Drill Downs are independent analytical tabs.
-- They must not populate the main Dashboard indicator tables.
--
-- This migration preserves existing indicator values and only removes known
-- bridge-style routines that could write Drill Down values back into the
-- Dashboard. It also adds an audit helper to find any remaining DB routines
-- that reference both Drill Down objects and Dashboard indicator value tables.

drop function if exists sync_financial_drilldown_to_indicators();
drop function if exists sync_commercial_drilldown_to_indicators();
drop function if exists sync_marketing_drilldown_to_indicators();
drop function if exists apply_financial_drilldown_to_indicators();
drop function if exists apply_commercial_drilldown_to_indicators();
drop function if exists apply_marketing_drilldown_to_indicators();
drop function if exists populate_indicators_from_financial_drilldown();
drop function if exists populate_indicators_from_commercial_drilldown();
drop function if exists populate_indicators_from_marketing_drilldown();

create or replace function audit_drilldown_dashboard_indicator_writers()
returns table (
  object_type text,
  schema_name text,
  object_name text,
  detail text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with routines as (
    select
      'function'::text as object_type,
      n.nspname::text as schema_name,
      p.proname::text as object_name,
      pg_get_functiondef(p.oid)::text as detail
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
  ),
  triggers as (
    select
      'trigger'::text as object_type,
      n.nspname::text as schema_name,
      t.tgname::text as object_name,
      pg_get_triggerdef(t.oid)::text as detail
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname not in ('pg_catalog', 'information_schema')
  ),
  db_objects as (
    select * from routines
    union all
    select * from triggers
  )
  select object_type, schema_name, object_name, detail
  from db_objects
  where detail ilike any (array[
      '%drilldown%',
      '%drill_down%',
      '%commercial_drilldown%',
      '%marketing_drilldown%',
      '%financial_drilldown%'
    ])
    and detail ilike any (array[
      '%indicator_values%',
      '%indicator_month_projections%',
      '%indicator_month_targets%'
    ])
  order by object_type, schema_name, object_name;
$$;

comment on function audit_drilldown_dashboard_indicator_writers()
is 'Lists DB routines/triggers that reference both Drill Down objects and Dashboard indicator value tables. Expected result after the separation is zero rows, except this audit function definition itself if matched by broad text search.';

-- Standard verification after applying:
-- select *
-- from audit_drilldown_dashboard_indicator_writers()
-- where object_name <> 'audit_drilldown_dashboard_indicator_writers';
