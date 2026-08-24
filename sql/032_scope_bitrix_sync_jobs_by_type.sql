-- Scope Bitrix sync jobs by job_type so Commercial, Marketing and future syncs do not block each other.
-- This script is idempotent.

drop index if exists ux_bitrix_sync_jobs_active;

create unique index if not exists ux_bitrix_sync_jobs_active_by_type
  on bitrix_sync_jobs(job_type)
  where status in ('pending', 'running');

create index if not exists idx_bitrix_sync_jobs_type_status_created
  on bitrix_sync_jobs(job_type, status, created_at desc);

create or replace function get_commercial_sync_status()
returns jsonb
language sql
stable
as $$
  with latest_success as (
    select * from bitrix_sync_jobs
    where status = 'completed'
      and job_type = 'incremental'
    order by finished_at desc nulls last, created_at desc
    limit 1
  ),
  active_job as (
    select * from bitrix_sync_jobs
    where status in ('pending', 'running')
      and job_type = 'incremental'
    order by created_at desc
    limit 1
  ),
  latest_failure as (
    select * from bitrix_sync_jobs
    where status = 'failed'
      and job_type = 'incremental'
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
  values ('incremental', 'pending', 'queued', triggered_by_user_id)
  returning * into new_job;

  return jsonb_build_object(
    'jobId', new_job.job_id,
    'status', new_job.status,
    'created', true,
    'message', 'Sincronizacao comercial criada.'
  );
end;
$$;

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
