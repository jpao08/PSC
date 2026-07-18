# PSC Web Fork

Fork web do PSC para Next.js, Vercel, Supabase e autenticaÃ§Ã£o Bitrix OAuth.

## Stack

- Next.js App Router
- TypeScript
- Supabase service role somente no servidor
- Bitrix OAuth para login
- Bitrix REST/Webhook para busca de usuÃ¡rios e criaÃ§Ã£o de tarefas
- Vitest para regras e use cases

## Setup

```bash
cd psc-web
npm install
cp .env.example .env.local
npm run dev
```

Antes do primeiro deploy, execute no Supabase:

```sql
-- a partir da raiz do PSC
sql/024_add_bitrix_identity_to_users.sql
```

## VariÃ¡veis

- `NEXT_PUBLIC_APP_URL`: URL local ou URL pÃºblica da Vercel.
- `APP_SESSION_SECRET`: segredo de sessÃ£o com pelo menos 32 caracteres.
- `SUPABASE_URL`: URL do projeto Supabase, usada pelas rotas server-side do Next.
- `SUPABASE_SERVICE_ROLE_KEY`: chave server-only para o MVP com login Bitrix. Ela bypassa RLS, entao nunca use prefixo `NEXT_PUBLIC_` nela.
- `BITRIX_CLIENT_ID`: client id do app OAuth Bitrix.
- `BITRIX_CLIENT_SECRET`: client secret do app OAuth Bitrix.
- `BITRIX_PORTAL_URL`: URL do seu portal Bitrix24, por exemplo `https://empresa.bitrix24.com.br`. A autorizacao do usuario comeca no portal.
- `BITRIX_OAUTH_TOKEN_URL`: URL de token OAuth Bitrix.
- `BITRIX_WEBHOOK_URL`: webhook Bitrix para busca administrativa de usuÃ¡rios e criaÃ§Ã£o de tarefas.

## Fluxo de autenticaÃ§Ã£o

1. UsuÃ¡rio clica em `Entrar com Bitrix`.
2. Bitrix redireciona para `/api/auth/bitrix/callback`.
3. O app resolve `bitrix_user_id` + `bitrix_portal_domain` contra `users`.
4. UsuÃ¡rio sem vÃ­nculo PSC ativo vai para `/access-denied`.

## Admin

O admin fica em `/admin` e exige usuÃ¡rio PSC com role `executivo`.

O cadastro nÃ£o cria usuÃ¡rios no Bitrix. Ele busca usuÃ¡rios existentes via autocomplete e habilita o vÃ­nculo interno PSC, definindo:

- perfil;
- Ã¡reas;
- status ativo;
- permissÃ£o de projeÃ§Ã£o;
- permissÃ£o de Issue Reports.

## ValidaÃ§Ã£o

```bash
npm run typecheck
npm run test
npm run build
```

## Seguranca Supabase

O MVP usa `SUPABASE_SERVICE_ROLE_KEY` apenas em server routes do Next porque a autenticacao principal e feita pelo Bitrix, nao pelo Supabase Auth. As rotas validam a sessao Bitrix e as permissoes PSC antes de consultar ou alterar dados.

Nao crie variaveis como:

```bash
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=...
```

Uma etapa futura pode adicionar `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para leituras/escritas protegidas por RLS, mas isso exige policies/claims compativeis com a identidade Bitrix.

Neste ambiente Codex atual, `node`/`npm` nÃ£o estavam instalados, entÃ£o esses comandos precisam ser executados localmente apÃ³s instalar Node.js.
