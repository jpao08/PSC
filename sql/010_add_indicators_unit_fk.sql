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
