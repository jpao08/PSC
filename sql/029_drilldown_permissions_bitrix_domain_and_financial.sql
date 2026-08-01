-- Drill Down permissions, Bitrix portal default and Financial Drill Down.
-- This script is idempotent.

create extension if not exists pgcrypto;

alter table users
  add column if not exists can_view_commercial_drilldown boolean not null default false,
  add column if not exists can_view_marketing_drilldown boolean not null default false,
  add column if not exists can_view_financial_drilldown boolean not null default false,
  add column if not exists can_edit_financial_drilldown boolean not null default false;

alter table users
  alter column bitrix_portal_domain set default 'tdsustentavel.bitrix24.com.br';

update users
set bitrix_portal_domain = 'tdsustentavel.bitrix24.com.br'
where bitrix_user_id is not null
  and (bitrix_portal_domain is null or btrim(bitrix_portal_domain) = '');

update users
set can_view_financial_drilldown = true
where can_edit_financial_drilldown = true
  and can_view_financial_drilldown = false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_financial_edit_implies_view'
  ) then
    alter table users
      add constraint users_financial_edit_implies_view
      check (can_edit_financial_drilldown = false or can_view_financial_drilldown = true);
  end if;
end $$;

create index if not exists idx_users_can_view_commercial_drilldown
  on users(can_view_commercial_drilldown);
create index if not exists idx_users_can_view_marketing_drilldown
  on users(can_view_marketing_drilldown);
create index if not exists idx_users_can_view_financial_drilldown
  on users(can_view_financial_drilldown);
create index if not exists idx_users_can_edit_financial_drilldown
  on users(can_edit_financial_drilldown);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bitrix_spa_item_id text not null unique,
  bitrix_entity_type_id integer not null default 1070,
  bitrix_category_id integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  constraint units_name_non_empty check (btrim(name) <> '')
);

drop trigger if exists trg_units_updated_at on units;
create trigger trg_units_updated_at
before update on units
for each row execute function set_updated_at();

create table if not exists financial_indicators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  value_type text not null check (value_type in ('integer', 'decimal', 'percentage', 'money')),
  aggregation_type text not null check (aggregation_type in ('sum', 'avg', 'ratio', 'latest', 'formula')),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_indicators_name_non_empty check (btrim(name) <> '')
);

drop trigger if exists trg_financial_indicators_updated_at on financial_indicators;
create trigger trg_financial_indicators_updated_at
before update on financial_indicators
for each row execute function set_updated_at();

create table if not exists financial_indicator_values (
  id uuid primary key default gen_random_uuid(),
  financial_indicator_id uuid not null references financial_indicators(id) on delete cascade,
  unit_id uuid not null references units(id),
  reference_month date not null,
  value numeric null,
  created_by uuid null references users(id),
  updated_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(financial_indicator_id, unit_id, reference_month),
  constraint financial_values_month_start check (date_trunc('month', reference_month)::date = reference_month)
);

drop trigger if exists trg_financial_indicator_values_updated_at on financial_indicator_values;
create trigger trg_financial_indicator_values_updated_at
before update on financial_indicator_values
for each row execute function set_updated_at();

create table if not exists financial_indicator_value_history (
  id uuid primary key default gen_random_uuid(),
  financial_indicator_value_id uuid null references financial_indicator_values(id) on delete set null,
  financial_indicator_id uuid not null references financial_indicators(id) on delete cascade,
  unit_id uuid not null references units(id),
  reference_month date not null,
  previous_value numeric null,
  new_value numeric null,
  changed_by uuid null references users(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_financial_values_lookup
  on financial_indicator_values(financial_indicator_id, unit_id, reference_month);
create index if not exists idx_financial_history_lookup
  on financial_indicator_value_history(financial_indicator_id, unit_id, reference_month, changed_at desc);

create or replace function audit_financial_indicator_value_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into financial_indicator_value_history(
      financial_indicator_value_id,
      financial_indicator_id,
      unit_id,
      reference_month,
      previous_value,
      new_value,
      changed_by
    )
    values (
      new.id,
      new.financial_indicator_id,
      new.unit_id,
      new.reference_month,
      null,
      new.value,
      new.updated_by
    );
    return new;
  end if;

  if old.value is distinct from new.value then
    insert into financial_indicator_value_history(
      financial_indicator_value_id,
      financial_indicator_id,
      unit_id,
      reference_month,
      previous_value,
      new_value,
      changed_by
    )
    values (
      new.id,
      new.financial_indicator_id,
      new.unit_id,
      new.reference_month,
      old.value,
      new.value,
      new.updated_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_financial_indicator_value_history on financial_indicator_values;
create trigger trg_financial_indicator_value_history
after insert or update on financial_indicator_values
for each row execute function audit_financial_indicator_value_change();
