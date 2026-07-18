-- Add segmented fields for action plan details.
-- This script is idempotent.

alter table action_plans
  add column if not exists ocorrencia text null,
  add column if not exists identificacao_causa text null,
  add column if not exists proposta_solucao text null;
