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