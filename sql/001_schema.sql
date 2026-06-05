create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists roles (
  code text primary key,
  name text not null unique,
  description text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into roles (code, name, description, is_active)
values
  (
    'gestor_area',
    'Gestor de Area',
    'Usuario com visao e manutencao de indicadores da propria area.',
    true
  ),
  (
    'executivo',
    'Executivo',
    'Usuario com visao global e permissoes de cadastro e plano de acao.',
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null references roles(code),
  area_id uuid null references areas(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists indicators (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id),
  name text not null,
  description text null,
  aggregation_type text not null check (aggregation_type in ('sum', 'avg')),
  unit text null,
  is_active boolean not null default true,
  created_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists indicator_values (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id),
  year int not null,
  month int not null check (month between 1 and 12),
  week_number int not null check (week_number between 1 and 6),
  value numeric not null,
  source_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(indicator_id, year, month, week_number)
);

create table if not exists indicator_value_history (
  id uuid primary key default gen_random_uuid(),
  indicator_value_id uuid null references indicator_values(id),
  indicator_id uuid not null references indicators(id),
  year int not null,
  month int not null check (month between 1 and 12),
  week_number int not null check (week_number between 1 and 6),
  previous_value numeric not null,
  new_value numeric not null,
  changed_by uuid not null references users(id),
  changed_at timestamptz not null default now()
);

create table if not exists action_plans (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id),
  title text not null,
  problem_description text not null,
  expected_action text not null,
  bitrix_responsible_id text null,
  responsible_name text not null,
  responsible_email text null,
  due_date date null,
  bitrix_task_id text null,
  status text not null default 'created',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists action_plan_history (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid not null references action_plans(id),
  event_type text not null,
  event_description text not null,
  created_by uuid null references users(id),
  created_at timestamptz not null default now()
);

drop trigger if exists trg_indicators_updated_at on indicators;
create trigger trg_indicators_updated_at
before update on indicators
for each row execute function set_updated_at();

drop trigger if exists trg_indicator_values_updated_at on indicator_values;
create trigger trg_indicator_values_updated_at
before update on indicator_values
for each row execute function set_updated_at();

drop trigger if exists trg_action_plans_updated_at on action_plans;
create trigger trg_action_plans_updated_at
before update on action_plans
for each row execute function set_updated_at();

create index if not exists idx_indicators_area_id on indicators(area_id);
create index if not exists idx_users_role on users(role);
create index if not exists idx_indicator_values_indicator_year_month
  on indicator_values(indicator_id, year, month);
create index if not exists idx_indicator_value_history_lookup
  on indicator_value_history(indicator_id, year, month, week_number, changed_at desc);
create index if not exists idx_action_plans_indicator_id on action_plans(indicator_id);
create index if not exists idx_action_plans_bitrix_responsible_id
  on action_plans(bitrix_responsible_id);
