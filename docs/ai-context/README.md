# Contexto IA: PSC

Data: 2026-08-04
Status: atualizado para o projeto completo verificado nesta sessao.

## Objetivo

Esta pasta reune contexto tecnico e de produto para uma proxima sessao de IA ou pessoa desenvolvedora continuar o PSC sem redescobrir arquitetura, regras, dados e riscos operacionais.

O pacote foi atualizado em lugar dentro de `docs/ai-context/`. Os arquivos `.html` existentes sao exportacoes antigas e nao foram regenerados nesta etapa.

## Escopo Analisado

Incluido:

- Aplicacao Python/FastAPI empacotavel como executavel Windows: `src/`, `web/`, `admin_web/`, `scripts/`, `PSC.spec`, `PSC-Users-Admin.spec`.
- Aplicacao Next.js/React em `psc-web/`, incluindo rotas API, dominio, adapters Supabase e componentes de dashboard/admin.
- Migrations SQL presentes no filesystem em `sql/000..027`.
- Contexto recente do trabalho em Drill Downs Comercial/Marketing, Edge Functions e crons, a partir da conversa e abas abertas pelo usuario.
- Testes e comandos observados em `tests/` e `psc-web/tests/`.

Excluido:

- Valores reais de `.env`, `.env.local` e secrets. Somente nomes de variaveis foram documentados quando relevantes.
- Artefatos gerados como `.venv/`, `dist/`, `build/`, caches e exports HTML antigos.

## Stack Detectada

- Python 3.11+ com FastAPI, Uvicorn, pytest, ruff e PyInstaller.
- Next.js 16, React 19, TypeScript, Vitest e Supabase JS em `psc-web/`.
- Supabase/Postgres como persistencia principal.
- Supabase Edge Functions para sincronizacoes Bitrix24.
- Bitrix24 via webhook/API REST.
- `pg_cron`, `pg_net` e Supabase Vault para crons no banco.

## Fontes Inspecionadas

- `README.md`, `pyproject.toml`, `PSC.spec`, `PSC-Users-Admin.spec`.
- `src/app/`, `src/core/`, `src/adapters/`, `src/infra/`, `src/admin/`.
- `web/` e `admin_web/`.
- `psc-web/package.json`.
- `psc-web/src/app/api/`.
- `psc-web/src/core/domain/models.ts`, `psc-web/src/core/domain/rules.ts`.
- `psc-web/src/adapters/output/`.
- `sql/000_consolidated_schema.sql` ate `sql/027_roles_annual_confidence_and_simple_wins.sql`.
- Contexto recente de `sql/032..035` e `supabase/functions/commercial-sync`, `supabase/functions/marketing-sync` informado nas abas/conversa.

## Indice

- [PRD.md](PRD.md): produto, personas, requisitos, regras e evidencias.
- [SERVICE-DIAGRAM.md](SERVICE-DIAGRAM.md): diagramas de servicos, syncs, dados e crons.
- [DATA-GLOSSARY.md](DATA-GLOSSARY.md): glossario de dados operacionais.
- [DATA-MODEL.md](DATA-MODEL.md): entidades, tabelas, relacionamentos e ciclos de vida.
- [HANDOFF.md](HANDOFF.md): resumo operacional para retomada.

## Ordem Recomendada Para Proxima Sessao

1. Ler `HANDOFF.md` para estado atual, riscos e proximas acoes.
2. Ler `SERVICE-DIAGRAM.md` para entender os fluxos Python, Next, Supabase, Bitrix e crons.
3. Ler `PRD.md` para regras implementadas e requisitos.
4. Consultar `DATA-MODEL.md` e `DATA-GLOSSARY.md` ao mexer em SQL, repositorios ou Edge Functions.

## Gaps E Atencoes

- O filesystem verificado nesta sessao mostra `sql/000..027`; as abas do usuario e o historico recente mencionam `sql/032..035` e Edge Functions, mas alguns desses arquivos nao aparecem no snapshot limpo atual. Confirmar salvamento/commit antes de continuar.
- `psc-web` esta no escopo agora. Documentacao antiga dizia que estava excluido; essa informacao foi substituida.
- `.html` em `docs/ai-context/` continuam sendo exports antigos de 2026-07-11.
- Validacoes de runtime Supabase/Bitrix nao foram executadas diretamente por falta de secrets; foram documentados comandos e resultados informados na sessao.
