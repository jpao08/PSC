-- Adds Bitrix identity columns required by the Next.js/Vercel fork.
-- Authentication moves to Bitrix OAuth, while PSC keeps internal roles,
-- area access and feature flags in the existing users table.

alter table users
  add column if not exists bitrix_user_id text null,
  add column if not exists bitrix_portal_domain text null,
  add column if not exists last_login_at timestamptz null;

create unique index if not exists ux_users_bitrix_identity
  on users (coalesce(bitrix_portal_domain, ''), bitrix_user_id)
  where bitrix_user_id is not null;

create index if not exists idx_users_bitrix_user_id
  on users (bitrix_user_id)
  where bitrix_user_id is not null;

-- The legacy password_hash column is intentionally kept for compatibility
-- with the current Python app during the transition.
