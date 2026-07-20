-- Roles, annual indicator planning and simplified Wins compatibility.
-- This script is idempotent and preserves existing historical data.

insert into roles (code, name, description, is_active)
values
  ('gestor_tatico', 'Gestor Tatico', 'Gestor tatico com acesso por area.', true),
  ('gestor_operacional', 'Gestor Operacional', 'Gestor operacional com acesso por area.', true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

create table if not exists indicator_year_planning (
  indicator_id uuid not null references indicators(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  annual_target numeric null,
  confidence_level numeric(5,2) null check (
    confidence_level is null or (confidence_level >= 0 and confidence_level <= 100)
  ),
  created_by uuid null references users(id),
  updated_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (indicator_id, year)
);

drop trigger if exists trg_indicator_year_planning_updated_at on indicator_year_planning;
create trigger trg_indicator_year_planning_updated_at
before update on indicator_year_planning
for each row execute function set_updated_at();

create index if not exists idx_indicator_year_planning_year
  on indicator_year_planning(year);

-- Keep GUT columns as legacy storage, but allow new simplified Wins to be inserted
-- by clients that no longer ask users for G/U/T.
alter table wins
  alter column requester_gravity set default 1,
  alter column requester_urgency set default 1,
  alter column requester_tendency set default 1,
  alter column ocorrencia set default '',
  alter column identificacao_causa set default '',
  alter column proposta_solucao set default '';
