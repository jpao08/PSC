-- Add permission flag to allow registering projected monthly indicator values.
-- This script is idempotent.

alter table users
  add column if not exists can_edit_projected_value boolean not null default false;

create index if not exists idx_users_can_edit_projected_value
  on users(can_edit_projected_value);
