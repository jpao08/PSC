# Glossario de Dados: PSC

Data: 2026-07-31
Escopo: dados usados pelo executavel local, admin local, `psc-web/` e Drill Down Comercial.

## Glossario

| Dado | Significado | Tipo/formato | Armazenamento | Produtores | Consumidores | Tratamentos | Validacao/seguranca | Evidencia |
|---|---|---|---|---|---|---|---|---|
| Usuario PSC | Pessoa autorizada no PSC. | `User`; linha em `users`. | Supabase `users`. | Admin local, admin web, seed/migrations. | Auth, indicadores, issues, wins, drilldown, admin. | `areaIds` carregado de `user_area_access`; identidade Bitrix opcional. | Usuario ativo exigido; senha local como hash; service role apenas server-side no web. | `models.py`, `models.ts`, repositories |
| Identidade Bitrix | Vinculo entre usuario PSC e usuario Bitrix. | `bitrix_user_id`, `bitrix_portal_domain`, `last_login_at`. | `users`. | Login OAuth e admin web. | Auth web e provisionamento. | Resolve usuario por id e dominio do portal. | Usuario sem vinculo ativo recebe acesso negado. | `sql/024`, `ResolveBitrixLogin`, auth callback |
| Papel | Perfil de permissao do usuario. | `gestor_area`, `gestor_tatico`, `gestor_operacional`, `executivo`, `executivo_visualizacao`. | `roles`, `users.role`. | SQL/admin. | Regras de acesso. | Separado em roles por area e roles globais. | Role invalida rejeitada. | `rules.ts`, `sql/027` |
| Permissoes do usuario | Flags granulares alem do papel. | Booleanos. | `users`. | Admin local/web e migrations. | Regras de UI/API. | `can_edit_projected_value`, `can_edit_indicator_maturity`, `can_use_issue_reports`, `can_admin_users`, `can_view_*_drilldown`, `can_edit_financial_drilldown`. | Cada rota valida a flag necessaria; edicao financeira implica visualizacao financeira. | `rules.py`, `rules.ts`, SQL `020`, `025`, `026`, `029` |
| Area | Unidade organizacional. | `Area`; `id`, `name`, `hex_color`, `is_active`. | `areas`. | Executivo/admin. | Indicadores, filtros, usuarios, issues, wins. | Desativacao logica via `is_active`. | Nome obrigatorio; cor `#RRGGBB`; nome ativo unico. | Repositories, SQL |
| Acesso usuario-area | Vinculo multi-area. | `(user_id, area_id)`. | `user_area_access`. | Admin local/web. | Autorizacao e filtros. | Deduplicado; primeira area pode espelhar `users.area_id`. | FK para usuario/area. | repositories Python/TS |
| Unidade de indicador | Unidade de medida do KPI. | `IndicatorUnit`; `code`, `label`. | `indicator_units`. | SQL. | Cadastro e exibicao de indicadores. | Apenas ativos listados. | Unidade obrigatoria no web para indicador. | `listUnits`, SQL `009`, `010` |
| Indicador | KPI acompanhado por area. | `Indicator`; `IndicatorTableRow`. | `indicators`. | Executivo/admin web. | Dashboard, planejamento, planos. | Enriquecido com area, cor, unidade, maturidade e calculos anuais. | `aggregation_type` em `sum/avg/latest`; maturidade 0..100. | models/repositories Python/TS |
| Valor semanal | Valor informado para faixa do mes. | Ano, mes, faixa 1..4, numero. | `indicator_values`. | Gestor de area. | Calculo mensal/anual. | Upsert por `indicator_id/year/month/week_number`. | Mes 1..12; faixa 1..4; acesso por area. | use cases, `rules.ts` |
| Historico de valor | Auditoria de mudanca de valor semanal. | Valor anterior/novo e usuario. | `indicator_value_history`. | Repository Python ao alterar valor. | Auditoria. | Criado quando valor existente muda. | FK para indicador/usuario. | `supabase_repositories.py`, SQL `003` |
| Meta mensal | Meta por indicador, ano e mes. | Numero nao negativo. | `indicator_month_targets`. | Executivo. | Dashboard e comparacao. | Valor vazio remove meta. | Nao pode ser negativa. | `UpsertIndicatorMonthTarget`, routes |
| Projecao mensal | Valor projetado por indicador, ano e mes. | Numero, pode ser negativo. | `indicator_month_projections`. | Usuario com permissao. | Dashboard e planejamento. | Valor vazio remove projecao. | Exige `can_edit_projected_value`. | `UpsertIndicatorMonthProjection`, routes |
| Mes nao aplicavel | Marcacao N/A para indicador/mes. | `(indicator_id, year, month)`. | `indicator_month_not_applicable`. | Gestor com acesso. | Dashboard. | Oculta valor real mensal sem apagar meta/projecao. | Acesso ao indicador exigido. | `SetIndicatorMonthNotApplicable` |
| Planejamento anual | Meta anual e confianca por indicador/ano. | `annual_target`, `confidence_level`. | `indicator_year_planning`. | Web/API. | Dashboard anual. | Upsert por `indicator_id/year`. | Confianca 0..100; ano 2000..2100. | `sql/027`, `annual-planning` route |
| Classificacao de performance | Label derivado de percentual. | `neutral`, `not_reliable`, `fragile`, `functional`, `reliable`, `strategic`. | Derivado, nao tabela dedicada. | Regras TS. | UI dashboard. | Calculado por faixas numericas. | Null vira `neutral`. | `classifyPerformance`, `rules.test.ts` |
| Plano de acao | Acao corretiva vinculada a indicador. | `ActionPlan`. | `action_plans`. | Executivo. | UI, historico, Bitrix. | Pode criar tarefa Bitrix e guardar `bitrix_task_id`. | Campos obrigatorios; acesso executivo/admin. | `CreateActionPlan`, repositories |
| Historico de plano | Eventos de auditoria de plano. | `event_type`, `event_description`. | `action_plan_history`. | Use case/repository. | Auditoria. | Evento de criacao registrado. | FK para plano e usuario. | tests, repositories |
| Usuario Bitrix | Pessoa do Bitrix usada em autocomplete e login. | `BitrixUser`; id, nome, email, portal. | API Bitrix ou tabelas `bitrix_crm_users`/diretorio opcional. | Bitrix API, Edge Function, admin web. | Login, tarefas, responsaveis comerciais. | Nome completo normalizado; id como texto. | Segredos Bitrix ficam em env/server. | gateways, Edge Function |
| Issue Report | Registro de ocorrencia/problema com GUT. | `IssueReport`. | `issue_reports`. | Usuarios com permissao. | Dashboard de issues e revisao executiva. | GUT e scores multiplicativos; tags many-to-many. | `can_use_issue_reports` ou executivo; soft delete. | use cases, repositories, tests |
| Tag de Issue | Marcador para Issue Reports. | Nome/cor/ativo. | `issue_tags`, `issue_report_tags`. | Executivo. | Filtro e categorizacao. | Salvar tags substitui vinculos. | Nome obrigatorio; cor `#RRGGBB`; soft deactivate. | SQL `023`, routes |
| Win | Registro positivo/simplificado reutilizando estrutura de issue. | `WinReport`. | `wins`. | Usuarios com permissao. | Aba Wins e revisao executiva. | Criacao simplificada usa defaults GUT/narrativa. | Soft delete; area ou "Outras". | SQL `026`, `027`, routes `/api/wins` |
| Tag de Win | Marcador para Wins. | Nome/cor/ativo. | `win_tags`, `win_report_tags`. | Executivo/admin. | Filtro e categorizacao de Wins. | Salvar tags substitui vinculos. | Nome obrigatorio; cor `#RRGGBB`. | SQL `026`, routes `/api/win-tags` |
| Deal Bitrix CRM | Card/negocio comercial do Bitrix. | `bitrix_deal_id`, titulo, categoria, stage, responsavel, valor. | `bitrix_crm_deals`. | Edge Function. | Drill Down Comercial. | Upsert por id; `last_seen_at`, `synced_at`. | Service role e webhook em ambiente Supabase. | SQL `028`, Edge Function |
| Usuario CRM Bitrix | Usuario sincronizado do Bitrix para responsavel comercial. | `bitrix_user_id`, nome, email, ativo. | `bitrix_crm_users`. | Edge Function. | Drill Down Comercial. | Upsert por id. | Email pode ser null; active boolean. | SQL `028`, Edge Function |
| Stage CRM | Etapa de funil do Bitrix. | `stage_id`, `category_id`, nome, semantic. | `bitrix_crm_stages`. | Edge Function. | Calculo de metricas comerciais. | Upsert por `stage_id/category_id`. | Categoria e semantic normalizados. | SQL `028`, Edge Function |
| Historico de stage | Movimentacoes de deal entre stages. | `bitrix_history_id`, deal, stage, data. | `bitrix_crm_stage_history`. | Edge Function. | Ciclos e metricas de fluxo. | Filtra por categoria e data de inicio. | FK para deal. | SQL `028`, Edge Function |
| Snapshot de deal | Estado do deal numa data de captura. | `snapshot_date + bitrix_deal_id`. | `bitrix_crm_deal_snapshots`. | Edge Function. | Metricas de estoque. | Captura estado corrente diario. | FK para deal. | SQL `028`, Edge Function |
| Ciclo de deal | Periodo de vida/reactivacao de deal. | `cycle_id`, `cycle_number`, inicio/fim. | `bitrix_crm_deal_cycles`. | Edge Function. | Evitar dupla contagem por ciclo. | Reconstruido a partir de historico/stage semantic. | Unique por deal/ciclo. | Edge Function |
| Config comercial | Parametros de metricas e grupos de stages. | JSONB por chave. | `commercial_drilldown_config`. | SQL `028`. | RPCs e Edge Function. | Inclui timezone, categoria, metricas, stage groups e template de URL. | Config alterada muda leitura/calculo. | SQL `028` |
| Agregado comercial mensal | Valor materializado por ano, mes, metrica e responsavel. | Quantidade ou dinheiro. | `commercial_drilldown_monthly`. | Edge Function. | Dashboard Drill Down. | Flow usa soma anual; stock usa media mensal. | Ano >= 2026; mes 1..12; unique por celula. | SQL `028`, RPC dashboard |
| Item comercial | Detalhe de cards que compoem uma celula comercial. | Deal, ciclo, datas, contribuicoes. | `commercial_drilldown_items`. | Edge Function. | Drilldown de detalhe/paginacao. | Busca por deal/titulo; pagina ate 100. | FK para deal e ciclo. | SQL `028`, RPC items |
| Job de sync Bitrix | Controle de sincronizacao comercial. | `pending`, `running`, `completed`, `failed`, `cancelled`. | `bitrix_sync_jobs`. | RPC `start_commercial_sync`, Edge Function. | UI de status e worker. | Atualiza etapa, cursor, contadores e erro. | Unique ativo impede sync concorrente. | SQL `028`, Edge Function |
| Unidade financeira | Unidade operacional para indicadores financeiros. | `FinancialUnit`; nome e IDs SPA Bitrix. | `units`. | Edge Function `financial-units-sync` ou carga manual. | Drill Down Financeiro. | Apenas ativas entram no dashboard; `bitrix_spa_item_id` permite reconciliacao com SPA `entityTypeId=1070/categoryId=0`. | Sync Bitrix roda fora de request Vercel. | SQL `029`, `SupabaseFinancialDrilldownRepository`, Edge Function |
| Indicador financeiro | Medida financeira mensal. | `FinancialIndicator`; `value_type`, `aggregation_type`. | `financial_indicators`, espelhado de `indicators`. | Migration `030` a partir da area financeira `d9dbda82-eb4c-42d7-adce-92499715cd18`. | Drill Down Financeiro. | Preserva o mesmo UUID de `indicators`; ordenado por `display_order`; suporta numero, percentual e monetario. | Indicador inativo nao aparece. | SQL `029`, SQL `030`, models TS |
| Valor financeiro mensal | Valor manual por unidade, indicador e mes. | Numero ou null. | `financial_indicator_values`. | Usuario com edicao financeira. | Drill Down Financeiro e consolidacao futura. | Upsert por indicador/unidade/mes; zero e valor valido, null e vazio. | Backend valida permissao; auditoria por trigger. | SQL `029`, `/api/financial-drilldown/values` |
| Historico financeiro | Auditoria de alteracao dos valores financeiros. | Operacao, valor antigo/novo, usuario. | `financial_indicator_value_history`. | Trigger SQL. | Auditoria. | Registra insert/update/delete sem depender da tela. | FK para valor, indicador, unidade e usuario quando aplicavel. | SQL `029` |
| Card Marketing Bitrix | Card dos CRMs 95 ou 125 usado no Drill Down Marketing. | Deal id, categoria, etapa, canal, datas. | `bitrix_marketing_deals`. | Edge Function `marketing-sync`. | Drill Down Marketing. | CRM 125 vira `OUTBOUND`; CRM 95 usa Fonte, e tags `[META]`/`[SEO]` apenas quando a Fonte indica Site/Webform/TD Growth; vazio ou desconhecido vira `Outros`. | Bitrix nao e chamado pela Vercel. | SQL `031`, `033`, Edge Function |
| Agregado Marketing mensal | Resultado por metrica, mes e canal. | Quantidade ou percentual. | `marketing_drilldown_monthly`. | Edge Function `marketing-sync`. | Aba Marketing e fallback do Dashboard. | `Taxa de Conversao` usa numerador/denominador; nao soma percentuais por canal. | Denominador zero vira vazio. | SQL `031`, repository TS |
| Item Marketing | Card/evento que compoe uma celula de Marketing. | Deal, canal, stage, data, contribuicoes. | `marketing_drilldown_items`. | Edge Function `marketing-sync`. | Painel lateral de drilldown. | Inclui contribuições de quantidade, numerador ou denominador. | FK para `bitrix_marketing_deals`. | SQL `031`, routes `/api/marketing-drilldown/items` |
| Sessao Python | Bearer token stateless. | HMAC base64url com `sub` e `exp`. | Local storage do browser. | `SimpleTokenService`. | APIs FastAPI. | TTL configuravel. | `APP_SECRET_KEY` necessario. | Python token service |
| Sessao Next.js | Cookie de sessao web. | JWT HS256. | Cookie `psc_session` HTTP-only. | `issueSession`. | Rotas Next.js. | TTL de 12h; secure em producao. | `APP_SESSION_SECRET` necessario. | `psc-web/src/infra/session.ts` |
| Configuracoes Python | Parametros da aplicacao local. | Env vars. | `.env`, process env, bundle PyInstaller opcional. | Operador local. | Settings, Supabase, Bitrix, tokens. | `.env` carregado local/frozen. | Nao documentar valores. | `src/infra/config.py`, `.env.example` |
| Configuracoes Next.js | Parametros web server-side. | Env vars. | `.env.local`, Vercel env. | Operador/deploy. | Supabase, Bitrix OAuth, sessao. | Server routes leem env. | `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser `NEXT_PUBLIC_`. | `psc-web/.env.example`, `env.ts` |

## Variaveis de Ambiente Conhecidas

Valores reais nao foram lidos nem registrados.

Python/local:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `BITRIX_WEBHOOK_URL`
- `APP_SECRET_KEY`
- `SUPABASE_USERS_URL`
- `SUPABASE_USERS_KEY`
- `SUPABASE_USERS_TABLE`
- `APP_TOKEN_TTL_MINUTES`
- `LOG_LEVEL`
- `USER_ADMIN_PASSWORD`
- Aliases observados: `USERS_SUPABASE_URL`, `SUPABASE_USERS_SERVICE_ROLE_KEY`, `USERS_SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Next.js/web:

- `NEXT_PUBLIC_APP_URL`
- `APP_SESSION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BITRIX_CLIENT_ID`
- `BITRIX_CLIENT_SECRET`
- `BITRIX_PORTAL_URL`
- `BITRIX_OAUTH_TOKEN_URL`
- `BITRIX_WEBHOOK_URL`
- Comentadas/futuras: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Supabase Edge Function comercial:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BITRIX_WEBHOOK_URL`
- `COMMERCIAL_SYNC_SINCE`
- `COMMERCIAL_BITRIX_CATEGORY_ID`
- `COMMERCIAL_SYNC_STALE_MINUTES`

Supabase Edge Function de unidades financeiras:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BITRIX_WEBHOOK_URL`
- `FINANCIAL_UNITS_ENTITY_TYPE_ID`, default `1070`
- `FINANCIAL_UNITS_CATEGORY_ID`, default `0`
- `FINANCIAL_UNITS_NAME_FIELD`, opcional para campo customizado de nome
- `FINANCIAL_UNITS_ACTIVE_FIELD`, opcional para campo customizado de ativo/inativo
- `FINANCIAL_UNITS_FILTER_BY_CATEGORY`, default `false`
- `FINANCIAL_UNITS_DEACTIVATE_MISSING`, default `true`

Supabase Edge Function de Marketing:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BITRIX_WEBHOOK_URL`
- `MARKETING_SYNC_SINCE`, default `2026-01-01T00:00:00-03:00`
- `MARKETING_SOURCE_CATEGORY_ID`, default `95`
- `MARKETING_OUTBOUND_CATEGORY_ID`, default `125`
- `MARKETING_CRM95_CHANNEL_FIELD`, default `sourceId`
- `MARKETING_CREATED_SINCE`, default igual a `MARKETING_SYNC_SINCE`
- `MARKETING_SYNC_STALE_MINUTES`, default `10`
