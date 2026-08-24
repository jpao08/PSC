# CURRENT-SCORECARD-FLOW

Data: 2026-08-20

## Fluxo AS-IS/Ajustado

Cadastro do indicador:
- Next.js: `psc-web/src/app/api/indicators/route.ts`, `psc-web/src/app/api/indicators/[indicatorId]/route.ts`.
- Legado: `src/adapters/input/api_routes.py`.
- Dominio: `create_indicator`, `update_indicator`, models `Indicator` e `NewIndicator`.

Preenchimento:
- Valores sao gravados em `indicator_values` por `indicator_id`, `year`, `month`, `week_number`.
- Campo vazio agora remove o registro semanal; `0` permanece valor valido.
- Mes N/A usa `indicator_month_not_applicable` e representa Not Calculable.

Consulta:
- Next.js agrega em `SupabaseIndicatorRepository.listIndicatorTable`.
- Legado agrega em `ListIndicators.execute`.

Agregacao:
- Valor mensal e sempre o ultimo preenchimento semanal valido do mes.
- `aggregation_type` e aplicado somente para consolidar valores mensais:
  - `sum` = Fluxo
  - `latest` = Posicao
  - `avg` = Proporcional

Apresentacao:
- Dashboard principal exibe meses, anual e consolidacao trimestral.
- Drill Downs no `psc-web` expõem perspectivas Por Indicador, Transposto e Consolidado usando os dados do Scorecard geral.

## Protecoes

- Drill Downs de negocio nao escrevem nas tabelas de valores/metas/projecoes do Scorecard.
- Historico existente nao foi reinterpretado automaticamente.
