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
