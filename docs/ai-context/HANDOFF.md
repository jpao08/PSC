# Handoff: PSC

Data: 2026-07-31
Status da sessao: pronto para revisao

## Objetivo

Atualizar por completo o pacote `docs/ai-context/` do projeto `PSC`, incorporando as novidades posteriores ao pacote de `2026-07-11`: `psc-web/`, login Bitrix OAuth, admin web, Wins, planejamento anual, novas permissoes, Drill Down Comercial e Supabase Edge Function.

## Estado Atual

Projeto local:

- Root: `C:\Users\Joao Pedro\Desktop\PROGRAMAS\PSC`
- Branch observada: `feat/CRM_Drill_Down`
- Worktree observado: limpo em `git status --short`
- Commit HEAD observado: `39f3572 feat: add commercial drilldown sync and parity views`

O pacote `docs/ai-context/` existe e contem:

- `README.md`
- `PRD.md`
- `SERVICE-DIAGRAM.md`
- `DATA-GLOSSARY.md`
- `DATA-MODEL.md`
- `HANDOFF.md`
- exports HTML correspondentes para alguns documentos

O pacote de Markdown foi atualizado em lugar. O escopo agora cobre tanto a superficie executavel Python/FastAPI quanto o fork web Next.js em `psc-web/`.

## Novidades Incorporadas no Pacote

- `psc-web/` deixou de ser apenas fora de escopo/incompleto e agora e um fork web em Next.js App Router com TypeScript, Supabase server-side e autenticacao Bitrix OAuth.
- Login web usa fluxo Bitrix OAuth em `psc-web/src/app/api/auth/bitrix/start/route.ts` e `psc-web/src/app/api/auth/bitrix/callback/route.ts`, resolvendo usuario por `bitrix_user_id` e `bitrix_portal_domain`.
- Admin web em `/admin` usa usuario PSC com `role = executivo` ou permissao `can_admin_users`, e provisiona usuario PSC a partir de usuario Bitrix existente.
- Regras de dominio TypeScript adicionaram papeis `gestor_tatico` e `gestor_operacional`, alem de flags `can_edit_indicator_maturity`, `can_use_issue_reports` e `can_admin_users`.
- Indicadores ganharam planejamento anual em `indicator_year_planning`, com `annual_target` e `confidence_level`.
- A UI Next.js inclui abas de indicadores, Drill Down Comercial, Issue Reports e Wins em `psc-web/src/components/DashboardClient.tsx`.
- Wins foram adicionadas com tabelas `wins`, `win_tags` e `win_report_tags`, reutilizando parte da estrutura de Issue Reports, mas com criacao simplificada.
- Drill Down Comercial foi adicionado para dados CRM Bitrix pre-calculados em Supabase, com tabelas `bitrix_crm_*`, `commercial_drilldown_*` e `bitrix_sync_jobs`.
- Rotas Next.js novas para Drill Down Comercial:
  - `GET /api/commercial-drilldown`
  - `GET /api/commercial-drilldown/items`
  - `GET /api/commercial-drilldown/sync-status`
  - `POST /api/commercial-drilldown/sync`
- Sincronizacao comercial roda fora da Vercel em Supabase Edge Function: `supabase/functions/commercial-sync/index.ts`.
- A migration `sql/028_commercial_drilldown_bitrix.sql` declara que clientes PSC leem dados pre-calculados no Supabase e nao chamam Bitrix24 diretamente.

## Atualizacao de Implementacao - 2026-07-31

- Adicionada a migration `sql/029_drilldown_permissions_bitrix_domain_and_financial.sql`.
- Novas permissoes compartilhadas: `can_view_commercial_drilldown`, `can_view_marketing_drilldown`, `can_view_financial_drilldown` e `can_edit_financial_drilldown`.
- Regra aplicada: edicao financeira implica visualizacao financeira, tanto no admin Web quanto na migration.
- `bitrix_portal_domain` agora tem default `tdsustentavel.bitrix24.com.br`, com preenchimento para usuarios Bitrix existentes sem dominio.
- Web manteve arquitetura Vercel-first: rotas Next.js finas para leitura/escrita no Supabase; nenhuma sincronizacao Bitrix longa foi movida para request Vercel.
- Criada base do Drill Down Financeiro manual na Web:
  - `GET /api/financial-drilldown`
  - `POST /api/financial-drilldown/values`
  - repositório Supabase `SupabaseFinancialDrilldownRepository`
  - aba no `DashboardClient` com tabela mensal, primeira coluna fixa, numeros tabulares e edicao controlada por permissao.
- Criadas tabelas financeiras operacionais: `units`, `financial_indicators`, `financial_indicator_values` e `financial_indicator_value_history`.
- Criada Edge Function `supabase/functions/financial-units-sync/index.ts` para sincronizar unidades do SPA Bitrix `entityTypeId=1070/categoryId=0` para a tabela `units`.
- Criada migration `sql/030_sync_financial_indicators_from_indicators.sql` para preencher `financial_indicators` a partir de `indicators` da area financeira `d9dbda82-eb4c-42d7-adce-92499715cd18`, preservando os UUIDs.
- Dashboard principal agora usa fallback financeiro mensal: valor manual em `indicator_values` tem prioridade; quando nao existe valor manual e ha consolidado em `financial_indicator_values`, o valor do Drill Down Financeiro preenche a celula.
- Modal de valores mensais mostra o consolidado atual do Drill Down Financeiro e permite escolher entre preencher manualmente ou usar o consolidado do Drill Down. Ao escolher Drill Down, valores semanais manuais do mes sao removidos para preservar a regra de prioridade.
- Tabela do Drill Down Comercial recebeu largura minima maior para evitar sobreposicao de valores monetarios em zoom.
- Executavel/FastAPI foi alinhado para conhecer e serializar as novas permissoes, preservando PyInstaller/FastAPI e preparando consumo futuro dos mesmos dados materializados.
- Criada base do Drill Down Marketing por canal:
  - `sql/031_marketing_drilldown_bitrix.sql`
  - `supabase/functions/marketing-sync/index.ts`
  - `GET /api/marketing-drilldown`
  - `GET /api/marketing-drilldown/items`
  - `POST /api/marketing-drilldown/sync`
  - aba Marketing no `DashboardClient`.
- Dashboard principal agora tambem aceita fallback mensal de Marketing: valor manual vence; se nao houver manual, usa agregado de `marketing_drilldown_monthly`; `N/A` continua vencendo tudo.
- Marketing usa os indicadores existentes da area `728d3cfa-3770-4882-83ae-a8a1ed86663e`, sem criar indicadores novos.
- A Edge Function `marketing-sync` tem modo `debug: true` para descobrir stages/campos reais dos CRMs `categoryId=95` e `categoryId=125`.
- Marketing foi ajustado para usar CRM 95 + CRM 125: CRM 125 entra como `OUTBOUND`; CRM 95 usa Fonte, com tags `[META]`/`[SEO]` apenas quando a Fonte indica Site/Webform/TD Growth. O indicador `Reunioes Agendadas` manteve o nome do cliente, mas sua regra materializada passou a contar cards Won.
- A migration `sql/033_marketing_crm95_125_won_rules.sql` padroniza as configs do Marketing e adiciona a helper `cancel_running_bitrix_sync_jobs(job_type)` para cancelar jobs travados por tipo.

## Completed

- Lida a skill `handoff-documents`.
- Inventariados arquivos do projeto com `rg --files`, ignorando artefatos gerados.
- Lido o `HANDOFF.md` anterior.
- Lidos `README.md`, `pyproject.toml`, `psc-web/package.json`, `psc-web/README.md`, migrations `026..028`, regras/modelos/ports TypeScript e rotas do Drill Down Comercial.
- Identificado desalinhamento entre o pacote de contexto antigo e a branch atual.
- Atualizados `README.md`, `PRD.md`, `SERVICE-DIAGRAM.md`, `DATA-GLOSSARY.md`, `DATA-MODEL.md` e `HANDOFF.md` em `docs/ai-context/`.
- Mantida a politica de nao registrar valores reais de `.env`/`.env.local`.

## Changed Files

- `docs/ai-context/README.md`: escopo e indice atualizados para incluir `psc-web/`, Edge Function e migrations `024..028`.
- `docs/ai-context/PRD.md`: requisitos, regras, fluxos, riscos e evidencias atualizados para executavel local + fork web.
- `docs/ai-context/SERVICE-DIAGRAM.md`: diagramas Mermaid atualizados para Python, admin local, Next.js, Drill Down Comercial e build/deploy.
- `docs/ai-context/DATA-GLOSSARY.md`: glossario expandido com dados web, Wins, planejamento anual e tabelas comerciais Bitrix/Supabase.
- `docs/ai-context/DATA-MODEL.md`: modelo ER, entidades, contratos e ciclos de vida atualizados.
- `docs/ai-context/HANDOFF.md`: estado operacional desta atualizacao.

## Verification

- `git status --short`: sem saida antes da edicao, indicando worktree limpo naquele momento.
- `git log --oneline --decorate -5`: confirmou `HEAD -> feat/CRM_Drill_Down` em `39f3572`.
- `rg --files`: confirmou existencia de `psc-web/`, SQL ate `031`, Edge Functions `commercial-sync`, `financial-units-sync`, `marketing-sync` e docs `docs/ai-context/`.
- Releitura dos Markdown atualizados recomendada antes de exportar HTML/PDF.
- `npm run typecheck` em `psc-web`: passou.
- `npm test -- --run` em `psc-web`: passou, 2 arquivos e 8 testes.
- `npm run build` em `psc-web`: passou com Next.js/Turbopack; rotas `/api/financial-drilldown`, `/api/financial-drilldown/values`, `/api/marketing-drilldown`, `/api/marketing-drilldown/items` e `/api/marketing-drilldown/sync` aparecem como rotas dinamicas.
- `.venv\Scripts\python.exe -m pytest -q`: passou, 53 testes; apenas warning de depreciacao do pacote `gotrue` via Supabase.
- `deno check supabase\functions\financial-units-sync\index.ts`: nao rodou porque o Deno CLI nao esta instalado no ambiente local/sandbox.
- `deno check supabase\functions\marketing-sync\index.ts`: nao rodou porque o Deno CLI nao esta instalado no ambiente local/sandbox.
- Not run nesta rodada: `ruff check .`, build PyInstaller.

## Decisions and Assumptions

- Decisao: atualizar todos os Markdown de `docs/ai-context/` em lugar, sem recriar a pasta.
- Decisao: registrar `psc-web/` como parte relevante do estado atual, apesar do pacote antigo declarar exclusao.
- Decisao: manter exports HTML existentes sem regenerar automaticamente; a skill recomenda exportar somente apos aprovacao dos Markdown.
- Assumption: a branch `feat/CRM_Drill_Down` e o estado atual que deve orientar a proxima documentacao.
- Assumption: migrations `026`, `027` e `028` representam as novidades posteriores mais importantes no modelo de dados.

## Blockers and Risks

- `docs/ai-context/*.html` podem estar defasados em relacao aos Markdown atuais depois desta edicao.
- Nao foi validado se `sql/000_consolidated_schema.sql` incorpora migrations `024..031`.
- `sql/README.md` parece desatualizado: menciona consolidado + migrations `024` a `026`, mas existem `027` a `031`.
- Variaveis e segredos nao foram lidos; confirmar nomes em `.env.example`/`.env.local.example` se necessario, sem expor valores.
- Financeiro ainda precisa executar/publicar a Edge Function de unidades e conferir o campo de nome real retornado pelo SPA Bitrix. Se o nome nao vier em `title`, configurar `FINANCIAL_UNITS_NAME_FIELD`.
- Marketing ainda precisa rodar debug/sync em producao para validar fontes reais do CRM 95, cards do CRM 125 e stages Won materializados.
- O Executavel ainda nao tem tela/endpoint financeiro completo; nesta rodada recebeu paridade de permissao/contrato para nao divergir da Web.

## Next Steps

1. Revisar os Markdown atualizados em `docs/ai-context/`.
2. Atualizar `sql/README.md` se o time confirmar a ordem oficial para bancos novos com migrations `027` e `028`.
3. Decidir se os HTML exportados devem ser regenerados apos aprovacao dos Markdown.
4. Rodar validacoes quando o objetivo for confirmar codigo: `npm run typecheck`, `npm run test`, `npm run build` dentro de `psc-web`; `pytest` e `ruff check .` na raiz Python.

## Useful Context

- App Python local: `python -m app.start_server --reload --env-file .env --port 8010`
- Admin Python local: `psc-users-admin --env-file .env --port 8020`
- Next.js local: `cd psc-web` depois `npm run dev`
- Validacao Next.js: `npm run typecheck`, `npm run test`, `npm run build`
- Validacao Python: `pytest`, `ruff check .`
- Edge Function comercial: `supabase/functions/commercial-sync/index.ts`
- Edge Function unidades financeiras: `supabase/functions/financial-units-sync/index.ts`
- Edge Function Marketing: `supabase/functions/marketing-sync/index.ts`
- Migration comercial: `sql/028_commercial_drilldown_bitrix.sql`
- Migration financeira: `sql/029_drilldown_permissions_bitrix_domain_and_financial.sql`
- Migration espelho de indicadores financeiros: `sql/030_sync_financial_indicators_from_indicators.sql`
- Migration Marketing: `sql/031_marketing_drilldown_bitrix.sql`
- Migration ajuste Marketing CRM 95/125: `sql/033_marketing_crm95_125_won_rules.sql`
- Rotas comerciais Next.js:
  - `psc-web/src/app/api/commercial-drilldown/route.ts`
  - `psc-web/src/app/api/commercial-drilldown/items/route.ts`
  - `psc-web/src/app/api/commercial-drilldown/sync/route.ts`
  - `psc-web/src/app/api/commercial-drilldown/sync-status/route.ts`
