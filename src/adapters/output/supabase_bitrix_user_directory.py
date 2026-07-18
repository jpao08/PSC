from __future__ import annotations

import unicodedata
from typing import Any

from supabase import Client

from core.domain.models import BitrixUser


class SupabaseBitrixUserDirectory:
    def __init__(self, client: Client, table_name: str = "dim_user") -> None:
        self.client = client
        self.table_name = table_name

    def search_users(self, query: str, limit: int = 10) -> list[BitrixUser]:
        clean_query = query.strip()
        if len(clean_query) < 2:
            return []
        bounded_limit = max(1, min(limit, 20))

        users = self._search_with_ilike(clean_query, bounded_limit)
        if users:
            return users

        # Fallback para buscas sem acento (ex.: "Joao" encontrar "Joao/João").
        return self._search_with_local_normalization(clean_query, bounded_limit)

    def _search_with_ilike(self, query: str, limit: int) -> list[BitrixUser]:
        seen_ids: set[str] = set()
        users: list[BitrixUser] = []
        for column in ("full_name", "email"):
            response = (
                self.client.table(self.table_name)
                .select("bitrix_user_id, full_name, email, is_active")
                .eq("is_active", True)
                .ilike(column, f"%{query}%")
                .order("full_name")
                .limit(limit)
                .execute()
            )
            rows = response.data or []
            for row in rows:
                parsed = _to_bitrix_user(row)
                if parsed is None:
                    continue
                if parsed.id in seen_ids:
                    continue
                users.append(parsed)
                seen_ids.add(parsed.id)
                if len(users) >= limit:
                    return users
        return users

    def _search_with_local_normalization(self, query: str, limit: int) -> list[BitrixUser]:
        response = (
            self.client.table(self.table_name)
            .select("bitrix_user_id, full_name, email, is_active")
            .eq("is_active", True)
            .order("full_name")
            .limit(1000)
            .execute()
        )
        rows = response.data or []
        normalized_query = _normalize_text(query)

        users: list[BitrixUser] = []
        for row in rows:
            parsed = _to_bitrix_user(row)
            if parsed is None:
                continue
            haystack = _normalize_text(f"{parsed.name} {parsed.email or ''}")
            if normalized_query not in haystack:
                continue
            users.append(parsed)
            if len(users) >= limit:
                break
        return users


def _to_bitrix_user(row: dict[str, Any]) -> BitrixUser | None:
    if not _is_truthy(row.get("is_active", True)):
        return None

    raw_id = row.get("bitrix_user_id")
    if raw_id is None:
        return None
    user_id = str(raw_id).strip()
    if not user_id:
        return None

    full_name = str(row.get("full_name") or "").strip()
    if not full_name:
        full_name = user_id

    raw_email = row.get("email")
    email = str(raw_email).strip() if raw_email else None
    return BitrixUser(id=user_id, name=full_name, email=email)


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "y", "yes"}
