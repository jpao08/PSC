# Diagrama de Servicos: PSC

Data: 2026-07-31
Escopo: executavel local, admin local, fork web `psc-web/` e sincronizacao comercial.

## Visao Geral

```mermaid
flowchart LR
  UsuarioLocal[Usuario local] --> ExeUI[UI estatica web/]
  ExeUI --> FastAPI[FastAPI src/adapters/input/api_routes.py]
  FastAPI --> PyUseCases[Python use cases]
  PyUseCases --> PyDomain[Python domain rules]
  PyUseCases --> PyRepos[Supabase repositories Python]
  PyUseCases --> PyBitrix[Bitrix task gateway]

  AdminLocal[Admin local] --> AdminUI[admin_web/]
  AdminUI --> AdminAPI[FastAPI admin src/admin/users_app.py]
  AdminAPI --> AdminRepo[AdminUserRepository]

  UsuarioWeb[Usuario web] --> NextApp[Next.js App Router psc-web]
  NextApp --> NextRoutes[Server routes psc-web/src/app/api]
  NextRoutes --> TsUseCases[TypeScript use cases]
  NextRoutes --> TsRepos[Supabase repositories TS]
  NextRoutes --> BitrixOAuth[Bitrix OAuth/Webhook gateway]

  SyncScheduler[Trigger externo/Supabase] --> EdgeFn[Edge Function commercial-sync]
  EdgeFn --> BitrixCRM[Bitrix24 CRM API]
  EdgeFn --> Supabase[(Supabase/Postgres)]

  PyRepos --> Supabase
  AdminRepo --> Supabase
  TsRepos --> Supabase
  PyBitrix --> BitrixCRM
  BitrixOAuth --> BitrixCRM
```

## Executavel Principal

```mermaid
flowchart LR
  Launcher[PSC.exe / app.start_server] --> FastAPI[FastAPI app]
  Launcher --> Browser[Navegador local]
  Browser --> UI[web/]
  UI --> API[src/adapters/input/api_routes.py]
  API --> Wiring[src/app/wiring.py]
  Wiring --> UseCases[src/core/use_cases]
  UseCases --> Domain[src/core/domain]
  UseCases --> Ports[src/core/ports]
  Ports --> SupaRepo[src/adapters/output/supabase_repositories.py]
  Ports --> TaskGateway[src/adapters/output/bitrix_task_gateway.py]
  SupaRepo --> Supabase[(Supabase/Postgres)]
  TaskGateway --> Bitrix[(Bitrix24)]
  API --> Shutdown[POST /api/system/shutdown]
```

## Executavel Administrativo Local

```mermaid
flowchart LR
  AdminLauncher[PSC-Users-Admin.exe] --> AdminAPI[src/admin/users_app.py]
  AdminLauncher --> AdminBrowser[Navegador local]
  AdminBrowser --> AdminUI[admin_web/]
  AdminUI --> AdminAPI
  AdminAPI --> Token[SimpleTokenService]
  AdminAPI --> AdminRepo[AdminUserRepository]
  AdminRepo --> Supabase[(Supabase/Postgres)]
  AdminAPI --> AdminShutdown[Shutdown local]
```

## Fork Web Next.js

```mermaid
sequenceDiagram
  participant User as Usuario
  participant Next as Next.js psc-web
  participant Bitrix as Bitrix24 OAuth
  participant Supabase as Supabase/Postgres

  User->>Next: GET /login
  User->>Next: GET /api/auth/bitrix/start
  Next->>Bitrix: Redirect para autorizacao
  Bitrix->>Next: GET /api/auth/bitrix/callback?code=...
  Next->>Bitrix: Troca code por access_token
  Next->>Bitrix: Busca usuario atual
  Next->>Supabase: Resolve users.bitrix_user_id + bitrix_portal_domain
  Next->>User: Cookie httpOnly psc_session
  User->>Next: Dashboard e APIs
  Next->>Supabase: Leituras/escritas server-side com validacao de permissao PSC
```

## Drill Down Comercial

```mermaid
flowchart TD
  AdminWeb[Admin web com can_admin_users] --> StartSync[POST /api/commercial-drilldown/sync]
  StartSync --> RpcStart[start_commercial_sync]
  RpcStart --> Jobs[(bitrix_sync_jobs)]
  Edge[Supabase Edge Function commercial-sync] --> Jobs
  Edge --> CRM[Bitrix24 CRM]
  Edge --> Deals[(bitrix_crm_deals)]
  Edge --> Users[(bitrix_crm_users)]
  Edge --> Stages[(bitrix_crm_stages)]
  Edge --> History[(bitrix_crm_stage_history)]
  Edge --> Snapshots[(bitrix_crm_deal_snapshots)]
  Edge --> Cycles[(bitrix_crm_deal_cycles)]
  Edge --> Monthly[(commercial_drilldown_monthly)]
  Edge --> Items[(commercial_drilldown_items)]
  Dashboard[GET /api/commercial-drilldown] --> RpcDash[get_commercial_drilldown_dashboard]
  DrillItems[GET /api/commercial-drilldown/items] --> RpcItems[get_commercial_drilldown_items]
  RpcDash --> Monthly
  RpcItems --> Items
```

## Build e Deploy

```mermaid
flowchart LR
  Source[Repositorio PSC] --> BuildMain[scripts/build_exe.ps1]
  Source --> BuildAdmin[scripts/build_admin_exe.ps1]
  BuildMain --> MainExe[dist/PSC.exe]
  BuildAdmin --> AdminExe[dist/PSC-Users-Admin.exe]
  Source --> NextBuild[psc-web npm run build]
  NextBuild --> Vercel[Vercel/host Next.js]
  Source --> EdgeDeploy[Supabase function deploy commercial-sync]
  EdgeDeploy --> SupabaseEdge[Supabase Edge Runtime]
```

## Responsabilidades por Modulo

| Modulo | Responsabilidade | Evidencia |
|---|---|---|
| `src/app/start_server.py` | Launcher CLI/executavel, limpeza de porta, abertura de navegador e startup Uvicorn. | `src/app/start_server.py` |
| `src/app/main.py` | Fabrica FastAPI, registra rotas, serve `web/` e healthcheck. | `src/app/main.py` |
| `src/app/wiring.py` | Composition root Python. | `src/app/wiring.py` |
| `src/adapters/input/api_routes.py` | Adapter HTTP Python, auth bearer e traducao de erros. | `src/adapters/input/api_routes.py` |
| `src/core/` | Modelos, regras, ports e use cases Python. | `src/core/` |
| `src/adapters/output/` | Persistencia Supabase e gateway Bitrix na versao Python. | `src/adapters/output/` |
| `src/admin/users_app.py` | FastAPI separado para admin local. | `src/admin/users_app.py` |
| `web/` | UI estatica do executavel principal. | `web/index.html`, `web/app.js` |
| `admin_web/` | UI estatica do executavel admin. | `admin_web/index.html`, `admin_web/app.js` |
| `psc-web/src/app/` | Paginas e rotas Next.js App Router. | `psc-web/src/app/` |
| `psc-web/src/core/` | Dominio, regras, ports e use cases TypeScript. | `psc-web/src/core/` |
| `psc-web/src/adapters/output/` | Repositories Supabase e gateway Bitrix TypeScript. | `psc-web/src/adapters/output/` |
| `psc-web/src/infra/session.ts` | JWT de sessao e cookie HTTP-only. | `psc-web/src/infra/session.ts` |
| `supabase/functions/commercial-sync/` | Sincronizacao CRM Bitrix e reconstrucao de agregados comerciais. | `supabase/functions/commercial-sync/index.ts` |

## Dependencias Externas

| Dependencia | Uso | Fronteira |
|---|---|---|
| Supabase/Postgres | Persistencia operacional, RPCs comerciais, jobs e agregados. | Python repositories, TS repositories, SQL, Edge Function |
| Bitrix24 OAuth | Login web e identidade do usuario. | `psc-web/src/app/api/auth/bitrix/`, `BitrixGateway` |
| Bitrix24 Webhook/API | Busca de usuarios, tarefas de planos de acao e dados CRM para Drill Down. | Gateways Python/TS, Edge Function |
| Vercel/Next hosting | Host esperado para `psc-web`. | `psc-web/README.md`, `next.config.mjs` |
| PyInstaller/Windows | Empacotamento local one-file. | `scripts/`, `.spec` |

## Notas de Fronteira

- `core/` Python e `psc-web/src/core/` TypeScript concentram regras e contratos, mas nao sao automaticamente sincronizados; mudancas de regra devem ser duplicadas com cuidado.
- `psc-web` usa Supabase service role em rotas server-side; nao ha evidencia de acesso direto do browser ao Supabase.
- Drill Down Comercial foi desenhado para que clientes PSC leiam dados pre-calculados no Supabase e nao chamem Bitrix24 CRM diretamente.
- A Edge Function depende de segredos no ambiente Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BITRIX_WEBHOOK_URL` e variaveis comerciais opcionais.
