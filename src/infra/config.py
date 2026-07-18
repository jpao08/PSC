from __future__ import annotations

import os
from pathlib import Path
import sys
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    bitrix_webhook_url: str
    app_secret_key: str
    users_supabase_url: str
    users_supabase_key: str
    users_supabase_table: str
    app_token_ttl_minutes: int = 720
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        _load_default_env_files()
        users_supabase_url = _read_users_supabase_url()
        users_supabase_key = _read_users_supabase_key()
        users_supabase_table = _read_users_supabase_table(
            users_supabase_url=users_supabase_url,
            users_supabase_key=users_supabase_key,
        )
        return cls(
            supabase_url=os.getenv("SUPABASE_URL", "").strip(),
            supabase_key=os.getenv("SUPABASE_KEY", "").strip(),
            bitrix_webhook_url=os.getenv("BITRIX_WEBHOOK_URL", "").strip(),
            app_secret_key=os.getenv("APP_SECRET_KEY", "change-me"),
            users_supabase_url=users_supabase_url,
            users_supabase_key=users_supabase_key,
            users_supabase_table=users_supabase_table,
            app_token_ttl_minutes=int(os.getenv("APP_TOKEN_TTL_MINUTES", "720")),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )


def _load_default_env_files() -> None:
    local_env = Path.cwd() / ".env"
    if local_env.exists():
        load_dotenv(dotenv_path=local_env, override=False)

    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        bundled_env = Path(sys._MEIPASS) / ".env"  # type: ignore[attr-defined]
        if bundled_env.exists():
            load_dotenv(dotenv_path=bundled_env, override=False)


def _read_users_supabase_url() -> str:
    for key in ("SUPABASE_USERS_URL", "USERS_SUPABASE_URL"):
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def _read_users_supabase_key() -> str:
    for key in (
        "SUPABASE_USERS_KEY",
        "SUPABASE_USERS_SERVICE_ROLE_KEY",
        "USERS_SUPABASE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
    ):
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def _read_users_supabase_table(
    users_supabase_url: str,
    users_supabase_key: str,
) -> str:
    configured_table = os.getenv("SUPABASE_USERS_TABLE", "").strip()
    if configured_table:
        return configured_table
    if users_supabase_url and users_supabase_key:
        return "dim_user"
    return ""
