# PSC - MVP de Gestao de Indicadores

MVP web simples para gestao de indicadores por area, com arquitetura **Modular Factory / Core-first** e baixo acoplamento.

## Stack

- Python 3.11+
- FastAPI
- Supabase (persistencia e autenticacao via tabela `users`)
- HTML + CSS + JavaScript (sem build)
- Bitrix24 via backend
- pytest + ruff

## Arquitetura

```text
src/
  app/
    main.py
    wiring.py
  core/
    domain/
      models.py
      rules.py
    ports/
      repositories.py
      task_gateway.py
    use_cases/
      authenticate_user.py
      list_indicators.py
      register_indicator_value.py
      create_action_plan.py
      create_indicator.py
  adapters/
    input/
      api_routes.py
    output/
      supabase_repositories.py
      bitrix_task_gateway.py
  infra/
    config.py
    logging.py
    supabase_client.py
    bitrix_client.py
web/
  index.html
  app.js
  styles.css
tests/
sql/
```

## Banco de dados (Supabase)

1. Execute `sql/001_schema.sql` no SQL Editor do Supabase.
2. Se o banco ja existir, execute `sql/005_roles_table_and_fk.sql` para adotar tabela de roles e FK em `users.role`.
3. Se o banco ja existir, execute `sql/003_add_indicator_value_history.sql` para habilitar historico de alteracoes de valores semanais.
4. Se o banco ja existir, execute `sql/006_add_bitrix_responsible_id_to_action_plans.sql` para salvar o responsavel selecionado no Bitrix24.
5. Opcionalmente, use `sql/002_seed_example.sql` para popular dados iniciais.
6. Para o pacote de indicadores do SCORECARD T&D, execute `sql/004_scorecard_tnd_indicators.sql`.

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `BITRIX_WEBHOOK_URL`
- `APP_SECRET_KEY`
- `USER_ADMIN_PASSWORD` (senha local para o modulo separado de CRUD de usuarios)
- `SUPABASE_USERS_URL` (opcional)
- `SUPABASE_USERS_KEY` (opcional)
- `SUPABASE_USERS_TABLE` (opcional, padrao: `dim_user` quando URL/KEY de usuarios forem informadas)

Para autocomplete de responsavel usando tabela externa de usuarios:

- Configure `SUPABASE_USERS_URL` e `SUPABASE_USERS_KEY` para o projeto que contem `dim_user`.
- Configure `SUPABASE_USERS_TABLE=dim_user` (ou outro nome, se diferente).
- Colunas esperadas: `bitrix_user_id`, `full_name`, `email`, `is_active`.

Com isso, a busca de responsaveis usa primeiro a tabela externa e faz fallback para API do Bitrix24.

## Comandos

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .
ruff check .
pytest
python -m app.start_server --reload --env-file .env --port 8010
python -m app.start_server --reload --env-file .env --port 8010 --open-browser
```

O comando acima fecha automaticamente qualquer processo ouvindo na porta informada antes de iniciar a API.
Se o processo da porta tiver privilegio mais alto, o launcher tenta elevacao UAC automaticamente.
Por padrao, o launcher abre a aplicacao no navegador automaticamente. Se nao quiser isso, use `--no-open-browser`.

Recomendacao de versao para menor atrito com dependencias do Supabase:

- Python 3.11 ou 3.12.

Se `ruff`/`pytest` nao estiverem disponiveis apos o install base, instale extras de dev:

```bash
pip install -e .[dev]
```

Observacao para este layout local: se o ultimo comando nao resolver o app, use:

```bash
uvicorn app.main:app --reload --app-dir src
```

Opcionalmente, para desativar a tentativa de elevacao UAC no cleanup da porta:

```bash
python -m app.start_server --reload --env-file .env --port 8010 --skip-uac-elevation
```

Admin local de usuarios, separado do executavel principal:

```bash
pip install -e .
psc-users-admin --env-file .env --port 8020
```

Abra `http://127.0.0.1:8020` e use a senha definida em `USER_ADMIN_PASSWORD`.
Esse modulo cria/edita usuarios, redefine senha, ativa/desativa usuario, controla permissao de valor projetado e vincula gestores a multiplas areas.
O admin tambem possui botao para encerrar o processo local.

## Endpoints principais

- `POST /api/login`
- `GET /api/me`
- `GET /api/indicators?year=YYYY`
- `GET /api/indicators/{indicator_id}/weekly-values?year=YYYY&month=MM`
- `POST /api/indicators/{indicator_id}/weekly-values`
- `POST /api/action-plans`
- `GET /api/action-plans?indicator_id=...`
- `POST /api/indicators`
- `POST /api/system/shutdown`

Endpoint extra de apoio ao frontend:

- `GET /api/areas`
- `GET /api/bitrix-users?query=...&limit=...`

## Build EXE (one-file)

Build do executavel unico (Windows):

```bash
pip install pyinstaller
powershell -ExecutionPolicy Bypass -File .\scripts\build_exe.ps1
```

Resultado esperado:

- `dist\PSC.exe`
- Build padrao sem terminal (`noconsole`) para uso por duplo clique.

Uso por duplo clique:

- Dê duplo clique em `dist\PSC.exe`.
- O app inicia na porta `8010` e abre o navegador automaticamente.

Rodar o executavel:

```bash
.\dist\PSC.exe --port 8010 --open-browser
```

Observacao:

- Por padrao, o script inclui o arquivo `.env` dentro do executavel.
- Para **nao** empacotar o `.env`, use:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build_exe.ps1 -NoEnvBundle
```

Para gerar uma versao com terminal visivel (debug):

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build_exe.ps1 -Console
```

## Build EXE do Admin de Usuarios

Build do executavel separado do admin local de usuarios:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build_admin_exe.ps1
```

Resultado esperado:

- `dist\PSC-Users-Admin.exe`

Uso por duplo clique:

- Dê duplo clique em `dist\PSC-Users-Admin.exe`.
- O admin inicia na porta `8020` e abre o navegador automaticamente.

Rodar o executavel:

```bash
.\dist\PSC-Users-Admin.exe --port 8020 --open-browser
```

Para não empacotar o `.env`, use:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build_admin_exe.ps1 -NoEnvBundle
```

Para gerar uma versao com terminal visivel (debug):

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\build_admin_exe.ps1 -Console
```

## Regras implementadas

- Gestor ve apenas indicadores da propria area.
- Gestor pode ser vinculado a multiplas areas por `user_area_access`.
- Executivo ve indicadores de todas as areas e pode:
  - criar plano de acao com autocomplete de usuarios do Bitrix24 e atribuicao da tarefa ao usuario selecionado;
  - cadastrar novos indicadores.
- Gestor pode editar valores semanais (upsert por `indicator_id + year + month + week_number`).
- Toda alteracao de valor ja existente grava historico em `indicator_value_history` com valor anterior e novo valor.
- Valor mensal:
  - `sum` = soma semanal;
  - `avg` = media dos valores semanais preenchidos.
  - `latest` = valor da ultima faixa preenchida no mes.

## Testes incluidos

- Calculo mensal por soma.
- Calculo mensal por media.
- Autorizacao de gestor por area para atualizar valor semanal.
- Criacao de plano de acao chamando gateway fake do Bitrix.
- Cadastro de indicador permitido apenas para executivo.

## Observacao sobre executavel

A separacao `core` / `adapters` / `infra` / `app` foi mantida para facilitar evolucao para executavel no futuro (ex.: empacotar o backend com PyInstaller sem alterar regras de negocio).
