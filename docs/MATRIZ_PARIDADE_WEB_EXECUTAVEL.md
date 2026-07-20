# Matriz de Paridade Web x Executavel - PSC

Esta matriz acompanha a SPEC de revisao Web/Executavel. A paridade exigida e funcional: as interfaces podem ser diferentes, mas devem usar os mesmos dados, regras e criterios.

| Recurso | Web | Executavel | Regra compartilhada? | Acao necessaria | Status |
|---|---:|---:|---:|---|---|
| Login e sessao | Sim, Bitrix OAuth | Sim, senha PSC local | Parcial | Manter autenticoes distintas usando a mesma tabela `users` | Mantido |
| Cadastro/admin de usuarios | Sim, `/admin` Web | Sim, admin local | Sim | Incluir novas roles nos dois admins | Implementado |
| Habilitacao Web de usuario existente | Sim | N/A operacional | Parcial | Web deve reutilizar perfil por Bitrix identity ou email normalizado | Implementado na Web |
| Bloqueio de email duplicado | Sim | Parcial | Sim | Bloquear upsert Web quando email normalizado conflitar | Implementado na Web |
| Roles `gestor_tatico` e `gestor_operacional` | Sim | Sim | Sim | Adicionar migration, tipos e validacoes | Implementado |
| Menor privilegio para roles novas | Sim | Sim | Sim | Roles novas visualizam por area e nao recebem admin automaticamente | Implementado |
| Listagem de indicadores por area | Sim | Sim | Sim | Aplicar area scope tambem nas roles novas | Implementado |
| Valor mensal Real | Sim | Sim | Sim | Manter calculo `sum`, `avg`, `latest` | Mantido |
| Valor mensal Projetado | Sim | Sim | Sim | Manter planejamento mensal existente | Mantido |
| Meta mensal | Sim | Sim | Sim | Manter planejamento mensal existente | Mantido |
| Maturidade 0-100 | Sim | Sim | Sim | Aplicar badge semantico RF-07 | Implementado |
| Confianca 0-100 | Sim | Sim | Sim | Criar `indicator_year_planning.confidence_level` | Implementado |
| Meta Anual | Sim | Sim | Sim | Criar `indicator_year_planning.annual_target` | Implementado |
| Projetado Anual | Sim | Sim | Sim | Real mensal prevalece sobre Projetado mensal | Implementado |
| Real Anual | Sim | Sim | Sim | Consolidar somente reais preenchidos | Implementado |
| Percentual de atingimento anual | Sim | Sim | Sim | Evitar divisao por zero e usar estado neutro | Implementado |
| Escala visual RF-07 | Sim | Sim | Sim | Centralizar classificacao em core TS/Python | Implementado |
| Destaque do mes atual | Sim | Sim | UI local | Destacar coluna vigente sem remover cor de area | Implementado |
| Cor da area na linha | Sim | Sim | UI local | Preservar cor suave e badges internos | Parcial |
| Wins sem GUT | Sim | Sim | Sim | Criar/listar/detalhar Wins com titulo, descricao, area, status e metadados | Implementado |
| Historico GUT de Wins | Sim, legado no banco | N/A | Sim | Manter colunas antigas sem expor no fluxo novo | Implementado na Web |
| Build Vercel | Sim | N/A | N/A | Manter secrets server-side | Mantido |
| Build PyInstaller | N/A | Sim | N/A | Validar apos alteracoes Python/static web | Pendente de build local |

## Excecoes e Backlog

- Wins no Executavel foi implementado no formato simplificado da SPEC. Tags de Wins no Executavel ficam fora do fluxo inicial para preservar o escopo titulo/descricao/metadados.
- Estrategias avancadas de consolidacao (`min`, `max`, formula/razao) e direcao do indicador ainda nao existem no schema atual. A regra inicial usa `sum`, `avg` e `latest`, que ja eram suportadas.
- A cor da area ja e propagada nas linhas, mas a revisao visual Apple-like completa deve ser tratada apos estabilizar os RFs funcionais.
