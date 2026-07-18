-- Keep only segmented fields in action plans.
-- This script is idempotent and preserves existing data.

alter table action_plans
  add column if not exists ocorrencia text null,
  add column if not exists identificacao_causa text null,
  add column if not exists proposta_solucao text null;

-- Backfill ocorrencia from legacy problem_description when needed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'action_plans'
      and column_name = 'problem_description'
  ) then
    update action_plans
    set ocorrencia = coalesce(
      nullif(trim(ocorrencia), ''),
      nullif(trim(problem_description), ''),
      'Nao informado.'
    )
    where coalesce(nullif(trim(ocorrencia), ''), '') = '';
  else
    update action_plans
    set ocorrencia = 'Nao informado.'
    where coalesce(nullif(trim(ocorrencia), ''), '') = '';
  end if;
end;
$$;

-- Backfill proposta_solucao from legacy expected_action when needed.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'action_plans'
      and column_name = 'expected_action'
  ) then
    update action_plans
    set proposta_solucao = coalesce(
      nullif(trim(proposta_solucao), ''),
      nullif(trim(expected_action), ''),
      'Nao informado.'
    )
    where coalesce(nullif(trim(proposta_solucao), ''), '') = '';
  else
    update action_plans
    set proposta_solucao = 'Nao informado.'
    where coalesce(nullif(trim(proposta_solucao), ''), '') = '';
  end if;
end;
$$;

-- Fill identificacao_causa where empty in legacy rows.
update action_plans
set identificacao_causa = 'Nao informado.'
where coalesce(nullif(trim(identificacao_causa), ''), '') = '';

alter table action_plans
  alter column ocorrencia set not null,
  alter column identificacao_causa set not null,
  alter column proposta_solucao set not null;

alter table action_plans
  drop column if exists problem_description,
  drop column if exists expected_action;
