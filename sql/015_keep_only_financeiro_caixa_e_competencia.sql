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
