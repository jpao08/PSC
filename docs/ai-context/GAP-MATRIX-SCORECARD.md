# GAP-MATRIX-SCORECARD

Data: 2026-08-20

| ID | Regra desejada | Estado encontrado | Status | Alteracao aplicada |
|---|---|---|---|---|
| RF-01 | Semanas acumulativas | Mensal somava/ponderava semanas para `sum/avg` | PRECISA ALTERAR | Mensal agora resolve ultimo valor semanal valido |
| RF-02 | Monthly Snapshot | Conceito existia parcialmente via `latest` | PARCIAL | Snapshot virou regra universal |
| RF-03 | Fluxo | `sum` existia | PARCIAL | `sum` agora consolida valores mensais |
| RF-04 | Posicao | `latest` existia | PARCIAL | `latest` agora pega ultimo mes valido no periodo |
| RF-05 | Proporcional | `avg` existia | PARCIAL | `avg` agora media valores mensais validos |
| RF-06 | Zero preenchido | Rotas numericas aceitavam zero | COERENTE | Testes adicionados |
| RF-07 | Pendente | Ausencia era implicita | PARCIAL | Status mensal derivado como `pending` |
| RF-08 | Nao Calculavel | Tabela mensal N/A existia | COERENTE | Excluido de consolidado/completude |
| RF-09 | Completude | Nao havia consolidado trimestral | AUSENTE | Resumo trimestral calcula preenchidos/esperados |
| RF-10 | Trimestres fixos | Nao centralizado | AUSENTE | Funcoes de trimestre fixo adicionadas |
| RF-11 | Historico | Historico semanal existe | PARCIAL | Sem conversao automatica; impacto documentado |

## Decisoes Pendentes

- Validar com negocio se as novas perspectivas de Drill Down devem evoluir para dados especificos de Comercial/Financeiro/Marketing ou permanecer no Scorecard geral.
- Definir ferramenta operacional para saneamento historico assistido.
