-- Marketing Drill Down: CRM 95 + CRM 125 rules.
-- Keeps client-facing indicator names unchanged.
-- This script is idempotent and should be applied after 031 and 032.

insert into marketing_drilldown_config(config_key, config_value)
values
  ('source_category_id', '95'::jsonb),
  ('outbound_category_id', '125'::jsonb),
  ('crm95_channel_field', '"sourceId"'::jsonb),
  ('created_since', '"2026-01-01T00:00:00-03:00"'::jsonb),
  ('sync_mode', '"monthly_cursor"'::jsonb),
  ('won_detection', '{
    "stageSemanticId":"S",
    "stageIdSuffix":":WON",
    "fallbackDateField":"movedTime"
  }'::jsonb),
  ('channel_rules', '{
    "crm125":"OUTBOUND",
    "crm95":{
      "siteLikeSources":["SITE","WEBFORM","WEB FORM","TD GROWTH"],
      "siteLikeTitleTags":{
        "[META]":"META ADS",
        "[SEO]":"SEO"
      },
      "sourceMappings":{
        "GOOGLE ADS":"GOOGLE ADS",
        "PARCEIRO COMERCIAL T&D":"PARCEIROS COMERCIAIS",
        "PARCEIRO COMERCIAL TD":"PARCEIROS COMERCIAIS"
      },
      "emptyFallback":"Outros"
    }
  }'::jsonb),
  ('metrics', '[
    {"metricKey":"leads_generated","label":"Leads Gerados","indicatorName":"Leads Gerados","kind":"flow","unit":"quantity"},
    {"metricKey":"conversion_rate","label":"Taxa de Conversao","indicatorName":"Taxa de Conversao","kind":"ratio","unit":"percentage"},
    {"metricKey":"scheduled_meetings","label":"Reunioes Agendadas","indicatorName":"Reunioes Agendadas","kind":"flow","unit":"quantity"}
  ]'::jsonb)
on conflict (config_key) do update
set config_value = excluded.config_value,
    updated_at = now();

-- Legacy CRM 0/stage-name settings are no longer used by the Marketing Edge Function.
delete from marketing_drilldown_config
where config_key in ('commercial_category_id', 'stage_names', 'deals_lookback_since');

-- Operational helper: cancel stuck sync jobs by type without touching completed history.
create or replace function cancel_running_bitrix_sync_jobs(
  target_job_type text,
  cancel_reason text default 'Sincronizacao cancelada manualmente.'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  affected_count int;
begin
  update bitrix_sync_jobs
  set status = 'cancelled',
      current_step = 'cancelled_manually',
      finished_at = now(),
      updated_at = now(),
      error_message = cancel_reason
  where job_type = target_job_type
    and status in ('pending', 'running');

  get diagnostics affected_count = row_count;

  return jsonb_build_object(
    'jobType', target_job_type,
    'cancelledJobs', affected_count,
    'message', cancel_reason
  );
end;
$$;

-- Standard manual commands:
-- select cancel_running_bitrix_sync_jobs('marketing');
-- select cancel_running_bitrix_sync_jobs('incremental');
-- select cancel_running_bitrix_sync_jobs('full');
--
-- Marketing sync now advances one month per Edge Function POST.
-- Keep calling POST while the latest marketing job status is 'running'.

-- Standard Marketing verification query:
-- select metric_key, reference_year, reference_month, channel,
--        quantity_value, numerator_value, denominator_value, percentage_value
-- from marketing_drilldown_monthly
-- where reference_year = 2026
-- order by reference_month, metric_key, channel;
