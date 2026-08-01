# Contexto IA: PSC

Data: 2026-07-31
Status: pacote atualizado por analise estatica do repositorio local.

## Objetivo

Esta pasta reune contexto tecnico e de produto para que uma IA ou pessoa desenvolvedora continue o PSC sem redescobrir arquitetura, regras, dados e riscos. O pacote cobre o estado atual da branch `feat/CRM_Drill_Down`.

## Stack Detectada

- Python 3.11+, FastAPI, Uvicorn, Supabase/Postgres e Bitrix24 para a aplicacao executavel local.
- UI estatica sem build em `web/` e `admin_web/`, empacotada com PyInstaller.
- Next.js App Router, TypeScript, React, Supabase server-side, Bitrix OAuth, Bitrix webhook e Vitest em `psc-web/`.
- Supabase Edge Functions em Deno/TypeScript para sincronizacao do Drill Down Comercial e unidades financeiras.
- pytest e ruff para validacao Python; `npm run typecheck`, `npm run test` e `npm run build` para validacao Next.js.

## Escopo Analisado

Incluido:

- Backend Python em `src/`.
- Executaveis Windows `PSC.exe` e `PSC-Users-Admin.exe`.
- UI estatica principal em `web/`.
- UI estatica administrativa em `admin_web/`.
- Fork web Next.js em `psc-web/`.
- Supabase Edge Functions `supabase/functions/commercial-sync/` e `supabase/functions/financial-units-sync/`.
- Scripts/specs de build com PyInstaller.
- Schemas e migrations SQL em `sql/`, incluindo `026`, `027` e `028`.
- Testes Python em `tests/` e testes Vitest em `psc-web/tests/`.

Excluido:

- Valores reais de `.env` e `.env.local`. Somente nomes de variaveis foram registrados quando estavam em exemplos ou codigo.
- Artefatos gerados como `dist/`, `build/`, `.venv/`, `.next/`, `node_modules/`, caches e lockfile bodies.
- Validacao contra Supabase/Bitrix24 reais.

## Documentos

- [PRD.md](PRD.md): produto implementado, requisitos, regras, fluxos, riscos e evidencias.
- [SERVICE-DIAGRAM.md](SERVICE-DIAGRAM.md): diagramas Mermaid do executavel, do fork Next.js e da sincronizacao comercial.
- [DATA-GLOSSARY.md](DATA-GLOSSARY.md): glossario de dados, origem, consumidores, validacoes e sensibilidade.
- [DATA-MODEL.md](DATA-MODEL.md): modelo de dados, entidades, relacoes, ciclos de vida e contratos.
- [HANDOFF.md](HANDOFF.md): resumo operacional para a proxima sessao.

## Fontes Inspecionadas

- `README.md`
- `pyproject.toml`
- `PSC.spec`
- `PSC-Users-Admin.spec`
- `scripts/build_exe.ps1`
- `scripts/build_admin_exe.ps1`
- `src/app/main.py`
- `src/app/start_server.py`
- `src/app/wiring.py`
- `src/admin/users_app.py`
- `src/adapters/input/api_routes.py`
- `src/adapters/output/supabase_repositories.py`
- `src/adapters/output/bitrix_task_gateway.py`
- `src/adapters/output/supabase_bitrix_user_directory.py`
- `src/core/domain/models.py`
- `src/core/domain/rules.py`
- `src/core/ports/repositories.py`
- `src/core/use_cases/`
- `web/`
- `admin_web/`
- `psc-web/README.md`
- `psc-web/package.json`
- `psc-web/src/app/api/`
- `psc-web/src/components/DashboardClient.tsx`
- `psc-web/src/components/AdminClient.tsx`
- `psc-web/src/core/domain/models.ts`
- `psc-web/src/core/domain/rules.ts`
- `psc-web/src/core/ports/repositories.ts`
- `psc-web/src/adapters/output/supabase-repositories.ts`
- `psc-web/src/adapters/output/bitrix-gateway.ts`
- `psc-web/src/composition/build-container.ts`
- `psc-web/src/infra/env.ts`
- `psc-web/src/infra/session.ts`
- `supabase/functions/commercial-sync/index.ts`
- `supabase/functions/financial-units-sync/index.ts`
- `supabase/functions/marketing-sync/index.ts`
- `sql/README.md`
- `sql/000_consolidated_schema.sql`
- `sql/024_add_bitrix_identity_to_users.sql`
- `sql/025_add_user_admin_permission.sql`
- `sql/026_wins_and_indicator_maturity_permission.sql`
- `sql/027_roles_annual_confidence_and_simple_wins.sql`
- `sql/028_commercial_drilldown_bitrix.sql`
- `sql/029_drilldown_permissions_bitrix_domain_and_financial.sql`
- `sql/030_sync_financial_indicators_from_indicators.sql`
- `sql/031_marketing_drilldown_bitrix.sql`
- `tests/`
- `psc-web/tests/`

## Ordem Recomendada Para Proxima Sessao

1. Ler `HANDOFF.md` para ver estado, riscos e comandos.
2. Ler `PRD.md` para entender escopo funcional atual.
3. Ler `SERVICE-DIAGRAM.md` para entender fronteiras entre Python, Next.js, Supabase, Bitrix24 e Edge Function.
4. Ler `DATA-MODEL.md` antes de alterar SQL, repositories ou rotas.
5. Consultar `DATA-GLOSSARY.md` durante implementacao para preservar nomes, validacoes e sensibilidade.

## Gaps e Assumptions

- Assumption: branch `feat/CRM_Drill_Down` e o estado que deve ser documentado agora.
- Analise foi estatica; testes, builds e runtime nao foram executados nesta atualizacao.
- `sql/README.md` ainda menciona aplicacao do consolidado mais migrations `024` a `026`, mas existem `027` e `028`; precisa revisao.
- `sql/000_consolidated_schema.sql` declara consolidar `001..023`; migrations `024..028` continuam incrementais.
- HTMLs em `docs/ai-context/*.html` podem estar defasados e devem ser regenerados somente apos aprovacao dos Markdown.
