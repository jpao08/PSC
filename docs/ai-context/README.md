# Contexto IA: PSC Executavel

Data: 2026-07-11
Escopo: somente a versao executavel do PSC.

## Objetivo

Esta pasta reune contexto tecnico e de produto para que uma IA ou pessoa desenvolvedora consiga continuar o trabalho no PSC sem redescobrir o projeto do zero. O pacote foi atualizado em lugar, dentro da pasta existente `docs/ai-context/`.

## Escopo Analisado

Incluido:

- Aplicacao executavel principal `PSC.exe`.
- Aplicacao executavel administrativa `PSC-Users-Admin.exe`.
- Backend FastAPI em `src/`.
- UI estatica empacotada do executavel principal em `web/`.
- UI estatica empacotada do executavel admin em `admin_web/`.
- Scripts/specs de build com PyInstaller.
- Schemas e migrations SQL em `sql/`.
- Testes em `tests/`.

Excluido:

- `psc-web/`, por solicitacao explicita do usuario, pois ainda esta incompleto.
- `.env` real. Nenhum valor secreto foi lido ou documentado.
- Artefatos gerados como `dist/`, `build/`, `.venv/`, caches e similares.

## Stack Detectada

- Python 3.11+
- FastAPI
- Uvicorn
- Supabase/Postgres
- Bitrix24 via webhook/API HTTP
- HTML, CSS e JavaScript estatico, sem build frontend para o executavel atual
- PyInstaller para gerar executaveis Windows one-file
- pytest e ruff para validacao

## Indice dos Documentos

- [PRD.md](PRD.md): requisitos funcionais, nao funcionais, regras de negocio, fluxos, riscos e evidencias.
- [SERVICE-DIAGRAM.md](SERVICE-DIAGRAM.md): diagramas Mermaid de servicos, modulos, execucao e build.
- [DATA-GLOSSARY.md](DATA-GLOSSARY.md): glossario de dados com origem, armazenamento, produtores, consumidores e tratamentos.
- [DATA-MODEL.md](DATA-MODEL.md): modelo de dados, entidades, relacionamentos, ciclos de vida e diagrama ER Mermaid.
- [HANDOFF.md](HANDOFF.md): resumo operacional para retomada por IA ou pessoa desenvolvedora.

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
- `src/infra/config.py`
- `src/infra/supabase_client.py`
- `src/infra/bitrix_client.py`
- `src/core/domain/models.py`
- `src/core/domain/rules.py`
- `src/core/ports/repositories.py`
- `src/core/ports/task_gateway.py`
- `src/core/use_cases/`
- `web/`
- `admin_web/`
- `sql/README.md`
- `sql/000_consolidated_schema.sql`
- `sql/022_issue_fields_na_and_viewer_role.sql`
- `sql/023_issue_report_tags.sql`
- `sql/024_add_bitrix_identity_to_users.sql`
- `sql/025_add_user_admin_permission.sql`
- `tests/`

## Ordem Recomendada Para Proxima Sessao de IA

1. Ler `HANDOFF.md` para entender o estado da documentacao e os proximos passos.
2. Ler `PRD.md` para entender produto, regras e requisitos implementados.
3. Ler `SERVICE-DIAGRAM.md` para entender interacoes entre app, adapters, Supabase e Bitrix24.
4. Ler `DATA-MODEL.md` para entender persistencia e relacionamentos.
5. Ler `DATA-GLOSSARY.md` para consultar dados especificos durante implementacao.

## Gaps Conhecidos

- A analise foi estatica. O app, testes, build PyInstaller, Supabase e Bitrix24 nao foram executados.
- O repositorio estava com mudancas nao commitadas antes desta atualizacao documental.
- `sql/000_consolidated_schema.sql` declara consolidar migrations ate `001..023`, mas existem `024` e `025`; isso pode exigir atualizacao do consolidado.
- `can_admin_users` existe em migration, mas o admin observado autentica por `USER_ADMIN_PASSWORD`.
