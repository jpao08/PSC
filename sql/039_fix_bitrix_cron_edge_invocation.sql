-- Fix Bitrix cron wrappers to call invoke_edge_function with an unambiguous signature.
-- Some databases may contain overloaded invoke_edge_function variants, so the cron
-- wrappers must pass both arguments with explicit casts.

drop function if exists run_commercial_sync_cron();

create function run_commercial_sync_cron()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  start_result jsonb;
  request_id bigint;
begin
  start_result := start_commercial_cron_sync();

  request_id := public.invoke_edge_function(
    'commercial-sync'::text,
    180000::integer
  );

  return start_result || jsonb_build_object('requestId', request_id);
end;
$$;

drop function if exists run_marketing_sync_cron();

create function run_marketing_sync_cron()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  start_result jsonb;
  request_id bigint;
begin
  start_result := start_marketing_current_month_cron_sync();

  request_id := public.invoke_edge_function(
    'marketing-sync'::text,
    55000::integer
  );

  return start_result || jsonb_build_object('requestId', request_id);
end;
$$;
