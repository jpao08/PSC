-- Marketing Drill Down by channel.
-- Vercel reads materialized Supabase data; Bitrix synchronization runs outside Vercel.
-- This script is idempotent.

create table if not exists marketing_drilldown_config (
  config_key text primary key,
  config_value jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_marketing_drilldown_config_updated_at on marketing_drilldown_config;
create trigger trg_marketing_drilldown_config_updated_at
before update on marketing_drilldown_config
for each row execute function set_updated_at();

create table if not exists bitrix_marketing_deals (
  bitrix_deal_id text primary key,
  category_id int not null,
  title text null,
  stage_id text null,
  stage_semantic_id text null,
  channel text not null default 'Outros',
  source_channel text null,
  assigned_by_id text null,
  created_time timestamptz null,
  updated_time timestamptz null,
  moved_time timestamptz null,
  synced_at timestamptz not null default now()
);

create table if not exists bitrix_marketing_stage_history (
  bitrix_history_id text primary key,
  bitrix_deal_id text not null references bitrix_marketing_deals(bitrix_deal_id) on delete cascade,
  category_id int not null,
  stage_id text not null,
  stage_semantic_id text null,
  entered_at timestamptz not null,
  imported_at timestamptz not null default now()
);

create table if not exists marketing_drilldown_monthly (
  id uuid primary key default gen_random_uuid(),
  reference_year int not null check (reference_year >= 2026),
  reference_month int not null check (reference_month between 1 and 12),
  metric_key text not null,
  channel text not null default 'Outros',
  quantity_value numeric(18,2) null,
  percentage_value numeric(18,4) null,
  numerator_value numeric(18,2) null,
  denominator_value numeric(18,2) null,
  calculated_at timestamptz not null default now()
);

create table if not exists marketing_drilldown_items (
  id uuid primary key default gen_random_uuid(),
  reference_year int not null check (reference_year >= 2026),
  reference_month int not null check (reference_month between 1 and 12),
  metric_key text not null,
  channel text not null default 'Outros',
  bitrix_deal_id text not null references bitrix_marketing_deals(bitrix_deal_id) on delete cascade,
  category_id int not null,
  event_date timestamptz null,
  stage_id text null,
  quantity_contribution numeric(18,2) null,
  numerator_contribution numeric(18,2) null,
  denominator_contribution numeric(18,2) null,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_marketing_monthly_cell
  on marketing_drilldown_monthly(reference_year, reference_month, metric_key, channel);
create unique index if not exists ux_marketing_items_deal_metric
  on marketing_drilldown_items(
    reference_year,
    reference_month,
    metric_key,
    channel,
    bitrix_deal_id,
    coalesce(stage_id, '__none__'),
    coalesce(event_date, '1900-01-01'::timestamptz)
  );
create index if not exists idx_marketing_monthly_year_metric
  on marketing_drilldown_monthly(reference_year, metric_key);
create index if not exists idx_marketing_items_lookup
  on marketing_drilldown_items(reference_year, reference_month, metric_key, channel);
create index if not exists idx_bitrix_marketing_history_deal_entered
  on bitrix_marketing_stage_history(bitrix_deal_id, entered_at);

insert into marketing_drilldown_config(config_key, config_value)
values
  ('marketing_area_id', '"728d3cfa-3770-4882-83ae-a8a1ed86663e"'::jsonb),
  ('timezone', '"America/Sao_Paulo"'::jsonb),
  ('source_category_id', '95'::jsonb),
  ('commercial_category_id', '0'::jsonb),
  ('bitrix_deal_url_template', '"https://tdsustentavel.bitrix24.com.br/crm/deal/details/{ID}/"'::jsonb),
  ('metrics', '[
    {"metricKey":"leads_generated","label":"Leads Gerados","indicatorName":"Leads Gerados","kind":"flow","unit":"quantity"},
    {"metricKey":"conversion_rate","label":"Taxa de Conversao","indicatorName":"Taxa de Conversao","kind":"ratio","unit":"percentage"},
    {"metricKey":"scheduled_meetings","label":"Reunioes Agendadas","indicatorName":"Reunioes Agendadas","kind":"flow","unit":"quantity"}
  ]'::jsonb),
  ('stage_names', '{
    "scheduled_meetings":["Reunião Agendada","Reuniao Agendada","Reuniões Agendadas","Reunioes Agendadas"],
    "initial_meeting":["Reunião Inicial","Reuniao Inicial"]
  }'::jsonb)
on conflict (config_key) do update
set config_value = excluded.config_value,
    updated_at = now();

create or replace function get_marketing_sync_status()
returns jsonb
language sql
stable
as $$
  with latest_success as (
    select * from bitrix_sync_jobs
    where status = 'completed'
      and job_type = 'marketing'
    order by finished_at desc nulls last, created_at desc
    limit 1
  ),
  active_job as (
    select * from bitrix_sync_jobs
    where status in ('pending', 'running')
      and job_type = 'marketing'
    order by created_at desc
    limit 1
  ),
  latest_failure as (
    select * from bitrix_sync_jobs
    where status = 'failed'
      and job_type = 'marketing'
    order by finished_at desc nulls last, created_at desc
    limit 1
  )
  select jsonb_build_object(
    'lastSuccessfulSyncAt', (select finished_at from latest_success),
    'activeJob', (
      select case when job_id is null then null else jsonb_build_object(
        'jobId', job_id,
        'jobType', job_type,
        'status', status,
        'startedAt', started_at,
        'currentStep', current_step,
        'processedRecords', processed_records,
        'totalRecords', total_records,
        'createdAt', created_at,
        'updatedAt', updated_at
      ) end
      from active_job
    ),
    'lastFailure', (
      select case when job_id is null then null else jsonb_build_object(
        'jobId', job_id,
        'finishedAt', finished_at,
        'errorMessage', error_message
      ) end
      from latest_failure
    )
  );
$$;

create or replace function start_marketing_sync(triggered_by_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  existing_job bitrix_sync_jobs%rowtype;
  new_job bitrix_sync_jobs%rowtype;
begin
  select * into existing_job
  from bitrix_sync_jobs
  where status in ('pending', 'running')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'jobId', existing_job.job_id,
      'status', existing_job.status,
      'created', false,
      'message', 'Ja existe uma sincronizacao em andamento.'
    );
  end if;

  insert into bitrix_sync_jobs(job_type, status, current_step, triggered_by)
  values ('marketing', 'pending', 'queued', triggered_by_user_id)
  returning * into new_job;

  return jsonb_build_object(
    'jobId', new_job.job_id,
    'status', new_job.status,
    'created', true,
    'message', 'Sincronizacao de Marketing criada.'
  );
end;
$$;
