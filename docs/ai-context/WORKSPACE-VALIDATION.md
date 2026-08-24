# WORKSPACE-VALIDATION

Data: 2026-08-20

## Encontrado

- O PSC possui duas superficies versionadas: legado FastAPI/HTML em `src/` + `web/` e app atual Next.js em `psc-web/`.
- `docs/ai-context/` existe e segue como pacote canonico de contexto.
- `psc-web/package.json` confirma Next.js, React, TypeScript e Vitest.
- `sql/` contem migrations incrementais ate `038_add_indicator_formula.sql`; `036` e `037` ja estavam no workspace antes desta revisao.
- `supabase/functions/` nao possui funcoes versionadas neste workspace.

## Divergencias

- O README raiz ainda descreve o MVP legado com mais destaque que o app `psc-web`.
- A documentacao anterior citava migrations/interacoes operacionais nao totalmente presentes como Edge Functions salvas no filesystem.
- O schema existente tinha `aggregation_type`, N/A mensal, maturidade e confianca, mas nao tinha `formula` descritiva.

## Gate

- Nenhuma conversao semantica de historico foi executada.
- Nenhuma pipeline de Drill Down Comercial, Financeiro ou Marketing foi alterada.
