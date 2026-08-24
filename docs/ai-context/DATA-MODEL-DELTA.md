# DATA-MODEL-DELTA

Data: 2026-08-20

## Delta Aplicado

- `indicators.formula text null` adicionado por `sql/038_add_indicator_formula.sql`.
- `formula` e texto descritivo; nao executa calculos.
- `aggregation_type` permanece a coluna canonica da tipologia.
- `indicator_month_not_applicable` permanece a fonte de Not Calculable mensal.

## Delta Derivado Sem Migration

- Status mensal e derivado:
  - Filled: existe valor mensal, inclusive zero.
  - Pending: nao ha valor e o mes nao e N/A.
  - Not Calculable: mes presente em `indicator_month_not_applicable`.
- Valor mensal e derivado de `indicator_values` pelo maior `week_number` preenchido no mes.
- Consolidacao trimestral e completude sao calculadas sob demanda.

## Compatibilidade

- Nenhum dado historico foi alterado.
- Migrations destrutivas nao foram criadas.
- Bancos existentes precisam aplicar apenas `038_add_indicator_formula.sql` para habilitar o campo Formula.
