# PRD: PSC

Data: 2026-08-04
Escopo: projeto completo PSC, incluindo legado Python/FastAPI, app `psc-web`, Supabase, Bitrix24, Drill Downs e sincronizacoes.

## 1. Resumo Do Produto

O PSC e uma plataforma de gestao de indicadores, planos de acao e reports executivos. O projeto possui uma superficie local/legada empacotavel como executavel Windows e uma superficie web moderna em Next.js.

O sistema centraliza:

- Indicadores por area, metas mensais, valores realizados/projetados e maturidade.
- Planos de acao integrados ao Bitrix24.
- Issue Reports e Wins com tags, GUT e revisao executiva.
- Drill Downs Comercial, Financeiro e Marketing com dados pre-calculados no Supabase.
- Sincronizacoes Bitrix24 executadas fora da Vercel via Supabase Edge Functions e crons.

## 2. Personas E Papeis

| Papel | Descricao | Evidencia |
|---|---|---|
| `gestor_area` | Ve indicadores das areas vinculadas e edita valores semanais quando permitido. | `src/core/domain/rules.py`, `psc-web/src/core/domain/rules.ts` |
| `gestor_tatico` / `gestor_operacional` | Papeis area-scoped no app web, com acesso por areas vinculadas. | `psc-web/src/core/domain/models.ts` |
| `executivo` | Visao global e permissoes de administracao de indicadores, areas, reports, wins e usuarios conforme flags. | `psc-web/src/core/domain/rules.ts`, `src/core/domain/rules.py` |
| `executivo_visualizacao` | Visao global sem o mesmo poder operacional do executivo pleno. | `psc-web/src/core/domain/models.ts` |
| Admin de usuarios | Administra usuarios, areas e permissoes via app local ou rotas admin do Next. | `src/admin/users_app.py`, `psc-web/src/app/api/admin/users/` |

## 3. Requisitos Funcionais Implementados Ou Observados

| ID | Requisito | Status | Evidencia |
|---|---|---|---|
| RF-001 | Autenticar usuario e resolver sessao atual. | Implementado | `POST /api/login` legado, `psc-web/src/app/api/auth/bitrix/*`, `psc-web/src/app/api/me/route.ts` |
| RF-002 | Listar indicadores por ano respeitando papel e areas. | Implementado | `GET /api/indicators`, `ListIndicators`, `psc-web/src/core/domain/rules.ts` |
| RF-003 | Editar valores semanais em quatro faixas mensais. | Implementado | `weekly-values`, `getMonthRanges`, SQL `013` |
| RF-004 | Calcular agregacoes `sum`, `avg` ponderado por dias e `latest`. | Implementado | `calculateMonthlyValue`, `calculateAnnualValue` |
| RF-005 | Definir metas mensais, projecoes mensais e marcar mes como nao aplicavel. | Implementado | Rotas `monthly-target`, `monthly-projection`, `monthly-not-applicable` |
| RF-006 | Editar maturidade e confianca/classificacoes de indicadores. | Implementado | `maturity`, `classifyPerformance`, SQL `026`, `027` |
| RF-007 | Criar planos de acao e tarefas Bitrix24. | Implementado | `action-plans`, `bitrix-gateway.ts`, `BitrixTaskGateway` |
| RF-008 | Criar e revisar Issue Reports com GUT, status e tags. | Implementado | `issue-reports`, `issue-tags`, `executive-review` |
| RF-009 | Criar e revisar Wins com tags e fluxo similar a reports. | Implementado | `wins`, `win-tags`, SQL `026`, `027` |
| RF-010 | Administrar usuarios, flags e areas. | Implementado | `admin/users`, `ensureExecutiveAdmin`, `canAdminUsers` |
| RF-011 | Sincronizar Drill Down Comercial via Bitrix24 e materializar agregados Supabase. | Implementado por contexto recente; confirmar arquivo salvo | `commercial-sync`, tabelas `commercial_drilldown_*`, `bitrix_crm_*` |
| RF-012 | Sincronizar Drill Down Marketing por CRM 95 + CRM 125. | Implementado por contexto recente; confirmar arquivo salvo | `marketing-sync`, `marketing_drilldown_*`, SQL `033` |
| RF-013 | Sincronizar indicadores financeiros/unidades financeiras a partir de dados materializados. | Implementado por contexto recente; confirmar arquivo salvo | `financial-units-sync`, SQL `030`, rotas `financial-drilldown` se presentes |
| RF-014 | Agendar syncs diarias por cron as 08:00 e 18:00 BRT. | Implementado por contexto recente; confirmar no banco | SQL `034`, `pg_cron`, `pg_net`, Vault |

## 4. Requisitos Nao Funcionais

| ID | Requisito | Status | Evidencia |
|---|---|---|---|
| RNF-001 | Arquitetura core-first com dominio separado de adapters e infra. | Implementado | `src/core`, `src/adapters`, `psc-web/src/core`, `psc-web/src/adapters` |
| RNF-002 | Evitar chamadas Bitrix24 no cliente; dados de Drill Down devem ser pre-calculados. | Implementado por desenho | Edge Functions + tabelas materializadas |
| RNF-003 | Jobs de sync devem ser isolados por `job_type`. | Implementado por contexto recente | SQL `032`, functions `commercial-sync`, `marketing-sync` |
| RNF-004 | Crons devem usar secrets no Vault, nao hardcode de service role. | Implementado por contexto recente | SQL `034`, `psc_secret` |
| RNF-005 | Builds locais podem gerar executaveis Windows one-file. | Implementado | `scripts/build_exe.ps1`, `scripts/build_admin_exe.ps1` |
| RNF-006 | Testes automatizados existem para regras, use cases e app web. | Implementado parcialmente | `tests/`, `psc-web/tests/` |

## 5. Regras De Negocio

| Regra | Descricao | Evidencia |
|---|---|---|
| RN-001 | Usuario inativo nao deve operar o sistema. | `ensureUserActive`, `ensure_user_active` |
| RN-002 | Gestor edita apenas indicadores de areas vinculadas. | `getUserAreaIds`, `ensureCanEditWeeklyValue` |
| RN-003 | Executivo e visualizacao executiva veem indicadores globalmente. | `globalViewRoles` |
| RN-004 | Faixas mensais sao 1-7, 8-14, 15-21 e 22-ultimo dia. | `getMonthRanges` |
| RN-005 | `avg` e media ponderada pelos dias da faixa. | `calculateMonthlyValue` |
| RN-006 | GUT deve aceitar valores inteiros de 1 a 5. | `ensureIssueGutValue` |
| RN-007 | Cor deve usar `#RRGGBB`. | `ensureHexColorOrNull` |
| RN-008 | Marketing CRM 125 e sempre canal `OUTBOUND`. | Contexto recente `marketing-sync` |
| RN-009 | Marketing CRM 95 usa fonte Bitrix; fontes site-like podem virar `META ADS` ou `SEO` por tag no titulo. | Contexto recente `033`, `marketing-sync` |
| RN-010 | `scheduled_meetings` mantem nome do cliente, mas no Marketing atual conta cards Won. | Decisao de negocio recente |
| RN-011 | Comercial usa ciclos com `cycle_id` deterministico por deal/ciclo para estabilidade de FK. | Contexto recente `035`, `commercial-sync` |

## 6. Fluxos Principais

### Indicadores

1. Usuario autentica.
2. Frontend lista indicadores do ano.
3. Gestor informa valores semanais.
4. Sistema calcula real mensal/anual, compara meta/projecao e classifica desempenho.

### Planos De Acao

1. Executivo cria plano vinculado a indicador.
2. Sistema busca responsavel Bitrix.
3. Gateway cria tarefa Bitrix24 quando webhook esta configurado.
4. Supabase registra plano e historico.

### Drill Down Comercial

1. Job `incremental` e criado.
2. Edge Function consulta stages, usuarios, deals, stage history.
3. Ciclos comerciais sao reconstruidos com UUID estavel.
4. Agregados e itens sao materializados em `commercial_drilldown_monthly` e `commercial_drilldown_items`.

### Drill Down Marketing

1. Job `marketing` e criado.
2. Edge Function processa CRM 95 e CRM 125.
3. Leads criados alimentam `leads_generated` e denominador de `conversion_rate`.
4. Won alimenta `scheduled_meetings` e numerador de `conversion_rate`.
5. Cron de mes atual roda diariamente.

## 7. Fora De Escopo Ou Nao Confirmado

- Presenca fisica de `sql/028..035` e `supabase/functions/*` no snapshot atual precisa ser confirmada; o contexto recente veio das abas/conversa.
- Export HTML/PDF atualizado nao foi feito nesta etapa.
- Deploys Supabase e crons nao foram verificados por ferramenta local nesta etapa.

## 8. Evidencias Principais

| Area | Evidencia |
|---|---|
| Legado Python | `src/core/domain`, `src/adapters`, `src/app`, `web`, `admin_web` |
| App web | `psc-web/src/app/api`, `psc-web/src/core/domain`, `psc-web/src/adapters/output` |
| SQL base | `sql/000..027` |
| Syncs recentes | Contexto da sessao: `032_scope_bitrix_sync_jobs_by_type.sql`, `033_marketing_crm95_125_won_rules.sql`, `034_schedule_bitrix_sync_crons.sql`, `035_fix_commercial_cycle_id_stability.sql` |
| Validacao historica recente | `npm run typecheck` e `npm test -- --run` passaram em etapa anterior da conversa para `psc-web` |
