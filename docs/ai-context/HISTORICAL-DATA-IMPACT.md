# HISTORICAL-DATA-IMPACT

Data: 2026-08-20

## Impacto

- Valores antigos em `indicator_values` podem ter sido preenchidos como incrementos semanais, mas agora sao interpretados como acumulados mensais.
- A aplicacao nao converteu registros historicos para evitar dupla interpretacao silenciosa.
- O valor mensal historico passa a ser o ultimo valor semanal valido disponivel de cada mes.

## Registros Potencialmente Sensiveis

- Meses com mais de uma semana preenchida e valores crescentes ou oscilantes.
- Indicadores antes configurados como `sum` ou `avg`, pois essas regras deixaram de operar dentro do mes.
- Periodos usados em comparacoes executivas antes da revisao.

## Estrategia Recomendada

- Gerar relatorio assistido por indicador/mes com semanas preenchidas.
- Validar com responsaveis se os valores representam acumulado ou incremento.
- Corrigir manualmente ou por script aprovado apenas depois de validacao humana.
- Registrar qualquer saneamento com data, responsavel e criterio aplicado.
