# Handoff: PSC

Data: 2026-08-04
Status da sessao: pronto para revisao dos Markdown

## Objetivo

Atualizar completamente o pacote `docs/ai-context/` para refletir o PSC como projeto completo: executavel Python legado, app Next.js `psc-web`, Supabase, Bitrix24, Drill Downs Comercial/Financeiro/Marketing, Edge Functions e crons.

## Estado Atual

O projeto combina duas superficies:

- Legado/local: FastAPI + HTML estatico empacotavel com PyInstaller em `PSC.exe` e `PSC-Users-Admin.exe`.
- Web atual: Next.js/React em `psc-web/`, com APIs server-side, dominio TypeScript e Supabase.

Trabalho recente importante:

- Marketing Drill Down foi redesenhado para CRM 95 + CRM 125, com CRM 125 como `OUTBOUND`, CRM 95 por fonte/tags e `scheduled_meetings` mantendo nome do cliente mas contando Won.
- Comercial sync foi estabilizado com jobs escopados por `job_type = incremental` e `cycle_id` deterministico para evitar FK em `commercial_drilldown_items`.
- Crons propostos/ajustados: Comercial `08:00`/`18:00` BRT e Marketing `08:05`/`18:05` BRT via `pg_cron` + `pg_net` + Vault.

## Completed

- Refeito o pacote Markdown de contexto para incluir `psc-web`.
- Atualizado o PRD com requisitos atuais de indicadores, Issue Reports, Wins, admin, drilldowns e syncs.
- Atualizado o diagrama de servicos com Next.js, FastAPI, Supabase, Bitrix24, Edge Functions e crons.
- Atualizados glossario e modelo de dados com tabelas recentes e regras de Drill Down.
- Registrados riscos de consistencia entre abas/contexto recente e filesystem verificado.

## Changed Files

- `docs/ai-context/README.md`: escopo completo, stack e gaps.
- `docs/ai-context/PRD.md`: requisitos e regras atualizados.
- `docs/ai-context/SERVICE-DIAGRAM.md`: fluxos atualizados.
- `docs/ai-context/DATA-GLOSSARY.md`: glossario atualizado.
- `docs/ai-context/DATA-MODEL.md`: modelo atualizado.
- `docs/ai-context/HANDOFF.md`: este resumo operacional.

## Verification

- `Get-ChildItem docs/ai-context`: confirmou documentos existentes.
- `Get-Content psc-web/package.json`: confirmou Next.js 16, React 19, Vitest e TypeScript.
- `rg --files psc-web/src/app/api psc-web/src/core psc-web/src/adapters`: inventariou rotas e dominio web.
- `Get-ChildItem sql -Filter *.sql`: confirmou migrations presentes no filesystem ate `027`.
- Nao executado: `npm run typecheck`, `npm test`, `pytest`, `ruff`, deploy Supabase ou chamadas Bitrix nesta etapa documental.

## Decisions and Assumptions

- Decision: `docs/ai-context/` continua sendo a pasta canonica.
- Decision: Markdown foi atualizado; exports `.html` antigos nao foram regenerados sem aprovacao.
- Decision: documentar `psc-web` como parte do escopo atual.
- Assumption: contexto recente da conversa sobre `032..035` e Edge Functions e valido, mas precisa ser reconciliado com arquivos salvos/commitados.
- Assumption: crons corretos sao `psc-commercial-sync-08-18-brt` e `psc-marketing-sync-08-18-brt`.

## Blockers and Risks

- Risco: alguns SQLs/Edge Functions recentes aparecem no contexto do IDE, mas nao no filesystem limpo desta sessao. Antes de commit/deploy, verificar `sql/028..035` e `supabase/functions/*`.
- Risco: `CRM_import` foi identificado como endpoint legado instavel; caminho canonico recomendado para Comercial e `commercial-sync`.
- Risco: o Comercial ainda pode demorar mais que `pg_net` em sync completa; job `completed` em `bitrix_sync_jobs` e a fonte de verdade.
- Risco: `.env` pode ser empacotado no build PyInstaller se scripts forem usados sem `-NoEnvBundle`.

## Next Steps

1. Confirmar no workspace real se `sql/028..035` e `supabase/functions/commercial-sync`, `marketing-sync`, `financial-units-sync` estao salvos.
2. Rodar `npm run typecheck` e `npm test -- --run` em `PSC/psc-web`.
3. Rodar `pytest` e `ruff check .` se for validar tambem o legado Python.
4. Confirmar crons no Supabase:
   `select jobid, jobname, schedule, command, active from cron.job where jobname in ('psc-commercial-sync-08-18-brt','psc-marketing-sync-08-18-brt');`
5. Depois de aprovar Markdown, decidir se deseja exportar HTML/PDF atualizados.

## Useful Context

- Next dev: `cd PSC/psc-web && npm run dev`
- Next typecheck: `cd PSC/psc-web && npm run typecheck`
- Next tests: `cd PSC/psc-web && npm test -- --run`
- Python app: `python -m app.start_server --reload --env-file .env --port 8010`
- Admin local: `psc-users-admin --env-file .env --port 8020`
- Cancelar job travado: `select cancel_running_bitrix_sync_jobs('marketing');` ou `select cancel_running_bitrix_sync_jobs('incremental');`
