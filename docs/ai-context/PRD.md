# PRD: PSC Executavel

Data: 2026-07-11
Escopo: aplicacao executavel PSC e modulo executavel de administracao de usuarios. `psc-web/` esta fora do escopo.

## 1. Resumo do Produto

O PSC e uma aplicacao local empacotavel como executavel Windows para gestao de indicadores por area. O usuario abre `PSC.exe`, que inicia um servidor FastAPI local, serve uma UI estatica em navegador a partir de `web/`, persiste dados no Supabase e integra com Bitrix24 para criacao de tarefas em planos de acao.

O projeto tambem possui um executavel separado, `PSC-Users-Admin.exe`, para administracao local de usuarios, permissoes e vinculos com areas usando `admin_web/`.

## 2. Personas e Papeis

| Papel | Descricao implementada | Evidencia |
|---|---|---|
| `gestor_area` | Visualiza indicadores das areas vinculadas, atualiza valores semanais, marca mes como nao aplicavel e pode usar Issue Reports se tiver permissao. | `src/core/domain/rules.py`, `src/core/use_cases/register_indicator_value.py`, `src/core/use_cases/set_indicator_month_not_applicable.py`, `tests/test_use_case.py` |
| `executivo` | Tem visao global e permissoes de gestao: areas, indicadores, metas, planos de acao, Issue Reports, tags e busca de usuarios Bitrix. | `src/adapters/input/api_routes.py`, `src/core/use_cases/create_indicator.py`, `src/core/use_cases/create_area.py`, `src/core/use_cases/create_action_plan.py` |
| `executivo_visualizacao` | Papel executivo de visualizacao; lista todos os indicadores e pode acessar Issue Reports se `can_use_issue_reports` permitir, mas nao cria indicadores. | `src/core/domain/models.py`, `src/core/domain/rules.py`, `tests/test_use_case.py`, `tests/test_issue_reports.py` |
| Admin local | Usa o executavel administrativo com `USER_ADMIN_PASSWORD` para criar, editar, desativar usuarios e vincular areas. | `src/admin/users_app.py`, `admin_web/app.js`, `tests/test_admin_users.py` |

## 3. Requisitos Funcionais Implementados

| ID | Requisito | Status | Evidencia |
|---|---|---|---|
| RF-001 | Autenticar usuario por login/email e senha, retornando bearer token. | Implementado | `POST /api/login`, `AuthenticateUser`, `SimpleTokenService` |
| RF-002 | Retornar dados do usuario atual, incluindo role, areas e flags de permissao. | Implementado | `GET /api/me`, `_serialize_user` |
| RF-003 | Listar indicadores por ano, respeitando papel e areas vinculadas. | Implementado | `GET /api/indicators`, `ListIndicators`, `tests/test_list_indicators_order.py` |
| RF-004 | Calcular valor mensal por `sum`, media ponderada `avg` ou ultimo valor `latest`. | Implementado | `calculate_monthly_value`, `tests/test_rules.py` |
| RF-005 | Listar quatro faixas mensais e valores semanais de um indicador/mes. | Implementado | `GET /api/indicators/{indicator_id}/weekly-values`, `get_month_ranges` |
| RF-006 | Permitir que gestor atualize valores semanais de indicadores das suas areas. | Implementado | `POST /api/indicators/{indicator_id}/weekly-values`, `RegisterIndicatorValue` |
| RF-007 | Registrar historico quando um valor semanal existente muda. | Implementado | `SupabaseIndicatorRepository.upsert_weekly_value`, tabela `indicator_value_history` |
| RF-008 | Permitir que executivo crie, edite e exclua indicadores. | Implementado | `POST/PUT/DELETE /api/indicators`, use cases de indicador |
| RF-009 | Permitir que executivo crie, edite e desative areas com cor opcional. | Implementado | `POST/PUT/DELETE /api/areas`, use cases de area |
| RF-010 | Permitir que executivo liste unidades de indicadores. | Implementado | `GET /api/indicator-units`, tabela `indicator_units` |
| RF-011 | Permitir que executivo crie planos de acao vinculados a indicadores. | Implementado | `POST /api/action-plans`, `CreateActionPlan` |
| RF-012 | Criar tarefa no Bitrix24 ao criar plano de acao, quando webhook estiver configurado. | Implementado | `BitrixTaskGateway`, `BitrixClient` |
| RF-013 | Buscar usuarios Bitrix para autocomplete, usando diretorio Supabase opcional antes do fallback Bitrix. | Implementado | `GET /api/bitrix-users`, `SupabaseBitrixUserDirectory`, `BitrixClient` |
| RF-014 | Permitir meta mensal para executivo, com criacao/atualizacao/exclusao por valor vazio. | Implementado | `POST /api/indicators/{indicator_id}/monthly-target`, `UpsertIndicatorMonthTarget` |
| RF-015 | Permitir valor projetado mensal para usuarios com `can_edit_projected_value`. | Implementado | `POST /api/indicators/{indicator_id}/monthly-projection`, `UpsertIndicatorMonthProjection` |
| RF-016 | Permitir marcar mes como nao aplicavel para indicador da area do gestor. | Implementado | `POST /api/indicators/{indicator_id}/monthly-na`, `SetIndicatorMonthNotApplicable` |
| RF-017 | Permitir criacao de Issue Reports para executivo ou usuario com `can_use_issue_reports`. | Implementado | `POST /api/issue-reports`, `CreateIssueReport` |
| RF-018 | Listar Issue Reports globalmente para executivo e apenas do solicitante para nao executivo. | Implementado | `ListIssueReports`, `tests/test_issue_reports.py` |
| RF-019 | Permitir revisao executiva de Issue Report com GUT executivo e status. | Implementado | `PATCH /api/issue-reports/{issue_id}/executive-review` |
| RF-020 | Permitir soft delete de Issue Reports por executivo. | Implementado | `DELETE /api/issue-reports/{issue_id}`, `soft_delete_issue_report` |
| RF-021 | Permitir gestao de tags de Issue Reports por executivo. | Implementado | `/api/issue-tags`, `/api/issue-reports/{issue_id}/tags` |
| RF-022 | Permitir encerramento local do app pela UI autenticada. | Implementado | `POST /api/system/shutdown`, `web/app.js` |
| RF-023 | Fornecer executavel admin para listar areas/usuarios, criar/editar/desativar usuarios e vincular multiplas areas. | Implementado | `src/admin/users_app.py`, `admin_web/app.js` |
| RF-024 | Gerar executaveis one-file Windows para app principal e admin. | Implementado | `scripts/build_exe.ps1`, `scripts/build_admin_exe.ps1`, specs PyInstaller |

## 4. Requisitos Nao Funcionais Implementados

| ID | Requisito | Status | Evidencia |
|---|---|---|---|
| RNF-001 | Arquitetura Modular Factory/Core-first com separacao entre core, adapters, infra e app. | Implementado estruturalmente | `src/core`, `src/adapters`, `src/infra`, `src/app/wiring.py` |
| RNF-002 | Executavel deve iniciar servidor local, limpar porta ocupada e abrir navegador automaticamente. | Implementado | `src/app/start_server.py` |
| RNF-003 | Build padrao deve gerar executavel sem terminal para duplo clique. | Implementado | `scripts/build_exe.ps1`, `scripts/build_admin_exe.ps1` |
| RNF-004 | App deve carregar `.env` local e, em modo frozen, tambem `.env` empacotado quando existir. | Implementado | `src/infra/config.py`, specs/scripts PyInstaller |
| RNF-005 | Tokens de sessao devem ser assinados por HMAC e expirar por TTL. | Implementado | `SimpleTokenService` |
| RNF-006 | Senhas de usuarios devem ser armazenadas com hash PBKDF2-SHA256. | Implementado | `hash_password`, `verify_password` |
| RNF-007 | Dependencias externas devem ficar atras de ports/adapters. | Implementado | `core/ports`, `adapters/output`, `infra` |
| RNF-008 | Testes devem cobrir calculos, autorizacao, gateway Bitrix, Issue Reports e admin. | Implementado | `tests/` |

## 5. Regras de Negocio Implementadas

| Regra | Descricao | Evidencia |
|---|---|---|
| RN-001 | Usuario inativo nao autentica e nao usa operacoes protegidas. | `ensure_user_active` |
| RN-002 | Gestor atualiza valor semanal apenas de indicadores das suas areas. | `ensure_indicator_in_user_area`, testes |
| RN-003 | Executivo e `executivo_visualizacao` visualizam todos os indicadores; gestor ve areas vinculadas. | `ensure_can_view_indicator`, `ListIndicators` |
| RN-004 | Mes e dividido em quatro faixas: 1-7, 8-14, 15-21, 22-ultimo dia. | `get_month_ranges`, migration `013` |
| RN-005 | Agregacao `avg` e ponderada pelos dias de cada faixa preenchida. | `calculate_monthly_value`, testes |
| RN-006 | Agregacao `latest` usa a ultima faixa preenchida no mes. | `calculate_monthly_value`, testes |
| RN-007 | Tipo de agregacao deve ser `sum`, `avg` ou `latest`. | `ensure_valid_aggregation`, SQL |
| RN-008 | Maturidade do indicador deve estar entre 0 e 100. | `ensure_maturity_level`, SQL |
| RN-009 | Cores de area e tag devem seguir `#RRGGBB`. | `ensure_hex_color_or_none`, SQL |
| RN-010 | Nome ativo de indicador nao deve duplicar outro indicador ativo. | `exists_active_name`, use cases |
| RN-011 | Nome ativo de area nao deve duplicar outra area ativa. | `exists_active_area_name`, SQL |
| RN-012 | Meta mensal nao pode ser negativa. | `UpsertIndicatorMonthTarget` |
| RN-013 | Valor projetado mensal pode ser negativo, mas exige permissao `can_edit_projected_value`. | `UpsertIndicatorMonthProjection`, testes |
| RN-014 | Valores GUT de Issue Report devem estar entre 1 e 5. | `ensure_issue_gut_value` |
| RN-015 | Scores de prioridade de Issue Report sao derivados de GUT. | `CreateIssueReport`, `UpdateIssueReportExecutiveReview`, testes |
| RN-016 | Atualizacao de GUT executivo exige os tres valores juntos. | `UpdateIssueReportExecutiveReview`, testes |
| RN-017 | Status de Issue Report deve pertencer ao conjunto fixo de status em portugues. | `IssueStatus`, `ensure_issue_status` |
| RN-018 | Issue Report e excluido logicamente, nao removido fisicamente. | `soft_delete_issue_report`, SQL |
| RN-019 | Criacao de usuario admin exige senha; update so troca hash se senha for informada. | `AdminUserRepository` |
| RN-020 | Vinculos usuario-area sao deduplicados em `user_area_access`; primeira area tambem fica em `users.area_id`. | `AdminUserRepository.replace_user_areas` |

## 6. Fluxos Principais

1. Usuario inicia `PSC.exe`.
2. Launcher limpa porta `8010` se necessario, inicia FastAPI e abre navegador.
3. Usuario autentica e recebe token.
4. UI carrega indicadores do ano selecionado.
5. Gestor registra valores semanais dos indicadores das suas areas.
6. Executivo gerencia areas, indicadores, metas, planos de acao, Issue Reports e tags.
7. Plano de acao pode buscar responsavel e criar tarefa no Bitrix24.
8. Usuario encerra app pelo botao de shutdown.
9. Admin inicia `PSC-Users-Admin.exe`, autentica com senha local e gerencia usuarios/permissoes.

## 7. Fora do Escopo Deste PRD

- Implementacao, requisitos e arquitetura de `psc-web/`.
- Frontend hospedado em nuvem que possa substituir a UI estatica do executavel.
- Validacao em ambiente real de Supabase ou Bitrix24.
- Deploy de producao alem do executavel local Windows.

## 8. Riscos e Perguntas Abertas

- Os scripts PyInstaller empacotam `.env` por padrao quando ele existe. Isso simplifica uso local, mas aumenta risco de distribuicao com segredo.
- `sql/000_consolidated_schema.sql` parece consolidado ate migration `023`; `024` e `025` podem precisar entrar no consolidado.
- `can_admin_users` existe em SQL, mas o admin observado usa `USER_ADMIN_PASSWORD`; confirmar se a permissao sera usada futuramente.
- O repositorio tinha mudancas nao commitadas antes da atualizacao dos documentos. Esta analise reflete a arvore de trabalho atual.

## 9. Evidencias Principais

| Area | Evidencia |
|---|---|
| Entrada do app | `src/app/main.py`, `src/app/start_server.py`, `PSC.spec` |
| Composicao | `src/app/wiring.py` |
| API | `src/adapters/input/api_routes.py` |
| Dominio | `src/core/domain/models.py`, `src/core/domain/rules.py` |
| Casos de uso | `src/core/use_cases/` |
| Persistencia | `src/adapters/output/supabase_repositories.py`, `sql/` |
| Bitrix24 | `src/adapters/output/bitrix_task_gateway.py`, `src/infra/bitrix_client.py` |
| UI executavel | `web/` |
| Admin executavel | `src/admin/users_app.py`, `admin_web/`, `PSC-Users-Admin.spec` |
| Testes | `tests/` |
