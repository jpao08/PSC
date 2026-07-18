-- Add soft delete fields for Issue Reports.
-- Run this after 020_add_indicator_maturity_and_issue_reports.sql.
-- This script is idempotent.

do $$
begin
  if to_regclass('public.issue_reports') is null then
    raise exception 'Tabela issue_reports nao existe. Execute primeiro sql/020_add_indicator_maturity_and_issue_reports.sql.';
  end if;
end $$;

alter table issue_reports
  add column if not exists is_deleted boolean not null default false;

alter table issue_reports
  add column if not exists deleted_at timestamptz null;

alter table issue_reports
  add column if not exists deleted_by uuid null references users(id);

create index if not exists idx_issue_reports_is_deleted
  on issue_reports(is_deleted);
