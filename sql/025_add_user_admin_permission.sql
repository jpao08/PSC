-- Allows a user to administer PSC accounts without changing their operational role.
-- Useful for developer/admin users who must remain gestor_area in business flows.

alter table users
  add column if not exists can_admin_users boolean not null default false;

create index if not exists idx_users_can_admin_users
  on users (can_admin_users);
