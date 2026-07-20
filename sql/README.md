# SQL do PSC

- `000_consolidated_schema.sql`: use em bancos novos e depois aplique as migrations `024` a `026`. Ele consolida as migrations `001` a `023` em um unico script ordenado.
- `001_...` a `027_...`: mantenha para bancos ja existentes, aplicando apenas as migrations ainda nao executadas.
- `027_roles_annual_confidence_and_simple_wins.sql`: adiciona roles taticas/operacionais, planejamento anual/confiança e defaults para Wins simplificadas.

Evite reaplicar o consolidado em um banco que ja possui dados de producao; para upgrades, use as migrations incrementais.
