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
