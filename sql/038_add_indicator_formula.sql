-- Add optional descriptive formula for Scorecard indicators.
-- This is documentation text for the indicator, not an executable formula engine.

alter table indicators
  add column if not exists formula text null;

comment on column indicators.formula is
  'Descriptive functional formula for the indicator. Not executable application logic.';
