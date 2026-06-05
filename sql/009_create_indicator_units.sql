-- Create a catalog table for indicator units.
-- This script is idempotent.

create extension if not exists "pgcrypto";

create table if not exists indicator_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into indicator_units (code, label, is_active)
values
  ('PERCENT', '%', true),
  ('BRL', 'R$', true),
  ('UN', 'Unidades', true),
  ('DAYS', 'Dias', true),
  ('MONTHS', 'Meses', true),
  ('POINTS', 'Pontos', true)
on conflict (code) do update
set
  label = excluded.label,
  is_active = excluded.is_active;
