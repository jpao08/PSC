# Handoff: Pacote de Contexto IA do PSC Executavel

Data: 2026-07-11
Status da sessao: pronto para revisao

## Objetivo

Refazer o pacote completo de documentos do PSC apos revisao da skill `handoff-documents`, mantendo `PSC/psc-web` fora do escopo e atualizando a pasta existente `docs/ai-context/` em lugar.

## Estado Atual

A pasta existente foi atualizada em:

```text
docs/ai-context/
```

Documentos de pacote convertidos para portugues:

- `README.md`
- `PRD.md`
- `SERVICE-DIAGRAM.md`
- `DATA-GLOSSARY.md`
- `DATA-MODEL.md`

`HANDOFF.md` tambem esta em portugues, mas com foco operacional para retomada por IA.

Escopo coberto:

- Executavel principal `PSC.exe`
- Executavel administrativo `PSC-Users-Admin.exe`
- Backend FastAPI em `src/`
- UI estatica empacotada em `web/`
- UI admin empacotada em `admin_web/`
- PyInstaller, Supabase, Bitrix24, SQL e testes

Exclusao confirmada:

- `psc-web/`

Branch observada: `main`.

## Concluido

- Inventariada a pasta existente `docs/ai-context/`.
- Atualizados os seis arquivos existentes sem deletar/recriar a pasta.
- Reescrito o pacote em portugues conforme nova regra da skill.
- Mantida a exclusao de `psc-web/`.
- Mantidos identificadores tecnicos, nomes de arquivos, rotas, tabelas e variaveis como no codigo.
- Nao foram lidos valores reais de `.env`.

## Arquivos Alterados Nesta Etapa

- `docs/ai-context/README.md`: indice e orientacao em portugues.
- `docs/ai-context/PRD.md`: PRD em portugues com RFs, RNFs, regras de negocio, fluxos, riscos e evidencias.
- `docs/ai-context/SERVICE-DIAGRAM.md`: diagramas Mermaid com prosa em portugues.
- `docs/ai-context/DATA-GLOSSARY.md`: glossario de dados em portugues.
- `docs/ai-context/DATA-MODEL.md`: modelo de dados em portugues.
- `docs/ai-context/HANDOFF.md`: handoff operacional atualizado.

## Mudancas Existentes no Worktree

Antes desta atualizacao documental, o repositorio ja tinha mudancas nao commitadas em arquivos de app, testes, SQL e UI, incluindo:

- `admin_web/app.js`
- `admin_web/index.html`
- `src/adapters/input/api_routes.py`
- `src/adapters/output/supabase_repositories.py`
- `src/app/wiring.py`
- `src/core/domain/models.py`
- `src/core/domain/rules.py`
- `src/core/ports/repositories.py`
- `src/core/use_cases/*`
- `tests/*`
- `web/app.js`
- `web/index.html`
- `web/styles.css`
- `sql/*`

Essas mudancas nao foram revertidas.

## Verificacao Realizada

- `Get-ChildItem docs/ai-context`: confirmou existencia dos arquivos antes da atualizacao.
- `git status --short`: confirmou branch de trabalho com mudancas existentes.
- Releitura da skill revisada `handoff-documents`.
- Atualizacao feita diretamente nos arquivos existentes do pacote.

Nao executado:

- `pytest`
- `ruff`
- build PyInstaller
- startup do app
- consultas Supabase
- chamadas Bitrix24

Motivo: pedido foi refazer documentacao; essas validacoes dependem de runtime/servicos/credenciais e nao eram necessarias para a reescrita documental.

## Decisoes e Assumptions

- Decisao: manter `docs/ai-context/` como pasta padrao existente.
- Decisao: atualizar arquivos em lugar, sem apagar a pasta.
- Decisao: escrever documentos de pacote em portugues.
- Decisao: manter `web/` e `admin_web/` no escopo porque fazem parte dos executaveis.
- Assumption: a arvore de trabalho atual representa o estado que deve ser documentado.
- Assumption: `sql/024` e `sql/025` sao migrations incrementais ainda nao consolidadas em `000_consolidated_schema.sql`.

## Riscos e Pontos de Atencao

- A documentacao e baseada em analise estatica; comportamento runtime nao foi validado nesta etapa.
- Scripts de build empacotam `.env` por padrao se o arquivo existir; revisar risco antes de distribuir executaveis.
- `can_admin_users` existe em migration, mas nao foi observado como mecanismo de autorizacao no admin atual.
- Se uma pessoa editou manualmente os documentos entre a geracao anterior e esta etapa, o conteudo foi reescrito para alinhar com a nova regra de idioma.

## Proximos Passos

1. Revisar `PRD.md` e confirmar se o escopo em portugues esta correto.
2. Validar se `SERVICE-DIAGRAM.md` representa corretamente os modulos executaveis.
3. Decidir se `sql/000_consolidated_schema.sql` deve incorporar migrations `024` e `025`.
4. Decidir se o build deve mudar para nao empacotar `.env` por padrao.
5. Rodar `pytest` e `ruff check .` quando houver intencao de validar codigo.

## Contexto Util

- App principal: `python -m app.start_server --reload --env-file .env --port 8010`
- Build principal: `powershell -ExecutionPolicy Bypass -File .\scripts\build_exe.ps1`
- Admin: `psc-users-admin --env-file .env --port 8020`
- Build admin: `powershell -ExecutionPolicy Bypass -File .\scripts\build_admin_exe.ps1`
- Pasta de contexto: `docs/ai-context/`
