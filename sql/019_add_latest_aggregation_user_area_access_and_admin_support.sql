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
  lower('Gestão de Estoque do TDRR'),
  lower('Gestao de Estoque do TDRR')
);
