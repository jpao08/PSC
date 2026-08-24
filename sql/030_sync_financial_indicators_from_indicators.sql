-- Mirror regular PSC indicators from the Finance area into financial_indicators.
-- This keeps the Financial Drill Down using the same indicator UUIDs already managed by PSC.
-- This script is idempotent.

insert into financial_indicators (
  id,
  name,
  description,
  value_type,
  aggregation_type,
  display_order,
  is_active,
  created_at,
  updated_at
)
select
  i.id,
  i.name,
  i.description,
  case
    when lower(coalesce(iu.code, i.unit, '')) in ('percent', 'percentage', 'percentual', '%') then 'percentage'
    when lower(coalesce(iu.code, i.unit, '')) in ('currency', 'money', 'brl', 'real', 'reais', 'r$') then 'money'
    else 'decimal'
  end as value_type,
  i.aggregation_type,
  row_number() over (order by i.name)::integer as display_order,
  i.is_active,
  i.created_at,
  i.updated_at
from indicators i
left join indicator_units iu on iu.id = i.unit_id
where i.area_id = 'd9dbda82-eb4c-42d7-adce-92499715cd18'
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  value_type = excluded.value_type,
  aggregation_type = excluded.aggregation_type,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();
