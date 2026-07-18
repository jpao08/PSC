-- Adiciona o identificador do usuario responsavel no Bitrix24.
-- Execute este script em bancos ja existentes.

alter table action_plans
  add column if not exists bitrix_responsible_id text null;

create index if not exists idx_action_plans_bitrix_responsible_id
  on action_plans(bitrix_responsible_id);
