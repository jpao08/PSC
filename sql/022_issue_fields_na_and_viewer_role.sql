-- Revisoes de Issue Reports, N/A mensal e role de visualizacao executiva.

insert into roles (code, name, description, is_active)
values (
    'executivo_visualizacao',
    'Executivo Visualizacao',
    'Usuario com visao global somente leitura de indicadores.',
    true
)
on conflict (code) do update
set
    name = excluded.name,
    description = excluded.description,
    is_active = excluded.is_active;

alter table issue_reports
    add column if not exists ocorrencia text,
    add column if not exists identificacao_causa text,
    add column if not exists proposta_solucao text;

update issue_reports
set
    ocorrencia = coalesce(nullif(ocorrencia, ''), problem_description),
    identificacao_causa = coalesce(nullif(identificacao_causa, ''), observed_impact),
    proposta_solucao = coalesce(nullif(proposta_solucao, ''), requested_action)
where
    ocorrencia is null
    or identificacao_causa is null
    or proposta_solucao is null;

create table if not exists indicator_month_not_applicable (
    indicator_id uuid not null references indicators(id) on delete cascade,
    year integer not null check (year between 2000 and 2100),
    month integer not null check (month between 1 and 12),
    marked_by uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (indicator_id, year, month)
);

create index if not exists idx_indicator_month_not_applicable_year
    on indicator_month_not_applicable (year, month);

drop trigger if exists set_indicator_month_not_applicable_updated_at
    on indicator_month_not_applicable;

create trigger set_indicator_month_not_applicable_updated_at
before update on indicator_month_not_applicable
for each row
execute function set_updated_at();
