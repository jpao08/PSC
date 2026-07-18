# Glossario de Dados: PSC Executavel

Data: 2026-07-11
Escopo: aplicacao executavel PSC e modulo executavel de administracao de usuarios. `psc-web/` esta fora do escopo.

## Glossario

| Dado | Significado | Tipo/formato | Armazenamento | Produtores | Consumidores | Tratamentos | Validacao/seguranca | Evidencia |
|---|---|---|---|---|---|---|---|---|
| Usuario | Pessoa autenticavel no PSC. | `User`; linha em `users`. | Supabase `users`. | Admin executavel, seed/migrations. | Auth, indicadores, Issue Reports, admin. | Login/email normalizado; `area_ids` carregado de `user_area_access`; primeira area espelhada em `area_id`. | Senha sempre como hash; usuario precisa estar ativo; role valida. | `models.py`, `rules.py`, `users_app.py`, `supabase_repositories.py` |
| Papel | Categoria de permissao. | `gestor_area`, `executivo`, `executivo_visualizacao`. | Supabase `roles`; `users.role`. | SQL migrations. | Regras de autorizacao. | Checagens literais em use cases e regras. | Role invalida e rejeitada. | `models.py`, `rules.py`, SQL |
| Area | Unidade organizacional dona de indicadores e acessos. | `Area`; `id`, `name`, `hex_color`, `is_active`. | Supabase `areas`. | Endpoints executivos, seed SQL. | Indicadores, filtros, usuarios, Issue Reports. | Ordenada por nome; desativacao via `is_active`. | Nome obrigatorio; unicidade de area ativa; cor `#RRGGBB`. | `CreateArea`, `UpdateArea`, repository |
| Acesso usuario-area | Vinculo muitos-para-muitos entre usuarios e areas. | `(user_id, area_id)`. | Supabase `user_area_access`. | Admin executavel. | Autorizacao e filtro de indicadores. | Deduplicado; carregado em `User.area_ids`. | Cascade em delete de usuario/area. | `users_app.py`, `SupabaseUserRepository`, SQL |
| Unidade de indicador | Unidade de medida exibida no indicador. | `IndicatorUnit`; `code`, `label`. | Supabase `indicator_units`. | SQL. | Cadastro/listagem de indicadores. | Apenas unidades ativas sao listadas. | Obrigatoria no cadastro/edicao de indicador. | `IndicatorUnit`, `list_units`, `CreateIndicator` |
| Indicador | KPI acompanhado por area. | `Indicator`, `NewIndicator`, `IndicatorTableRow`. | Supabase `indicators`. | Executivo. | Dashboard, valores, metas, projecoes, planos. | Enriquecido com area e unidade; listagem usa ativos. | `aggregation_type` em `sum/avg/latest`; maturidade 0..100; nome ativo unico. | `models.py`, use cases, SQL |
| Valor semanal | Valor numerico de uma faixa mensal do indicador. | `IndicatorValue`; ano/mes/faixa/valor/usuario. | Supabase `indicator_values`. | Gestor de area. | Calculo mensal e dashboard. | Upsert por `indicator_id/year/month/week_number`; string vira Decimal. | Mes 1..12; faixa 1..4 na logica atual. | `RegisterIndicatorValue`, rotas, regras |
| Historico de valor | Auditoria de alteracao de valor semanal. | Valor anterior/novo e usuario. | Supabase `indicator_value_history`. | Repository ao alterar valor existente. | Auditoria e rastreio. | Criado apenas quando valor muda. | Referencia indicador e usuario alterador. | `upsert_weekly_value`, SQL |
| Meta mensal | Meta executiva de um indicador no mes. | `IndicatorMonthTarget`. | Supabase `indicator_month_targets`. | Executivo. | Dashboard e comparacao abaixo da meta. | Valor vazio remove meta. | Valor nao pode ser negativo. | `UpsertIndicatorMonthTarget`, testes |
| Projecao mensal | Valor projetado mensal. | `IndicatorMonthProjection`. | Supabase `indicator_month_projections`. | Usuario com permissao. | Dashboard e planejamento. | Valor vazio remove projecao. | Exige `can_edit_projected_value`; negativo permitido. | `UpsertIndicatorMonthProjection`, testes |
| Mes nao aplicavel | Marcacao de que um indicador nao se aplica em determinado mes. | `IndicatorMonthNotApplicable`. | Supabase `indicator_month_not_applicable`. | Gestor da area. | Dashboard mensal. | Quando marcado, valor mensal real fica `None`; meta/projecao permanecem. | Gestor deve ter acesso ao indicador. | `SetIndicatorMonthNotApplicable`, `ListIndicators`, testes |
| Plano de acao | Acao corretiva vinculada a indicador. | `ActionPlan`, `NewActionPlan`. | Supabase `action_plans`. | Executivo. | UI, historico, Bitrix24. | Pode criar tarefa Bitrix e guardar `bitrix_task_id`. | Executivo apenas; campos textuais obrigatorios; responsavel obrigatorio. | `CreateActionPlan`, `BitrixTaskGateway` |
| Historico de plano | Evento de auditoria do plano de acao. | `ActionPlanHistoryEvent`. | Supabase `action_plan_history`. | Use case de plano. | Auditoria. | Evento de criacao coberto por testes. | Referencia plano e criador. | `CreateActionPlan`, testes |
| Usuario Bitrix | Responsavel candidato para plano de acao. | `BitrixUser`; `id`, `name`, `email`. | Diretorio Supabase opcional ou API Bitrix. | `SupabaseBitrixUserDirectory`, `BitrixClient`. | Autocomplete e atribuicao de tarefa. | Busca local normaliza acentos; fallback varre usuarios ativos Bitrix. | Webhook nao documentado com valor. | `bitrix_task_gateway.py`, `bitrix_client.py`, testes |
| Issue Report | Registro de problema/ocorrencia/oportunidade. | `IssueReport`, `NewIssueReport`. | Supabase `issue_reports`. | Usuarios com permissao. | Lista de issues e revisao executiva. | Scores GUT calculados; campos legados e novos sao mapeados. | Permissao necessaria; GUT 1..5; soft delete. | `CreateIssueReport`, `ListIssueReports`, repository |
| Status de Issue | Estado de workflow da issue. | Texto de conjunto fixo em portugues. | `issue_reports.status`. | Executivo. | UI de Issue Reports. | Validado antes de update. | Status invalido rejeitado. | `IssueStatus`, `ensure_issue_status` |
| Tag de Issue | Marcador classificatorio da issue. | `IssueTag`; nome/cor/ativo. | Supabase `issue_tags`. | Executivo. | Filtro e exibicao de Issue Reports. | Desativada por `is_active`; nome ativo unico. | Nome obrigatorio; cor `#RRGGBB`. | Rotas, SQL `023` |
| Vinculo Issue-Tag | Relacao muitos-para-muitos entre issue e tag. | `(issue_id, tag_id)`. | Supabase `issue_report_tags`. | Executivo. | Serializacao de Issue Reports. | Semantica de substituicao total ao salvar tags. | Referencia issue e tag. | `replace_issue_tags`, SQL `023` |
| Token de sessao | Credencial bearer de autenticacao. | Payload/signature base64url. | Local storage do navegador; sem persistencia server-side. | `SimpleTokenService`. | Autenticacao API. | HMAC-SHA256 com `sub` e `exp`. | Usa `APP_SECRET_KEY`; TTL configuravel no app e fixo 720 no admin. | `SimpleTokenService`, `web/app.js`, `admin_web/app.js` |
| Configuracoes de ambiente | Parametros de runtime. | Variaveis de ambiente. | `.env`, `.env` empacotado, process env. | Usuario/ambiente. | Settings, Supabase, Bitrix, tokens, admin. | Carrega `.env` local; em frozen tambem verifica `.env` empacotado. | Valores secretos nao devem ser documentados. | `src/infra/config.py`, `.env.example` |

## Variaveis de Ambiente Conhecidas

Valores nao foram lidos nem registrados.

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
- Aliases de compatibilidade: `USERS_SUPABASE_URL`, `SUPABASE_USERS_SERVICE_ROLE_KEY`, `USERS_SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
