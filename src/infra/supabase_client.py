from __future__ import annotations

from supabase import Client, create_client

from infra.config import Settings


def build_supabase_client(settings: Settings) -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError("Configure SUPABASE_URL e SUPABASE_KEY antes de iniciar a aplicacao.")
    return create_client(settings.supabase_url, settings.supabase_key)


def build_optional_users_supabase_client(settings: Settings) -> Client | None:
    if not settings.users_supabase_url or not settings.users_supabase_key:
        return None
    return create_client(settings.users_supabase_url, settings.users_supabase_key)
