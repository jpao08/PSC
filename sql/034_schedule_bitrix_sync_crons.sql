-- Schedule Bitrix syncs for Commercial and Marketing.
-- Runs at 08:00 and 18:00 America/Sao_Paulo, represented as 11:00 and 21:00 UTC.
-- Requires Supabase extensions pg_cron, pg_net and Vault enabled.
--
-- Before applying the schedules, create these Vault secrets in Supabase SQL:
-- select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'psc_supabase_url');
-- select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>', 'psc_service_role_key');
--
-- This script is idempotent.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function psc_secret(secret_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  order by created_at desc
  limit 1;
$$;

create or replace function start_commercial_cron_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_job bitrix_sync_jobs%rowtype;
  new_job bitrix_sync_jobs%rowtype;
begin
  select * into existing_job
  from bitrix_sync_jobs
  where status in ('pending', 'running')
    and job_type = 'incremental'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'jobId', existing_job.job_id,
      'status', existing_job.status,
      'created', false,
      'message', 'Ja existe uma sincronizacao comercial em andamento.'
    );
  end if;

  insert into bitrix_sync_jobs(job_type, status, current_step, triggered_by)
  values ('incremental', 'pending', 'queued_by_cron', null)
  returning * into new_job;

  return jsonb_build_object(
    'jobId', new_job.job_id,
    'status', new_job.status,
    'created', true,
    'message', 'Sincronizacao comercial criada pelo cron.'
  );
end;
$$;

create or replace function start_marketing_current_month_cron_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_job bitrix_sync_jobs%rowtype;
  new_job bitrix_sync_jobs%rowtype;
  current_month_start text;
  next_month_start text;
begin
  select * into existing_job
  from bitrix_sync_jobs
  where status in ('pending', 'running')
    and job_type = 'marketing'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'jobId', existing_job.job_id,
      'status', existing_job.status,
      'created', false,
      'message', 'Ja existe uma sincronizacao de Marketing em andamento.'
    );
  end if;

  current_month_start :=
    to_char(date_trunc('month', timezone('America/Sao_Paulo', now())), 'YYYY-MM-DD') || 'T00:00:00-03:00';
  next_month_start :=
    to_char(date_trunc('month', timezone('America/Sao_Paulo', now())) + interval '1 month', 'YYYY-MM-DD') || 'T00:00:00-03:00';

  insert into bitrix_sync_jobs(job_type, status, current_step, triggered_by, cursor)
  values (
    'marketing',
    'pending',
    'queued_by_cron',
    null,
    jsonb_build_object(
      'marketingNextMonth', current_month_start,
      'syncEndExclusive', next_month_start,
      'mode', 'current_month_cron'
    )
  )
  returning * into new_job;

  return jsonb_build_object(
    'jobId', new_job.job_id,
    'status', new_job.status,
    'created', true,
    'message', 'Sincronizacao de Marketing do mes atual criada pelo cron.',
    'marketingNextMonth', current_month_start
  );
end;
$$;

create or replace function invoke_edge_function(function_name text, timeout_ms int default 55000)
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  base_url text;
  service_role_key text;
  request_id bigint;
begin
  base_url := rtrim(psc_secret('psc_supabase_url'), '/');
  service_role_key := psc_secret('psc_service_role_key');

  if base_url is null or service_role_key is null then
    raise exception 'Missing Vault secrets psc_supabase_url and/or psc_service_role_key.';
  end if;

  select net.http_post(
    url := base_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_role_key,
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := timeout_ms
  )
  into request_id;

  return request_id;
end;
$$;

create or replace function run_commercial_sync_cron()
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
  request_id := invoke_edge_function('commercial-sync', 180000);
  return start_result || jsonb_build_object('requestId', request_id);
end;
$$;

create or replace function run_marketing_sync_cron()
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
  request_id := invoke_edge_function('marketing-sync');
  return start_result || jsonb_build_object('requestId', request_id);
end;
$$;

select cron.unschedule('psc-commercial-sync-08-18-brt')
where exists (
  select 1
  from cron.job
  where jobname = 'psc-commercial-sync-08-18-brt'
);

select cron.unschedule('psc-marketing-sync-08-18-brt')
where exists (
  select 1
  from cron.job
  where jobname = 'psc-marketing-sync-08-18-brt'
);

select cron.schedule(
  'psc-commercial-sync-08-18-brt',
  '0 11,21 * * *',
  $$select run_commercial_sync_cron();$$
);

select cron.schedule(
  'psc-marketing-sync-08-18-brt',
  '5 11,21 * * *',
  $$select run_marketing_sync_cron();$$
);

-- Check scheduled jobs:
-- select jobid, jobname, schedule, command, active from cron.job where jobname like 'psc-%sync-08-18-brt';
--
-- Check HTTP invocation results:
-- select * from net._http_response order by created desc limit 20;
-- If your pg_net version uses a different timestamp column, use:
-- select * from net._http_response order by id desc limit 20;
