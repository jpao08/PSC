-- Add indicator maturity and Issue Reports.
-- This script is idempotent.

create extension if not exists "pgcrypto";

alter table indicators
  add column if not exists maturity_level numeric(5,2) null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'indicators_maturity_level_range'
  ) then
    alter table indicators
      add constraint indicators_maturity_level_range
      check (maturity_level is null or (maturity_level >= 0 and maturity_level <= 100));
  end if;
end $$;

alter table users
  add column if not exists can_use_issue_reports boolean not null default false;

create index if not exists idx_users_can_use_issue_reports
  on users(can_use_issue_reports);

create table if not exists issue_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  requester_id uuid not null references users(id),
  area_id uuid null references areas(id),
  is_other_area boolean not null default false,
  requester_gravity int not null check (requester_gravity between 1 and 5),
  requester_urgency int not null check (requester_urgency between 1 and 5),
  requester_tendency int not null check (requester_tendency between 1 and 5),
  requester_priority_score int generated always as
    (requester_gravity * requester_urgency * requester_tendency) stored,
  executive_gravity int null check (executive_gravity between 1 and 5),
  executive_urgency int null check (executive_urgency between 1 and 5),
  executive_tendency int null check (executive_tendency between 1 and 5),
  executive_priority_score int generated always as (
    case
      when executive_gravity is null
        or executive_urgency is null
        or executive_tendency is null
      then null
      else executive_gravity * executive_urgency * executive_tendency
    end
  ) stored,
  problem_description text not null,
  observed_impact text not null,
  attempted_solution text not null,
  requested_action text not null,
  status text not null default 'Não Iniciada'
    check (status in (
      'Concluído',
      'Em atendimento',
      'Em Planejamento',
      'Delegada',
      'Recusada',
      'Não Iniciada'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid null references users(id),
  reviewed_at timestamptz null,
  is_deleted boolean not null default false,
  deleted_at timestamptz null,
  deleted_by uuid null references users(id),
  check (
    (is_other_area = true and area_id is null)
    or (is_other_area = false and area_id is not null)
  )
);

alter table issue_reports
  add column if not exists is_deleted boolean not null default false;

alter table issue_reports
  add column if not exists deleted_at timestamptz null;

alter table issue_reports
  add column if not exists deleted_by uuid null references users(id);

drop trigger if exists trg_issue_reports_updated_at on issue_reports;
create trigger trg_issue_reports_updated_at
before update on issue_reports
for each row execute function set_updated_at();

create index if not exists idx_issue_reports_requester_id
  on issue_reports(requester_id);

create index if not exists idx_issue_reports_area_id
  on issue_reports(area_id);

create index if not exists idx_issue_reports_created_at
  on issue_reports(created_at desc);

create index if not exists idx_issue_reports_status_priority
  on issue_reports(status, executive_priority_score desc, requester_priority_score desc);

create index if not exists idx_issue_reports_is_deleted
  on issue_reports(is_deleted);
