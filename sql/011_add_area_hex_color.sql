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
