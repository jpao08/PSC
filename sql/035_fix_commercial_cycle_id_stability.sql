-- Commercial Drill Down: make cycle_id updates safe.
-- The Edge Function now generates deterministic cycle UUIDs from deal_id + cycle_number.
-- This FK needs ON UPDATE CASCADE so existing random UUIDs can be replaced once without
-- failing while old drilldown items still reference them.

alter table commercial_drilldown_items
  drop constraint if exists commercial_drilldown_items_cycle_id_fkey;

alter table commercial_drilldown_items
  add constraint commercial_drilldown_items_cycle_id_fkey
  foreign key (cycle_id)
  references bitrix_crm_deal_cycles(cycle_id)
  on update cascade
  on delete set null;

-- Standard recovery sequence after deploying commercial-sync:
-- select cancel_running_bitrix_sync_jobs('incremental');
-- select run_commercial_sync_cron();
--
-- Verify:
-- select job_id, job_type, status, current_step, processed_records, total_records,
--        cursor, error_message, created_at, updated_at
-- from bitrix_sync_jobs
-- where job_type = 'incremental'
-- order by created_at desc
-- limit 10;
