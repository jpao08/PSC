-- Commercial Drill Down for Bitrix24 CRM.
-- Vercel-safe design: PSC clients read pre-calculated Supabase data and never call Bitrix24.

create extension if not exists pgcrypto;

create table if not exists bitrix_crm_deals (
  bitrix_deal_id text primary key,
  title text not null,
  category_id int not null,
  stage_id text not null,
  stage_semantic_id text not null,
  assigned_by_id text null,
  opportunity numeric(18,2) null,
  currency_id text not null default 'BRL',
  created_time timestamptz null,
  updated_time timestamptz null,
  moved_time timestamptz null,
  closed boolean not null default false,
  is_deleted boolean not null default false,
  last_seen_at timestamptz null,
  synced_at timestamptz not null default now()
);

create table if not exists bitrix_crm_users (
  bitrix_user_id text primary key,
  full_name text not null,
  email text null,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists bitrix_crm_stages (
  stage_id text not null,
  category_id int not null,
  name text not null,
  sort_order int null,
  semantic_id text not null,
  active boolean not null default true,
  synced_at timestamptz not null default now(),
  primary key (stage_id, category_id)
);

create table if not exists bitrix_crm_stage_history (
  bitrix_history_id text primary key,
  bitrix_deal_id text not null references bitrix_crm_deals(bitrix_deal_id) on delete cascade,
  movement_type text null,
  category_id int not null,
  stage_id text not null,
  stage_semantic_id text not null,
  entered_at timestamptz not null,
  imported_at timestamptz not null default now()
);

create table if not exists bitrix_crm_deal_snapshots (
  snapshot_date date not null,
  bitrix_deal_id text not null references bitrix_crm_deals(bitrix_deal_id) on delete cascade,
  category_id int not null,
  stage_id text not null,
  stage_semantic_id text not null,
  assigned_by_id text null,
  opportunity numeric(18,2) null,
  currency_id text not null default 'BRL',
  captured_at timestamptz not null default now(),
  primary key (snapshot_date, bitrix_deal_id)
);

create table if not exists bitrix_crm_deal_cycles (
  cycle_id uuid primary key default gen_random_uuid(),
  bitrix_deal_id text not null references bitrix_crm_deals(bitrix_deal_id) on delete cascade,
  cycle_number int not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  start_reason text not null,
  end_reason text null,
  unique (bitrix_deal_id, cycle_number)
);

create table if not exists commercial_drilldown_config (
  config_key text primary key,
  config_value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists commercial_drilldown_monthly (
  id uuid primary key default gen_random_uuid(),
  reference_year int not null check (reference_year >= 2026),
  reference_month int not null check (reference_month between 1 and 12),
  metric_key text not null,
  responsible_id text null,
  quantity_value numeric(18,2) null,
  monetary_value numeric(18,2) null,
  currency_id text not null default 'BRL',
  calculated_at timestamptz not null default now()
);

create table if not exists commercial_drilldown_items (
  id uuid primary key default gen_random_uuid(),
  reference_year int not null check (reference_year >= 2026),
  reference_month int not null check (reference_month between 1 and 12),
  metric_key text not null,
  responsible_id text null,
  bitrix_deal_id text not null references bitrix_crm_deals(bitrix_deal_id) on delete cascade,
  cycle_id uuid null references bitrix_crm_deal_cycles(cycle_id) on delete set null,
  event_date timestamptz null,
  reference_date timestamptz null,
  stage_id text null,
  quantity_contribution numeric(18,2) null,
  monetary_contribution numeric(18,2) null,
  created_at timestamptz not null default now()
);

create table if not exists bitrix_sync_jobs (
  job_id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz null,
  finished_at timestamptz null,
  cursor jsonb null,
  current_step text null,
  processed_records int not null default 0,
  total_records int null,
  error_message text null,
  triggered_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_bitrix_sync_jobs_active
  on bitrix_sync_jobs ((true))
  where status in ('pending', 'running');

create unique index if not exists ux_commercial_monthly_cell
  on commercial_drilldown_monthly(
    reference_year,
    reference_month,
    metric_key,
    coalesce(responsible_id, '__none__')
  );
create unique index if not exists ux_commercial_items_deal_cycle
  on commercial_drilldown_items(
    reference_year,
    reference_month,
    metric_key,
    coalesce(responsible_id, '__none__'),
    bitrix_deal_id,
    coalesce(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists idx_commercial_monthly_year_metric
  on commercial_drilldown_monthly(reference_year, metric_key);
create index if not exists idx_commercial_items_lookup
  on commercial_drilldown_items(reference_year, reference_month, metric_key, responsible_id);
create index if not exists idx_bitrix_stage_history_deal_entered
  on bitrix_crm_stage_history(bitrix_deal_id, entered_at);
create index if not exists idx_bitrix_deal_snapshots_date
  on bitrix_crm_deal_snapshots(snapshot_date);
create index if not exists idx_bitrix_sync_jobs_status_created
  on bitrix_sync_jobs(status, created_at desc);

insert into commercial_drilldown_config(config_key, config_value)
values
  ('timezone', '"America/Sao_Paulo"'::jsonb),
  ('category_id', '0'::jsonb),
  ('bitrix_deal_url_template', '"https://tdsustentavel.bitrix24.com.br/crm/deal/details/{ID}/"'::jsonb),
  ('metrics', '[
    {"metricKey":"initial_meetings","label":"Reuniões Iniciais Agendadas","kind":"flow","unit":"quantity"},
    {"metricKey":"presented_proposals","label":"Propostas Apresentadas","kind":"flow","unit":"quantity"},
    {"metricKey":"initial_pipe","label":"Pipe Inicial","kind":"stock","unit":"quantity"},
    {"metricKey":"semi_qualified_pipeline","label":"Pipeline Semi Qualificado","kind":"stock","unit":"money"},
    {"metricKey":"qualified_pipe","label":"Pipe Qualificado","kind":"stock","unit":"money"},
    {"metricKey":"closed_contracts","label":"Contratos Fechados","kind":"flow","unit":"money"},
    {"metricKey":"total_cards","label":"Total de Cards","kind":"stock","unit":"quantity"}
  ]'::jsonb),
  ('stage_groups', '{
    "initial_pipe":["9","6","8","7","UC_83I1JS","4","10","NEW","11","5"],
    "semi_qualified_pipeline":["PREPARATION","12","3","13"],
    "qualified_pipe":["UC_AUIF39","14","15","16","1","17"],
    "closed_contracts":["WON"],
    "total_cards_extra":["UC_99GOPG"]
  }'::jsonb)
on conflict (config_key) do update
set config_value = excluded.config_value,
    updated_at = now();

create or replace function commercial_metric_catalog()
returns table(metric_key text, label text, kind text, unit text)
language sql
stable
as $$
  select
    item->>'metricKey',
    item->>'label',
    item->>'kind',
    item->>'unit'
  from jsonb_array_elements(
    (select config_value from commercial_drilldown_config where config_key = 'metrics')
  ) item;
$$;

create or replace function get_commercial_sync_status()
returns jsonb
language sql
stable
as $$
  with latest_success as (
    select * from bitrix_sync_jobs
    where status = 'completed'
    order by finished_at desc nulls last, created_at desc
    limit 1
  ),
  active_job as (
    select * from bitrix_sync_jobs
    where status in ('pending', 'running')
    order by created_at desc
    limit 1
  ),
  latest_failure as (
    select * from bitrix_sync_jobs
    where status = 'failed'
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

create or replace function start_commercial_sync(triggered_by_user_id uuid)
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
      'message', 'Já existe uma sincronização em andamento.'
    );
  end if;

  insert into bitrix_sync_jobs(job_type, status, current_step, triggered_by)
  values ('incremental', 'pending', 'queued', triggered_by_user_id)
  returning * into new_job;

  return jsonb_build_object(
    'jobId', new_job.job_id,
    'status', new_job.status,
    'created', true,
    'message', 'Sincronização criada.'
  );
end;
$$;

create or replace function get_commercial_drilldown_dashboard(target_year int)
returns jsonb
language sql
stable
as $$
  with params as (
    select
      greatest(target_year, 2026) as year,
      case
        when target_year = extract(year from timezone('America/Sao_Paulo', now()))::int
          then extract(month from timezone('America/Sao_Paulo', now()))::int
        when target_year < extract(year from timezone('America/Sao_Paulo', now()))::int
          then 12
        else 0
      end as month_limit
  ),
  metrics as (
    select * from commercial_metric_catalog()
  ),
  responsibles as (
    select
      m.responsible_id,
      coalesce(u.full_name, case when m.responsible_id is null then 'Sem responsável' else m.responsible_id end) as name,
      coalesce(u.active, true) as active
    from commercial_drilldown_monthly m
    left join bitrix_crm_users u on u.bitrix_user_id = m.responsible_id
    cross join params p
    where m.reference_year = p.year
      and coalesce(m.quantity_value, m.monetary_value, 0) <> 0
    group by m.responsible_id, u.full_name, u.active
  ),
  ordered_responsibles as (
    select * from responsibles
    order by case when responsible_id is null then 1 else 0 end, name
  ),
  rows_by_metric as (
    select
      metric_key,
      jsonb_agg(
        jsonb_build_object(
          'responsibleId', responsible_id,
          'responsibleName', name,
          'responsibleActive', active,
          'months', (
            select jsonb_object_agg(month_number::text, value)
            from (
              select
                gs.month_number,
                case
                  when gs.month_number > (select month_limit from params) then null
                  when mx.unit = 'money' then cm.monetary_value
                  else cm.quantity_value
                end as value
              from generate_series(1, 12) as gs(month_number)
              left join commercial_drilldown_monthly cm
                on cm.reference_year = (select year from params)
               and cm.reference_month = gs.month_number
               and cm.metric_key = mx.metric_key
               and cm.responsible_id is not distinct from ordered_responsibles.responsible_id
            ) month_values
          ),
          'annualSummary', (
            select case
              when mx.kind = 'flow' then sum(value)
              else avg(value)
            end
            from (
              select case when mx.unit = 'money' then cm.monetary_value else cm.quantity_value end as value
              from commercial_drilldown_monthly cm
              where cm.reference_year = (select year from params)
                and cm.reference_month <= (select month_limit from params)
                and cm.metric_key = mx.metric_key
                and cm.responsible_id is not distinct from ordered_responsibles.responsible_id
            ) annual_values
          )
        )
      ) as rows
    from metrics mx
    cross join ordered_responsibles
    group by metric_key
  ),
  totals_by_metric as (
    select
      mx.metric_key,
      jsonb_build_object(
        'responsibleId', null,
        'responsibleName', 'Total',
        'responsibleActive', true,
        'isTotal', true,
        'months', (
          select jsonb_object_agg(month_number::text, value)
          from (
            select
              gs.month_number,
              case
                when gs.month_number > (select month_limit from params) then null
                when mx.unit = 'money' then sum(cm.monetary_value)
                else sum(cm.quantity_value)
              end as value
            from generate_series(1, 12) as gs(month_number)
            left join commercial_drilldown_monthly cm
              on cm.reference_year = (select year from params)
             and cm.reference_month = gs.month_number
             and cm.metric_key = mx.metric_key
            group by gs.month_number
          ) month_values
        ),
        'annualSummary', (
          select case
            when mx.kind = 'flow' then sum(value)
            else avg(value)
          end
          from (
            select case when mx.unit = 'money' then sum(cm.monetary_value) else sum(cm.quantity_value) end as value
            from generate_series(1, (select month_limit from params)) as gs(month_number)
            left join commercial_drilldown_monthly cm
              on cm.reference_year = (select year from params)
             and cm.reference_month = gs.month_number
             and cm.metric_key = mx.metric_key
            group by gs.month_number
          ) annual_values
        )
      ) as total_row
    from metrics mx
    group by mx.metric_key, mx.kind, mx.unit
  )
  select jsonb_build_object(
    'year', (select year from params),
    'months', jsonb_build_array(1,2,3,4,5,6,7,8,9,10,11,12),
    'responsibles', coalesce((select jsonb_agg(jsonb_build_object(
      'responsibleId', responsible_id,
      'responsibleName', name,
      'active', active
    )) from ordered_responsibles), '[]'::jsonb),
    'metrics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'metricKey', mx.metric_key,
        'label', mx.label,
        'kind', mx.kind,
        'unit', mx.unit,
        'summaryLabel', case when mx.kind = 'flow' then 'Total anual' else 'Média mensal' end,
        'rows', coalesce(rm.rows, '[]'::jsonb) || jsonb_build_array(tb.total_row)
      ))
      from metrics mx
      left join rows_by_metric rm on rm.metric_key = mx.metric_key
      left join totals_by_metric tb on tb.metric_key = mx.metric_key
    ), '[]'::jsonb),
    'lastSuccessfulSyncAt', get_commercial_sync_status()->'lastSuccessfulSyncAt',
    'activeJob', get_commercial_sync_status()->'activeJob'
  );
$$;

create or replace function get_commercial_drilldown_items(
  target_year int,
  target_month int,
  target_metric_key text,
  target_responsible_id text default null,
  q text default null,
  page int default 1,
  page_size int default 25,
  sort text default 'date_desc'
)
returns jsonb
language sql
stable
as $$
  with filtered as (
    select
      i.*,
      d.title,
      coalesce(u.full_name, case when i.responsible_id is null then 'Sem responsável' else i.responsible_id end) as responsible_name,
      coalesce(u.active, true) as responsible_active,
      coalesce(s.name, i.stage_id) as stage_name,
      d.opportunity,
      d.currency_id
    from commercial_drilldown_items i
    left join bitrix_crm_deals d on d.bitrix_deal_id = i.bitrix_deal_id
    left join bitrix_crm_users u on u.bitrix_user_id = i.responsible_id
    left join bitrix_crm_stages s on s.stage_id = i.stage_id and s.category_id = d.category_id
    where i.reference_year = greatest(target_year, 2026)
      and i.reference_month = target_month
      and i.metric_key = target_metric_key
      and (
        target_responsible_id is null
        or (target_responsible_id = '__none__' and i.responsible_id is null)
        or i.responsible_id = target_responsible_id
      )
      and (
        q is null or btrim(q) = ''
        or i.bitrix_deal_id ilike '%' || btrim(q) || '%'
        or d.title ilike '%' || btrim(q) || '%'
      )
  ),
  counted as (
    select count(*) as total_count from filtered
  ),
  paged as (
    select *
    from filtered
    order by
      case when sort = 'date_asc' then coalesce(event_date, reference_date) end asc nulls last,
      case when sort <> 'date_asc' then coalesce(event_date, reference_date) end desc nulls last,
      bitrix_deal_id
    limit least(greatest(page_size, 1), 100)
    offset (greatest(page, 1) - 1) * least(greatest(page_size, 1), 100)
  )
  select jsonb_build_object(
    'year', greatest(target_year, 2026),
    'month', target_month,
    'metricKey', target_metric_key,
    'responsibleId', target_responsible_id,
    'page', greatest(page, 1),
    'pageSize', least(greatest(page_size, 1), 100),
    'totalItems', (select total_count from counted),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'dealId', bitrix_deal_id,
      'title', title,
      'responsibleId', responsible_id,
      'responsibleName', responsible_name,
      'responsibleStatus', case when responsible_active then 'active' else 'inactive' end,
      'stageId', stage_id,
      'stageName', stage_name,
      'eventDate', event_date,
      'referenceDate', reference_date,
      'quantityContribution', quantity_contribution,
      'monetaryContribution', monetary_contribution,
      'opportunity', opportunity,
      'currencyId', currency_id,
      'bitrixUrl', replace((select config_value #>> '{}' from commercial_drilldown_config where config_key = 'bitrix_deal_url_template'), '{ID}', bitrix_deal_id)
    )), '[]'::jsonb)
  )
  from paged;
$$;
