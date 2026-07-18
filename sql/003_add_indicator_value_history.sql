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
