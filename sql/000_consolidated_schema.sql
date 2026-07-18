-- PSC consolidated schema for new databases. Generated from sql/001..023 in order.


-- ============================================================
-- Source: 001_schema.sql
-- ============================================================

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
  can_edit_projected_value boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists user_area_access (
  user_id uuid not null references users(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, area_id)
);

create table if not exists indicators (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id),
  name text not null,
  description text null,
  aggregation_type text not null check (aggregation_type in ('sum', 'avg', 'latest')),
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
create index if not exists idx_users_can_edit_projected_value
  on users(can_edit_projected_value);
create index if not exists idx_user_area_access_user_id
  on user_area_access(user_id);
create index if not exists idx_user_area_access_area_id
  on user_area_access(area_id);
create index if not exists idx_indicator_values_indicator_year_month
  on indicator_values(indicator_id, year, month);
create index if not exists idx_indicator_value_history_lookup
  on indicator_value_history(indicator_id, year, month, week_number, changed_at desc);
create index if not exists idx_action_plans_indicator_id on action_plans(indicator_id);
create index if not exists idx_action_plans_bitrix_responsible_id
  on action_plans(bitrix_responsible_id);


-- ============================================================
-- Source: 002_seed_example.sql
-- ============================================================

-- Exemplo simples de carga inicial para homologacao do MVP.
-- Gere o hash da senha antes de executar:
-- .venv\Scripts\python.exe -c "from core.domain.rules import hash_password; print(hash_password('123456'))"

insert into areas (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'Operacoes'),
  ('22222222-2222-2222-2222-222222222222', 'Comercial')
on conflict (id) do nothing;

insert into users (id, email, password_hash, name, role, area_id, is_active)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'gestor@empresa.com',
    'COLE_AQUI_HASH_123456',
    'Gestor Operacoes',
    'gestor_area',
    '11111111-1111-1111-1111-111111111111',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'executivo@empresa.com',
    'COLE_AQUI_HASH_123456',
    'Executivo Geral',
    'executivo',
    null,
    true
  )
on conflict (id) do nothing;

insert into indicators (
  id,
  area_id,
  name,
  description,
  aggregation_type,
  unit,
  target_value,
  created_by,
  is_active
)
values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'Produtividade semanal',
    'Indicador de produtividade da area de operacoes',
    'avg',
    '%',
    95,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    true
  )
on conflict (id) do nothing;


-- ============================================================
-- Source: 003_add_indicator_value_history.sql
-- ============================================================

-- Migração para ambientes já existentes.
-- Garante histórico de alterações em valores semanais.

create extension if not exists "pgcrypto";

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

create index if not exists idx_indicator_value_history_lookup
  on indicator_value_history(indicator_id, year, month, week_number, changed_at desc);


-- ============================================================
-- Source: 004_scorecard_tnd_indicators.sql
-- ============================================================

-- Cadastro base do SCORECARD T&D
-- Este script pode ser executado mais de uma vez (idempotente).

with area_seed(name) as (
  values
    ('Financeiro'),
    ('Operacional'),
    ('Comercial'),
    ('Marketing'),
    ('RH'),
    ('Inteligencia Estrategica')
)
insert into areas (name)
select name from area_seed
on conflict (name) do nothing;

with indicator_seed(area_name, name, description, aggregation_type, unit, target_value) as (
  values
    ('Financeiro', 'Saldo em Caixa', 'Saldo de caixa no periodo', 'avg', 'R$', null::numeric),
    ('Financeiro', 'Runway', 'Meses de operacao suportados pelo caixa', 'avg', 'Meses', null),
    ('Financeiro', 'Faturamento', 'Receita bruta no periodo', 'sum', 'R$', null),
    ('Financeiro', 'Margem Bruta', 'Margem bruta percentual', 'avg', '%', null),
    ('Financeiro', 'EBITDA', 'Resultado operacional antes de juros, impostos, depreciacao e amortizacao', 'sum', 'R$', null),
    ('Financeiro', 'Fluxo de Caixa Livre', 'Fluxo de caixa livre no periodo', 'sum', 'R$', null),

    ('Operacional', 'Aging', 'Valor em aging no periodo', 'avg', 'R$', null),

    ('Comercial', 'Reunioes Iniciais Agendadas', 'Numero de reunioes iniciais agendadas', 'sum', 'Unidades', null),
    ('Comercial', 'Apresentacao de Propostas', 'Numero de apresentacoes de propostas realizadas', 'sum', 'Unidades', null),
    ('Comercial', 'Pipeline Qualificado', 'Valor do pipeline qualificado', 'avg', 'R$', null),
    ('Comercial', 'Contratos Fechados', 'Valor total de contratos fechados', 'sum', 'R$', null),

    ('Marketing', 'Leads Gerados', 'Quantidade de leads gerados', 'sum', 'Unidades', null),
    ('Marketing', 'Taxa de Conversao', 'Taxa percentual de conversao de leads', 'avg', '%', null),

    ('RH', 'Receita por Funcionario', 'Receita media por funcionario', 'avg', 'R$', null),
    ('RH', 'Tempo Medio de Recrutamento', 'Dias medios para fechamento de vagas', 'avg', 'Dias', null),
    ('RH', 'Turnover', 'Taxa de turnover no periodo', 'avg', '%', null),
    ('RH', 'Taxa de Retencao', 'Taxa de retencao de colaboradores', 'avg', '%', null),
    ('RH', 'eNPS', 'Employee Net Promoter Score', 'avg', 'Pontos', null),

    ('Inteligencia Estrategica', 'TD-rr Fabricados', 'Quantidade de TD-rr fabricados', 'sum', 'Unidades', null),
    ('Inteligencia Estrategica', 'TD-rr em Estoque', 'Quantidade de TD-rr em estoque', 'avg', 'Unidades', null),
    ('Inteligencia Estrategica', 'TD-rr Ativos', 'Quantidade de TD-rr ativos', 'avg', 'Unidades', null),
    ('Inteligencia Estrategica', 'Receita de TD-rr', 'Receita de TD-rr no periodo', 'sum', 'R$', null)
),
executive as (
  select id
  from users
  where role = 'executivo'
  order by created_at asc
  limit 1
)
insert into indicators (
  area_id,
  name,
  description,
  aggregation_type,
  unit,
  target_value,
  created_by,
  is_active
)
select
  a.id,
  s.name,
  s.description,
  s.aggregation_type,
  s.unit,
  s.target_value,
  e.id,
  true
from indicator_seed s
join areas a
  on a.name = s.area_name
left join executive e
  on true
where not exists (
  select 1
  from indicators i
  where i.area_id = a.id
    and i.name = s.name
);


-- ============================================================
-- Source: 005_roles_table_and_fk.sql
-- ============================================================

-- Migração para adotar tabela de roles e vincular users.role por FK.
-- Pode ser executada em bancos já existentes.

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

-- Remove checks antigos que engessavam role em literal.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'users'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table users drop constraint if exists %I', constraint_name);
  end loop;
end;
$$;

-- Vincula users.role ao cadastro central de roles.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'users'::regclass
      and conname = 'users_role_fkey'
      and contype = 'f'
  ) then
    alter table users
      add constraint users_role_fkey
      foreign key (role)
      references roles(code);
  end if;
end;
$$;

create index if not exists idx_users_role on users(role);


-- ============================================================
-- Source: 006_add_bitrix_responsible_id_to_action_plans.sql
-- ============================================================

-- Adiciona o identificador do usuario responsavel no Bitrix24.
-- Execute este script em bancos ja existentes.

alter table action_plans
  add column if not exists bitrix_responsible_id text null;

create index if not exists idx_action_plans_bitrix_responsible_id
  on action_plans(bitrix_responsible_id);


-- ============================================================
-- Source: 007_split_financeiro_caixa_competencia.sql
-- ============================================================

-- Subdivide a area Financeiro em duas visoes: Caixa e Competencia.
-- Este script pode ser executado mais de uma vez (idempotente).

with new_areas(name) as (
  values
    ('Financeiro Caixa'),
    ('Financeiro Competencia')
)
insert into areas (name)
select name from new_areas
on conflict (name) do nothing;

with
source_area as (
  select id
  from areas
  where name = 'Financeiro'
  limit 1
),
target_areas(name, suffix) as (
  values
    ('Financeiro Caixa', '(Caixa)'),
    ('Financeiro Competencia', '(Competencia)')
),
executive as (
  select id
  from users
  where role = 'executivo'
  order by created_at asc
  limit 1
),
source_indicators as (
  select
    i.name,
    i.description,
    i.aggregation_type,
    i.unit,
    i.target_value,
    i.created_by,
    i.is_active
  from indicators i
  join source_area sa
    on sa.id = i.area_id
  where i.name not ilike '%(Caixa)%'
    and i.name not ilike '%(Competencia)%'
)
insert into indicators (
  area_id,
  name,
  description,
  aggregation_type,
  unit,
  target_value,
  created_by,
  is_active
)
select
  target_area.id,
  source.name || ' ' || ta.suffix,
  source.description,
  source.aggregation_type,
  source.unit,
  source.target_value,
  coalesce(source.created_by, e.id),
  source.is_active
from source_indicators source
join target_areas ta
  on true
join areas target_area
  on target_area.name = ta.name
left join executive e
  on true
where not exists (
  select 1
  from indicators i
  where i.area_id = target_area.id
    and i.name = source.name || ' ' || ta.suffix
);


-- ============================================================
-- Source: 008_add_action_plan_segment_fields.sql
-- ============================================================

-- Add segmented fields for action plan details.
-- This script is idempotent.

alter table action_plans
  add column if not exists ocorrencia text null,
  add column if not exists identificacao_causa text null,
  add column if not exists proposta_solucao text null;


-- ============================================================
-- Source: 009_create_indicator_units.sql
-- ============================================================

-- Create a catalog table for indicator units.
-- This script is idempotent.

create extension if not exists "pgcrypto";

create table if not exists indicator_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into indicator_units (code, label, is_active)
values
  ('PERCENT', '%', true),
  ('BRL', 'R$', true),
  ('UN', 'Unidades', true),
  ('DAYS', 'Dias', true),
  ('MONTHS', 'Meses', true),
  ('POINTS', 'Pontos', true)
on conflict (code) do update
set
  label = excluded.label,
  is_active = excluded.is_active;


-- ============================================================
-- Source: 010_add_indicators_unit_fk.sql
-- ============================================================

-- Add a foreign key from indicators to indicator_units and migrate existing text units.
-- This script is idempotent.

alter table indicators
  add column if not exists unit_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'indicators'::regclass
      and conname = 'indicators_unit_id_fkey'
      and contype = 'f'
  ) then
    alter table indicators
      add constraint indicators_unit_id_fkey
      foreign key (unit_id)
      references indicator_units(id);
  end if;
end;
$$;

-- Backfill known units from legacy indicators.unit text values.
with normalized as (
  select
    i.id,
    lower(trim(i.unit)) as unit_normalized
  from indicators i
  where i.unit_id is null
    and i.unit is not null
    and trim(i.unit) <> ''
), mapped as (
  select
    n.id,
    case
      when n.unit_normalized in ('%', 'percent', 'percentual') then 'PERCENT'
      when n.unit_normalized in ('r$', 'brl', 'real', 'reais') then 'BRL'
      when n.unit_normalized in ('un', 'unidade', 'unidades') then 'UN'
      when n.unit_normalized in ('dia', 'dias') then 'DAYS'
      when n.unit_normalized in ('mes', 'meses') then 'MONTHS'
      when n.unit_normalized in ('ponto', 'pontos', 'pt', 'pts') then 'POINTS'
      else null
    end as unit_code
  from normalized n
)
update indicators i
set unit_id = iu.id
from mapped m
join indicator_units iu
  on iu.code = m.unit_code
where i.id = m.id
  and i.unit_id is null
  and m.unit_code is not null;

create index if not exists idx_indicators_unit_id on indicators(unit_id);


-- ============================================================
-- Source: 011_add_area_hex_color.sql
-- ============================================================

-- Add hexadecimal color support per area.
-- This script is idempotent.

alter table areas
  add column if not exists hex_color text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'areas'::regclass
      and conname = 'areas_hex_color_format_check'
      and contype = 'c'
  ) then
    alter table areas
      add constraint areas_hex_color_format_check
      check (hex_color is null or hex_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;

-- Optional baseline colors for known areas.
update areas set hex_color = '#1D4ED8' where name = 'Operacional' and hex_color is null;
update areas set hex_color = '#16A34A' where name = 'Comercial' and hex_color is null;
update areas set hex_color = '#B45309' where name = 'Financeiro' and hex_color is null;
update areas set hex_color = '#9333EA' where name = 'Marketing' and hex_color is null;
update areas set hex_color = '#0E7490' where name = 'RH' and hex_color is null;
update areas set hex_color = '#6D28D9' where name = 'Inteligencia Estrategica' and hex_color is null;
update areas set hex_color = '#C2410C' where name = 'Financeiro Caixa' and hex_color is null;
update areas set hex_color = '#7C3AED' where name = 'Financeiro Competencia' and hex_color is null;


-- ============================================================
-- Source: 012_create_indicator_month_targets.sql
-- ============================================================

-- Store monthly targets per indicator.
-- This script is idempotent.

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists indicator_month_targets (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id),
  year int not null,
  month int not null check (month between 1 and 12),
  target_value numeric not null,
  created_by uuid null references users(id),
  updated_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(indicator_id, year, month)
);

drop trigger if exists trg_indicator_month_targets_updated_at on indicator_month_targets;
create trigger trg_indicator_month_targets_updated_at
before update on indicator_month_targets
for each row execute function set_updated_at();

create index if not exists idx_indicator_month_targets_lookup
  on indicator_month_targets(indicator_id, year, month);


-- ============================================================
-- Source: 013_reframe_weekly_values_to_four_ranges.sql
-- ============================================================

-- Reframe indicator monthly inputs from 6 fixed weeks to 4 day ranges.
-- Ranges: 1-7, 8-14, 15-21, 22-end_of_month.
-- This script is idempotent.

-- 1) Merge historical week 4/5/6 into range 4.
--    sum indicators: use sum.
--    avg indicators: use arithmetic mean among week 4/5/6 records.
with merged as (
  select
    v.indicator_id,
    v.year,
    v.month,
    4 as week_number,
    case
      when coalesce(i.aggregation_type, 'sum') = 'sum' then sum(v.value)
      else avg(v.value)
    end as merged_value,
    (array_agg(v.source_user_id order by coalesce(v.updated_at, v.created_at) desc))[1] as merged_source_user_id
  from indicator_values v
  join indicators i
    on i.id = v.indicator_id
  where v.week_number in (4, 5, 6)
  group by
    v.indicator_id,
    v.year,
    v.month,
    coalesce(i.aggregation_type, 'sum')
)
insert into indicator_values (
  indicator_id,
  year,
  month,
  week_number,
  value,
  source_user_id
)
select
  m.indicator_id,
  m.year,
  m.month,
  m.week_number,
  m.merged_value,
  m.merged_source_user_id
from merged m
on conflict (indicator_id, year, month, week_number)
do update
set
  value = excluded.value,
  source_user_id = excluded.source_user_id,
  updated_at = now();

-- Remap history FK references from old buckets (5/6) to consolidated bucket 4.
update indicator_value_history h
set indicator_value_id = v4.id
from indicator_values v_old
join indicator_values v4
  on v4.indicator_id = v_old.indicator_id
 and v4.year = v_old.year
 and v4.month = v_old.month
 and v4.week_number = 4
where h.indicator_value_id = v_old.id
  and v_old.week_number in (5, 6)
  and h.indicator_value_id <> v4.id;

-- Remove old buckets 5 and 6 after merge.
delete from indicator_values
where week_number in (5, 6);

-- Keep history compatible with the new model.
update indicator_value_history
set week_number = 4
where week_number in (5, 6);

-- 2) Replace week constraints from 1..6 to 1..4.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'indicator_values'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%week_number%'
  loop
    execute format('alter table indicator_values drop constraint if exists %I', constraint_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'indicator_values'::regclass
      and conname = 'indicator_values_week_number_check'
      and contype = 'c'
  ) then
    alter table indicator_values
      add constraint indicator_values_week_number_check
      check (week_number between 1 and 4);
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'indicator_value_history'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%week_number%'
  loop
    execute format('alter table indicator_value_history drop constraint if exists %I', constraint_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'indicator_value_history'::regclass
      and conname = 'indicator_value_history_week_number_check'
      and contype = 'c'
  ) then
    alter table indicator_value_history
      add constraint indicator_value_history_week_number_check
      check (week_number between 1 and 4);
  end if;
end;
$$;


-- ============================================================
-- Source: 014_remove_legacy_action_plan_fields.sql
-- ============================================================

-- Keep only segmented fields in action plans.
-- This script is idempotent and preserves existing data.

alter table action_plans
  add column if not exists ocorrencia text null,
  add column if not exists identificacao_causa text null,
  add column if not exists proposta_solucao text null;

-- Backfill ocorrencia from legacy problem_description when needed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'action_plans'
      and column_name = 'problem_description'
  ) then
    update action_plans
    set ocorrencia = coalesce(
      nullif(trim(ocorrencia), ''),
      nullif(trim(problem_description), ''),
      'Nao informado.'
    )
    where coalesce(nullif(trim(ocorrencia), ''), '') = '';
  else
    update action_plans
    set ocorrencia = 'Nao informado.'
    where coalesce(nullif(trim(ocorrencia), ''), '') = '';
  end if;
end;
$$;

-- Backfill proposta_solucao from legacy expected_action when needed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'action_plans'
      and column_name = 'expected_action'
  ) then
    update action_plans
    set proposta_solucao = coalesce(
      nullif(trim(proposta_solucao), ''),
      nullif(trim(expected_action), ''),
      'Nao informado.'
    )
    where coalesce(nullif(trim(proposta_solucao), ''), '') = '';
  else
    update action_plans
    set proposta_solucao = 'Nao informado.'
    where coalesce(nullif(trim(proposta_solucao), ''), '') = '';
  end if;
end;
$$;

-- Fill identificacao_causa where empty in legacy rows.
update action_plans
set identificacao_causa = 'Nao informado.'
where coalesce(nullif(trim(identificacao_causa), ''), '') = '';

alter table action_plans
  alter column ocorrencia set not null,
  alter column identificacao_causa set not null,
  alter column proposta_solucao set not null;

alter table action_plans
  drop column if exists problem_description,
  drop column if exists expected_action;


-- ============================================================
-- Source: 015_keep_only_financeiro_caixa_e_competencia.sql
-- ============================================================

-- Keep only Financeiro Caixa and Financeiro Competencia.
-- Move all legacy Financeiro data into Financeiro Caixa.
-- This script is idempotent.

insert into areas (name, is_active)
values ('Financeiro Caixa', true)
on conflict (name) do update
set is_active = true;

insert into areas (name, is_active)
values ('Financeiro Competencia', true)
on conflict (name) do update
set is_active = true;

with ids as (
  select
    (select id from areas where name = 'Financeiro' limit 1) as financeiro_id,
    (select id from areas where name = 'Financeiro Caixa' limit 1) as caixa_id
)
update indicators i
set area_id = ids.caixa_id
from ids
where ids.financeiro_id is not null
  and ids.caixa_id is not null
  and i.area_id = ids.financeiro_id;

with ids as (
  select
    (select id from areas where name = 'Financeiro' limit 1) as financeiro_id,
    (select id from areas where name = 'Financeiro Caixa' limit 1) as caixa_id
)
update users u
set area_id = ids.caixa_id
from ids
where ids.financeiro_id is not null
  and ids.caixa_id is not null
  and u.area_id = ids.financeiro_id;

-- Remove legacy Financeiro area after data migration.
do $$
declare
  v_financeiro_id uuid;
begin
  select id
  into v_financeiro_id
  from areas
  where name = 'Financeiro'
  limit 1;

  if v_financeiro_id is null then
    return;
  end if;

  begin
    delete from areas
    where id = v_financeiro_id;
  exception
    when foreign_key_violation then
      update areas
      set is_active = false
      where id = v_financeiro_id;
    when others then
      update areas
      set is_active = false
      where id = v_financeiro_id;
  end;
end;
$$;


-- ============================================================
-- Source: 016_remove_indicator_fixed_target.sql
-- ============================================================

-- Remove fixed indicator target value.
-- Monthly targets in indicator_month_targets are now the single source of target planning.
-- This script is idempotent.

alter table indicators
  drop column if exists target_value;


-- ============================================================
-- Source: 017_add_users_can_edit_projected_value.sql
-- ============================================================

-- Add permission flag to allow registering projected monthly indicator values.
-- This script is idempotent.

alter table users
  add column if not exists can_edit_projected_value boolean not null default false;

create index if not exists idx_users_can_edit_projected_value
  on users(can_edit_projected_value);


-- ============================================================
-- Source: 018_create_indicator_month_projections.sql
-- ============================================================

-- Store monthly projected values per indicator.
-- This script is idempotent.

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists indicator_month_projections (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id),
  year int not null,
  month int not null check (month between 1 and 12),
  projected_value numeric not null,
  created_by uuid null references users(id),
  updated_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(indicator_id, year, month)
);

drop trigger if exists trg_indicator_month_projections_updated_at on indicator_month_projections;
create trigger trg_indicator_month_projections_updated_at
before update on indicator_month_projections
for each row execute function set_updated_at();

create index if not exists idx_indicator_month_projections_lookup
  on indicator_month_projections(indicator_id, year, month);


-- ============================================================
-- Source: 019_add_latest_aggregation_user_area_access_and_admin_support.sql
-- ============================================================

-- Add latest aggregation and multi-area access for manager users.
-- This script is idempotent.

create extension if not exists "pgcrypto";

alter table users
  add column if not exists can_edit_projected_value boolean not null default false;

create index if not exists idx_users_can_edit_projected_value
  on users(can_edit_projected_value);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'indicators'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%aggregation_type%'
  loop
    execute format('alter table indicators drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table indicators
  add constraint indicators_aggregation_type_check
  check (aggregation_type in ('sum', 'avg', 'latest'));

create table if not exists user_area_access (
  user_id uuid not null references users(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, area_id)
);

create index if not exists idx_user_area_access_user_id
  on user_area_access(user_id);

create index if not exists idx_user_area_access_area_id
  on user_area_access(area_id);

insert into user_area_access (user_id, area_id)
select id, area_id
from users
where area_id is not null
on conflict (user_id, area_id) do nothing;

update indicators
set aggregation_type = 'latest'
where lower(name) in (
  lower('GestÃ£o de Estoque do TDRR'),
  lower('Gestao de Estoque do TDRR')
);


-- ============================================================
-- Source: 020_add_indicator_maturity_and_issue_reports.sql
-- ============================================================

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
  status text not null default 'NÃ£o Iniciada'
    check (status in (
      'ConcluÃ­do',
      'Em atendimento',
      'Em Planejamento',
      'Delegada',
      'Recusada',
      'NÃ£o Iniciada'
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


-- ============================================================
-- Source: 021_add_issue_reports_soft_delete.sql
-- ============================================================

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


-- ============================================================
-- Source: 022_issue_fields_na_and_viewer_role.sql
-- ============================================================

-- Revisoes de Issue Reports, N/A mensal e role de visualizacao executiva.

insert into roles (code, name, description, is_active)
values (
    'executivo_visualizacao',
    'Executivo Visualizacao',
    'Usuario com visao global somente leitura de indicadores.',
    true
)
on conflict (code) do update
set
    name = excluded.name,
    description = excluded.description,
    is_active = excluded.is_active;

alter table issue_reports
    add column if not exists ocorrencia text,
    add column if not exists identificacao_causa text,
    add column if not exists proposta_solucao text;

update issue_reports
set
    ocorrencia = coalesce(nullif(ocorrencia, ''), problem_description),
    identificacao_causa = coalesce(nullif(identificacao_causa, ''), observed_impact),
    proposta_solucao = coalesce(nullif(proposta_solucao, ''), requested_action)
where
    ocorrencia is null
    or identificacao_causa is null
    or proposta_solucao is null;

create table if not exists indicator_month_not_applicable (
    indicator_id uuid not null references indicators(id) on delete cascade,
    year integer not null check (year between 2000 and 2100),
    month integer not null check (month between 1 and 12),
    marked_by uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (indicator_id, year, month)
);

create index if not exists idx_indicator_month_not_applicable_year
    on indicator_month_not_applicable (year, month);

drop trigger if exists set_indicator_month_not_applicable_updated_at
    on indicator_month_not_applicable;

create trigger set_indicator_month_not_applicable_updated_at
before update on indicator_month_not_applicable
for each row
execute function set_updated_at();


-- ============================================================
-- Source: 023_issue_report_tags.sql
-- ============================================================

-- Tags de Issue Reports e vinculo N:N entre Issues e Tags.

create table if not exists issue_tags (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    color text null,
    is_active boolean not null default true,
    created_by uuid references users(id),
    updated_by uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint issue_tags_name_non_empty check (btrim(name) <> ''),
    constraint issue_tags_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists ux_issue_tags_active_name
    on issue_tags (lower(name))
    where is_active = true;

drop trigger if exists trg_issue_tags_updated_at on issue_tags;
create trigger trg_issue_tags_updated_at
before update on issue_tags
for each row
execute function set_updated_at();

create table if not exists issue_report_tags (
    issue_id uuid not null references issue_reports(id) on delete cascade,
    tag_id uuid not null references issue_tags(id) on delete cascade,
    created_by uuid references users(id),
    created_at timestamptz not null default now(),
    primary key (issue_id, tag_id)
);

create index if not exists idx_issue_report_tags_tag_id
    on issue_report_tags (tag_id);

create index if not exists idx_issue_report_tags_issue_id
    on issue_report_tags (issue_id);
