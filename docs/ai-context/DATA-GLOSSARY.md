# Glossario De Dados: PSC

Data: 2026-08-04

| Dado | Significado | Tipo/Forma | Armazenamento | Produtores | Consumidores | Tratamentos/Regras | Sensibilidade | Evidencia |
|---|---|---|---|---|---|---|---|---|
| Usuario | Conta de acesso ao PSC. | `User` / linha `users` | Supabase `users` | Admin local, rotas admin, login Bitrix | Autenticacao, autorizacao, dashboards | `is_active`, `role`, flags e areas vinculadas controlam acesso | Contem email, hash de senha, IDs Bitrix | `src/core/domain/models.py`, `psc-web/src/core/domain/models.ts`, SQL `024`, `025` |
| Papel | Nivel de permissao. | `Role` | `roles`, literais TS/Python | Migrations/admin | Regras de dominio | Roles area-scoped e globais | Baixa | `rules.ts`, `rules.py` |
| Area | Unidade organizacional para indicadores. | `Area` | `areas` | Executivo/admin | Indicadores, usuarios, reports | Nome ativo unico; cor `#RRGGBB` | Baixa | SQL `011`, rotas `areas` |
| Indicador | Medida acompanhada por area. | `Indicator` | `indicators` | Executivo/admin | Dashboard, valores, metas, reports | `aggregation_type`: `sum`, `avg`, `latest`; maturidade 0-100 | Media | `models.ts`, SQL `001`, `009`, `010`, `026` |
| Unidade de indicador | Unidade exibida/calculada. | `IndicatorUnit` | `indicator_units` | Migration/admin | Indicadores | FK opcional em indicador | Baixa | SQL `009`, `010` |
| Valor semanal | Valor informado por faixa mensal. | `IndicatorValue` | `indicator_values` | Gestor | Calculo mensal/anual | Faixas 1-4; gestor apenas areas vinculadas | Media | SQL `013`, `weekly-values` |
| Historico de valor | Auditoria de mudanca de valor semanal. | Linha historica | `indicator_value_history` | Repositorios Supabase | Auditoria | Criado quando valor existente muda | Media | SQL `003` |
| Meta mensal | Valor alvo por indicador/mes. | Numero | `indicator_month_targets` | Executivo | Dashboard | Nao pode ser negativa | Media | SQL `012`, rota `monthly-target` |
| Projecao mensal | Valor projetado por indicador/mes. | Numero | `indicator_month_projections` | Usuarios com permissao | Dashboard | Pode ser negativa; exige `can_edit_projected_value` | Media | SQL `018`, rota `monthly-projection` |
| Mes nao aplicavel | Marcacao para ocultar/ignorar mes. | Boolean por indicador/mes | `indicator_month_not_applicable` | Gestor autorizado | Dashboard | Nao apaga meta/projecao | Baixa | rota `monthly-not-applicable` |
| Plano de acao | Acao corretiva vinculada a indicador. | `ActionPlan` | `action_plans` | Executivo | Dashboard, Bitrix | Pode gerar tarefa Bitrix24 | Media | `create-action-plan`, `bitrix-gateway.ts` |
| Tarefa Bitrix | Tarefa externa associada a plano. | ID externo | Bitrix24 + `bitrix_task_id` | Gateway Bitrix | Usuarios Bitrix | Criada quando webhook configurado | Pode conter dados operacionais | `BitrixTaskGateway` |
| Issue Report | Registro de problema/ocorrencia. | `IssueReport` | `issue_reports` | Usuario autorizado | Executivo, dashboard | GUT solicitante e executivo; status controlado | Media/alta | SQL `020..023`, rotas `issue-reports` |
| Issue Tag | Categoria de Issue Report. | `IssueTag` | `issue_tags`, `issue_report_tags` | Executivo | Issue Reports | Cor `#RRGGBB` opcional | Baixa | SQL `023` |
| Win Report | Registro de ganho/vitoria. | `WinReport` | Tabelas de wins | Usuario autorizado | Executivo, dashboard | Fluxo similar a Issue Reports | Media | SQL `026`, `027`, rotas `wins` |
| Win Tag | Categoria de Win. | `WinTag` | `win_tags`, join wins/tags | Executivo | Wins | Cor opcional | Baixa | rotas `win-tags` |
| Bitrix User | Usuario externo para responsavel/login. | `BitrixUser` | Bitrix24, opcional Supabase | Bitrix API, directory Supabase | Autocomplete, login, tarefas | Fallback Bitrix quando diretorio local nao resolve | Contem email/ID externo | `bitrix-users`, `resolve-bitrix-login` |
| Job de sync | Controle operacional de sincronizacao. | Linha `bitrix_sync_jobs` | Supabase | RPCs/SQL, UI, cron | Edge Functions, dashboards de status | `job_type` isola Comercial/Marketing/Full | Operacional | SQL `028`, `031`, `032` por contexto recente |
| Deal Comercial | Card CRM categoria comercial. | Linha `bitrix_crm_deals` | Supabase materializado | `commercial-sync` | Drill Down Comercial | Sincronizado de Bitrix categoria 0 por padrao | Pode conter dados comerciais | Contexto recente `commercial-sync` |
| Historico de estagio comercial | Movimento de card no funil. | `StageHistory` | `bitrix_crm_stage_history` | Bitrix `crm.stagehistory.list` | Ciclos e agregados | Filtrado por categoria e data | Comercial sensivel | Contexto recente |
| Ciclo comercial | Periodo logico de um deal em processo. | `Cycle` | `bitrix_crm_deal_cycles` | `commercial-sync` | `commercial_drilldown_items` | `cycle_id` deterministico por deal/ciclo | Comercial sensivel | SQL `035`, contexto recente |
| Agregado Comercial | Celula mensal por metrica/responsavel. | Linha agregada | `commercial_drilldown_monthly` | `commercial-sync` | Dashboard | Rebuild por ano/mes conforme sync | Comercial sensivel | Contexto recente |
| Item Comercial | Linha de detalhe que compoe agregado. | Linha detalhe | `commercial_drilldown_items` | `commercial-sync` | Drill down de itens | FK para ciclo; `ON UPDATE CASCADE` recomendado | Comercial sensivel | SQL `035` |
| Deal Marketing | Card dos CRMs 95/125. | Linha `bitrix_marketing_deals` | Supabase | `marketing-sync` | Marketing Drill Down | CRM 125 = `OUTBOUND`; CRM 95 por fonte/tags | Marketing/comercial | Contexto recente |
| Agregado Marketing | Celula mensal por metrica/canal. | Linha agregada | `marketing_drilldown_monthly` | `marketing-sync` | Dashboard Marketing | `conversion_rate`, `leads_generated`, `scheduled_meetings` | Comercial/marketing | SQL `033`, contexto recente |
| Item Marketing | Detalhe de contribuicao por card. | Linha detalhe | `marketing_drilldown_items` | `marketing-sync` | Drilldown por canal/mes | Won conta numerador e `scheduled_meetings` | Comercial/marketing | Contexto recente |
| Config Marketing | Parametros de CRM/canal/metrica. | JSONB por chave | `marketing_drilldown_config` | SQL `033` | Edge Function | CRM 95/125, canal rules, sync mode | Operacional | SQL `033` |
| Secret Cron | URL Supabase e service role usados pelo banco. | Vault secret | Supabase Vault | Admin Supabase | `invoke_edge_function` | Nunca documentar valor | Alta | SQL `034` |

## Observacoes

- Valores secretos de `.env`, `.env.local`, Vault e webhooks Bitrix24 nao foram lidos nem documentados.
- Tabelas de Drill Down recentes aparecem como contexto operacional desta sessao; confirmar presenca das migrations correspondentes no repositorio antes de deploy.
