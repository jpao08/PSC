-- Wins and indicator maturity permission.
-- This script is idempotent.

create extension if not exists "pgcrypto";

alter table users
  add column if not exists can_edit_indicator_maturity boolean not null default false;

create index if not exists idx_users_can_edit_indicator_maturity
  on users (can_edit_indicator_maturity);

create table if not exists win_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text null,
  is_active boolean not null default true,
  created_by uuid null references users(id),
  updated_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint win_tags_name_non_empty check (btrim(name) <> ''),
  constraint win_tags_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists ux_win_tags_active_name
  on win_tags (lower(name))
  where is_active = true;

drop trigger if exists trg_win_tags_updated_at on win_tags;
create trigger trg_win_tags_updated_at
before update on win_tags
for each row execute function set_updated_at();

create table if not exists wins (
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
  ocorrencia text not null,
  identificacao_causa text not null,
  proposta_solucao text not null,
  status text not null default 'Nao Iniciada'
    check (status in (
      'Concluido',
      'Concluído',
      'Em atendimento',
      'Em Planejamento',
      'Delegada',
      'Recusada',
      'Nao Iniciada',
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

drop trigger if exists trg_wins_updated_at on wins;
create trigger trg_wins_updated_at
before update on wins
for each row execute function set_updated_at();

create index if not exists idx_wins_requester_id
  on wins(requester_id);

create index if not exists idx_wins_area_id
  on wins(area_id);

create index if not exists idx_wins_created_at
  on wins(created_at desc);

create index if not exists idx_wins_status_priority
  on wins(status, executive_priority_score desc, requester_priority_score desc);

create index if not exists idx_wins_is_deleted
  on wins(is_deleted);

create table if not exists win_report_tags (
  win_id uuid not null references wins(id) on delete cascade,
  tag_id uuid not null references win_tags(id) on delete cascade,
  created_by uuid null references users(id),
  created_at timestamptz not null default now(),
  primary key (win_id, tag_id)
);

create index if not exists idx_win_report_tags_tag_id
  on win_report_tags(tag_id);

create index if not exists idx_win_report_tags_win_id
  on win_report_tags(win_id);
