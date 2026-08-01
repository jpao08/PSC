# PRD: PSC

Data: 2026-07-31
Escopo: aplicacao executavel local, modulo admin local e fork web `psc-web/` com Drill Down Comercial.

## 1. Resumo do Produto

O PSC e uma plataforma de gestao de indicadores, planos de acao, Issue Reports, Wins e acompanhamento comercial. O repositorio contem duas superficies principais:

- Versao executavel local: FastAPI + UI estatica, empacotavel como `PSC.exe`, com admin separado `PSC-Users-Admin.exe`.
- Fork web: Next.js App Router para deploy tipo Vercel, autenticacao Bitrix OAuth, Supabase server-side e dados comerciais pre-calculados por Supabase Edge Function.

O produto usa Supabase/Postgres como banco operacional e integra com Bitrix24 para login web, busca de usuarios, criacao de tarefas e sincronizacao de dados CRM.

## 2. Usuarios e Papeis

| Papel | Descricao implementada | Evidencia |
|---|---|---|
| `gestor_area` | Usuario com escopo por area; visualiza indicadores das areas vinculadas e pode editar valores semanais na versao Python/Next conforme regra implementada. | `src/core/domain/rules.py`, `psc-web/src/core/domain/rules.ts` |
| `gestor_tatico` | Papel web com visualizacao por area. | `psc-web/src/core/domain/rules.ts`, `sql/027_roles_annual_confidence_and_simple_wins.sql` |
| `gestor_operacional` | Papel web com visualizacao por area. | `psc-web/src/core/domain/rules.ts`, `sql/027_roles_annual_confidence_and_simple_wins.sql` |
| `executivo` | Acesso global e permissoes de gestao sobre areas, indicadores, metas, planos, issues, wins, tags e administracao web quando permitido. | `src/adapters/input/api_routes.py`, `psc-web/src/app/api/` |
| `executivo_visualizacao` | Acesso global de visualizacao; no web tambem pode acessar Drill Down Comercial. | `src/core/domain/models.py`, `psc-web/src/core/domain/rules.ts` |
| Admin local | Usa `PSC-Users-Admin.exe` com `USER_ADMIN_PASSWORD` para administrar usuarios e areas na superficie local. | `src/admin/users_app.py`, `admin_web/` |
| Admin web | Usuario PSC com `role = executivo` ou `can_admin_users`, usando `/admin` no Next.js para provisionar contas PSC a partir de usuarios Bitrix. | `psc-web/src/app/api/admin/users/route.ts`, `psc-web/src/components/AdminClient.tsx` |

## 3. Requisitos Funcionais Implementados

| ID | Requisito | Status | Evidencia |
|---|---|---|---|
| RF-001 | Autenticar usuario na versao Python com login/email e senha, retornando bearer token. | Implementado | `POST /api/login`, `AuthenticateUser`, `SimpleTokenService` |
| RF-002 | Autenticar usuario na versao web por Bitrix OAuth e sessao HTTP-only. | Implementado | `psc-web/src/app/api/auth/bitrix/start/route.ts`, `callback/route.ts`, `psc-web/src/infra/session.ts` |
| RF-003 | Retornar usuario atual com role, areas e flags de permissao. | Implementado | `GET /api/me`, `psc-web/src/app/api/me/route.ts` |
| RF-004 | Listar indicadores por ano, respeitando papel e areas vinculadas. | Implementado | `ListIndicators`, `psc-web/src/core/use-cases/list-indicators.ts` |
| RF-005 | Calcular valor mensal por `sum`, `avg` ponderada ou `latest`. | Implementado | `calculate_monthly_value`, `calculateMonthlyValue`, testes Python/TS |
| RF-006 | Registrar quatro faixas mensais e valores semanais por indicador/mes. | Implementado | `weekly-values` routes, `getMonthRanges` |
| RF-007 | Registrar historico quando valor semanal existente muda na versao Python. | Implementado | `SupabaseIndicatorRepository.upsert_weekly_value`, `indicator_value_history` |
| RF-008 | Criar, editar e excluir indicadores. | Implementado | Rotas `/api/indicators`, use cases Python/TS |
| RF-009 | Editar maturidade de indicador por executivo ou usuario com `can_edit_indicator_maturity`. | Implementado | `ensureCanEditIndicatorMaturity`, `PATCH /api/indicators/[indicatorId]/maturity` |
| RF-010 | Criar, editar e desativar areas com cor opcional. | Implementado | `/api/areas`, `ensureHexColorOrNull` |
| RF-011 | Listar unidades de indicadores. | Implementado | `/api/indicator-units`, tabela `indicator_units` |
| RF-012 | Gerir metas mensais, projecoes mensais e meses nao aplicaveis. | Implementado | `monthly-target`, `monthly-projection`, `monthly-not-applicable` |
| RF-013 | Gerir planejamento anual com meta anual e nivel de confianca. | Implementado | `indicator_year_planning`, `annual-planning` route |
| RF-014 | Criar planos de acao vinculados a indicadores. | Implementado | `/api/action-plans`, `CreateActionPlan` |
| RF-015 | Criar tarefa no Bitrix24 ao criar plano de acao quando gateway/webhook estiver configurado. | Implementado | `BitrixTaskGateway`, `BitrixGateway.createTask` |
| RF-016 | Buscar usuarios Bitrix para autocomplete. | Implementado | `/api/bitrix-users`, `BitrixClient`, `BitrixGateway.searchUsers` |
| RF-017 | Gerir Issue Reports com GUT do solicitante, revisao executiva, status, tags e soft delete. | Implementado | `/api/issue-reports`, `/api/issue-tags`, tests |
| RF-018 | Gerir Wins com criacao simplificada, tags, revisao executiva e soft delete. | Implementado | `/api/wins`, `/api/win-tags`, `wins`, `win_tags` |
| RF-019 | Exportar dados da UI web em CSV pelo cliente. | Implementado | `DashboardClient.tsx`, funcoes `downloadCsv`, `toCsv` |
| RF-020 | Expor Drill Down Comercial por ano, responsavel, metrica e mes. | Implementado | `/api/commercial-drilldown`, `/items`, SQL RPCs |
| RF-021 | Iniciar e consultar sincronizacao comercial controlada por jobs. | Implementado | `/api/commercial-drilldown/sync`, `/sync-status`, `bitrix_sync_jobs` |
| RF-022 | Sincronizar dados CRM Bitrix fora da Vercel e materializar agregados no Supabase. | Implementado | `supabase/functions/commercial-sync/index.ts`, `sql/028_commercial_drilldown_bitrix.sql` |
| RF-023 | Administrar usuarios localmente por executavel admin. | Implementado | `src/admin/users_app.py`, `admin_web/app.js` |
| RF-024 | Administrar usuarios web a partir de usuarios Bitrix existentes. | Implementado | `ProvisionBitrixUser`, `AdminClient.tsx`, `/api/admin/users` |
| RF-025 | Gerar executaveis one-file Windows para app principal e admin. | Implementado | `scripts/build_exe.ps1`, `scripts/build_admin_exe.ps1`, specs PyInstaller |

## 4. Requisitos Nao Funcionais Implementados

| ID | Requisito | Status | Evidencia |
|---|---|---|---|
| RNF-001 | Separar dominio, use cases, ports, adapters, infra e composition root. | Implementado | `src/core`, `src/adapters`, `psc-web/src/core`, `psc-web/src/composition` |
| RNF-002 | Executavel local deve iniciar servidor, limpar porta e abrir navegador. | Implementado | `src/app/start_server.py` |
| RNF-003 | Build local deve gerar executaveis Windows one-file. | Implementado | `scripts/build_exe.ps1`, `scripts/build_admin_exe.ps1` |
| RNF-004 | Web deve manter `SUPABASE_SERVICE_ROLE_KEY` somente em rotas server-side. | Implementado por desenho | `psc-web/README.md`, `psc-web/src/infra/env.ts` |
| RNF-005 | Sessao Next.js deve usar cookie HTTP-only com JWT HS256 e TTL de 12h. | Implementado | `psc-web/src/infra/session.ts` |
| RNF-006 | Tokens Python devem ser assinados por HMAC e expirar por TTL. | Implementado | `SimpleTokenService` |
| RNF-007 | Senhas locais devem usar hash PBKDF2-SHA256. | Implementado | `hash_password`, `verify_password` |
| RNF-008 | Clientes PSC/Vercel nao devem chamar Bitrix CRM diretamente para Drill Down Comercial. | Implementado por desenho | `sql/028_commercial_drilldown_bitrix.sql`, Edge Function |
| RNF-009 | Testes automatizados devem cobrir regras, use cases, Bitrix gateway, issue reports, admin e regras web. | Implementado parcialmente | `tests/`, `psc-web/tests/` |

## 5. Regras de Negocio Implementadas

| Regra | Descricao | Evidencia |
|---|---|---|
| RN-001 | Usuario inativo nao autentica ou opera rotas protegidas. | `ensure_user_active`, `ensureUserActive` |
| RN-002 | Roles validas incluem `gestor_area`, `gestor_tatico`, `gestor_operacional`, `executivo`, `executivo_visualizacao` no web. | `rules.ts`, `sql/027` |
| RN-003 | Roles de escopo por area visualizam apenas indicadores das areas vinculadas. | `getUserAreaIds`, `ensureCanViewIndicator` |
| RN-004 | `executivo` e `executivo_visualizacao` possuem visao global de indicadores. | `ensureCanViewIndicator` |
| RN-005 | Edicao de valor semanal e limitada ao gestor de area na regra TypeScript atual. | `ensureCanEditWeeklyValue` |
| RN-006 | Maturidade de indicador exige executivo ou `can_edit_indicator_maturity`. | `ensureCanEditIndicatorMaturity` |
| RN-007 | Drill Down Comercial exige usuario ativo e role `executivo`, `executivo_visualizacao` ou `can_admin_users`. | `ensureCanUseCommercialDrilldown` |
| RN-008 | Iniciar sincronizacao comercial exige `can_admin_users`. | `ensureCanStartCommercialSync` |
| RN-009 | Administracao web exige `executivo` ou `can_admin_users`. | `ensureExecutiveAdmin` |
| RN-010 | Mes tem quatro faixas: 1-7, 8-14, 15-21, 22-ultimo dia. | `getMonthRanges`, SQL `013` |
| RN-011 | `avg` e media ponderada pelos dias das faixas preenchidas; `latest` usa ultima faixa preenchida. | `calculateMonthlyValue`, tests |
| RN-012 | Confianca anual deve estar entre 0 e 100. | `validateConfidenceLevel`, `indicator_year_planning` |
| RN-013 | Classificacao de performance usa faixas: nao confiavel, fragil, funcional, confiavel, estrategico. | `classifyPerformance`, `rules.test.ts` |
| RN-014 | GUT de Issue Reports e Wins usa valores 1..5 e score multiplicativo. | `ensureIssueGutValue`, SQL `026` |
| RN-015 | Issue Reports e Wins usam soft delete. | repositories, SQL |
| RN-016 | Tags ativas devem ter nome nao vazio e cor opcional `#RRGGBB`. | `ensureHexColorOrNull`, SQL |
| RN-017 | Sincronizacao comercial permite apenas um job `pending/running` por vez. | `ux_bitrix_sync_jobs_active`, `start_commercial_sync` |
| RN-018 | Drill Down Comercial usa metricas configuradas em `commercial_drilldown_config`. | SQL `028`, Edge Function |

## 6. Fluxos Principais

### Executavel Local

1. Usuario inicia `PSC.exe`.
2. Launcher limpa porta, inicia FastAPI e abre navegador.
3. UI estatica autentica por login/senha e guarda bearer token.
4. API acessa use cases e repositories Supabase.
5. Gestor registra valores; executivo gerencia indicadores, areas, metas, planos e issues.
6. Plano de acao pode criar tarefa Bitrix.

### Admin Local

1. Usuario inicia `PSC-Users-Admin.exe`.
2. Admin autentica com `USER_ADMIN_PASSWORD`.
3. UI `admin_web/` lista areas e usuarios.
4. Admin cria/edita/desativa usuarios e vinculos multi-area.

### Web Next.js

1. Usuario acessa `psc-web`.
2. Login inicia OAuth no portal Bitrix.
3. Callback troca code por token Bitrix, resolve usuario Bitrix e vinculo PSC.
4. App cria cookie `psc_session` HTTP-only.
5. Rotas server-side usam Supabase service role e aplicam regras PSC antes de ler/escrever dados.
6. Dashboard oferece indicadores, Drill Down Comercial, Issue Reports e Wins conforme permissoes.

### Drill Down Comercial

1. Admin web chama `POST /api/commercial-drilldown/sync`.
2. Supabase RPC cria job em `bitrix_sync_jobs` se nao existir job ativo.
3. Edge Function `commercial-sync` processa job pendente, consulta Bitrix CRM, persiste deals, usuarios, stages, historico, snapshots e ciclos.
4. Edge Function reconstrui `commercial_drilldown_monthly` e `commercial_drilldown_items`.
5. UI Next.js consulta RPCs `get_commercial_drilldown_dashboard` e `get_commercial_drilldown_items`.

## 7. Fora do Escopo ou Nao Validado

- Deploy real em Vercel, Supabase ou Bitrix24.
- Execucao local de Next.js, Python, testes ou builds nesta atualizacao documental.
- RLS/policies Supabase para acesso direto do browser; o fork web usa service role server-side.
- Consolidacao de migrations `024..028` dentro de `sql/000_consolidated_schema.sql`.

## 8. Riscos e Perguntas Abertas

- Scripts PyInstaller podem empacotar `.env` por padrao quando o arquivo existe; revisar antes de distribuir executaveis.
- `sql/README.md` parece desatualizado em relacao a `028`.
- `sql/000_consolidated_schema.sql` consolida ate `001..023`; bancos novos precisam aplicar migrations incrementais posteriores.
- A branch atual mistura superficie executavel local e fork web; definir se ambas seguem evoluindo juntas ou se uma substituira a outra.
- HTMLs exportados em `docs/ai-context/` devem ser regenerados apos aprovacao dos Markdown.

## 9. Evidencias Principais

| Area | Evidencia |
|---|---|
| Executavel Python | `src/app/main.py`, `src/app/start_server.py`, `PSC.spec` |
| Admin Python | `src/admin/users_app.py`, `admin_web/`, `PSC-Users-Admin.spec` |
| API Python | `src/adapters/input/api_routes.py` |
| Dominio Python | `src/core/domain/models.py`, `src/core/domain/rules.py` |
| Persistencia Python | `src/adapters/output/supabase_repositories.py` |
| Web Next.js | `psc-web/src/app/`, `psc-web/src/components/` |
| Rotas Next.js | `psc-web/src/app/api/` |
| Dominio Next.js | `psc-web/src/core/domain/models.ts`, `psc-web/src/core/domain/rules.ts` |
| Persistencia Next.js | `psc-web/src/adapters/output/supabase-repositories.ts` |
| Auth Bitrix | `psc-web/src/app/api/auth/bitrix/`, `psc-web/src/adapters/output/bitrix-gateway.ts` |
| Drill Down Comercial | `sql/028_commercial_drilldown_bitrix.sql`, `supabase/functions/commercial-sync/index.ts` |
| SQL | `sql/000_consolidated_schema.sql`, `sql/024..028` |
| Testes | `tests/`, `psc-web/tests/` |
