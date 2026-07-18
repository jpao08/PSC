-- Remove fixed indicator target value.
-- Monthly targets in indicator_month_targets are now the single source of target planning.
-- This script is idempotent.

alter table indicators
  drop column if exists target_value;
