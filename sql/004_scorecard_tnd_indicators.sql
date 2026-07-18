-- Cadastro base do SCORECARD T&D
-- Este script pode ser executado mais de uma vez (idempotente).

with area_seed(name) as (
  values
    ('Financeiro'),
    ('Operacional'),
    ('Comercial'),
    ('Marketing'),
    ('RH'),
    ('Inteligencia Estrategica')
)
insert into areas (name)
select name from area_seed
on conflict (name) do nothing;

with indicator_seed(area_name, name, description, aggregation_type, unit, target_value) as (
  values
    ('Financeiro', 'Saldo em Caixa', 'Saldo de caixa no periodo', 'avg', 'R$', null::numeric),
    ('Financeiro', 'Runway', 'Meses de operacao suportados pelo caixa', 'avg', 'Meses', null),
    ('Financeiro', 'Faturamento', 'Receita bruta no periodo', 'sum', 'R$', null),
    ('Financeiro', 'Margem Bruta', 'Margem bruta percentual', 'avg', '%', null),
    ('Financeiro', 'EBITDA', 'Resultado operacional antes de juros, impostos, depreciacao e amortizacao', 'sum', 'R$', null),
    ('Financeiro', 'Fluxo de Caixa Livre', 'Fluxo de caixa livre no periodo', 'sum', 'R$', null),

    ('Operacional', 'Aging', 'Valor em aging no periodo', 'avg', 'R$', null),

    ('Comercial', 'Reunioes Iniciais Agendadas', 'Numero de reunioes iniciais agendadas', 'sum', 'Unidades', null),
    ('Comercial', 'Apresentacao de Propostas', 'Numero de apresentacoes de propostas realizadas', 'sum', 'Unidades', null),
    ('Comercial', 'Pipeline Qualificado', 'Valor do pipeline qualificado', 'avg', 'R$', null),
    ('Comercial', 'Contratos Fechados', 'Valor total de contratos fechados', 'sum', 'R$', null),

    ('Marketing', 'Leads Gerados', 'Quantidade de leads gerados', 'sum', 'Unidades', null),
    ('Marketing', 'Taxa de Conversao', 'Taxa percentual de conversao de leads', 'avg', '%', null),

    ('RH', 'Receita por Funcionario', 'Receita media por funcionario', 'avg', 'R$', null),
    ('RH', 'Tempo Medio de Recrutamento', 'Dias medios para fechamento de vagas', 'avg', 'Dias', null),
    ('RH', 'Turnover', 'Taxa de turnover no periodo', 'avg', '%', null),
    ('RH', 'Taxa de Retencao', 'Taxa de retencao de colaboradores', 'avg', '%', null),
    ('RH', 'eNPS', 'Employee Net Promoter Score', 'avg', 'Pontos', null),

    ('Inteligencia Estrategica', 'TD-rr Fabricados', 'Quantidade de TD-rr fabricados', 'sum', 'Unidades', null),
    ('Inteligencia Estrategica', 'TD-rr em Estoque', 'Quantidade de TD-rr em estoque', 'avg', 'Unidades', null),
    ('Inteligencia Estrategica', 'TD-rr Ativos', 'Quantidade de TD-rr ativos', 'avg', 'Unidades', null),
    ('Inteligencia Estrategica', 'Receita de TD-rr', 'Receita de TD-rr no periodo', 'sum', 'R$', null)
),
executive as (
  select id
  from users
  where role = 'executivo'
  order by created_at asc
  limit 1
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
  a.id,
  s.name,
  s.description,
  s.aggregation_type,
  s.unit,
  s.target_value,
  e.id,
  true
from indicator_seed s
join areas a
  on a.name = s.area_name
left join executive e
  on true
where not exists (
  select 1
  from indicators i
  where i.area_id = a.id
    and i.name = s.name
);
