from __future__ import annotations

import unicodedata
from typing import Any

import httpx


class BitrixClient:
    def __init__(self, webhook_url: str, timeout_seconds: float = 10.0) -> None:
        self.webhook_url = webhook_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def create_task(self, fields: dict[str, Any]) -> str | None:
        if not self.webhook_url:
            return None
        payload = self._post("tasks.task.add", {"fields": fields})
        result = payload.get("result")

        if isinstance(result, dict):
            task = result.get("task")
            if isinstance(task, dict) and task.get("id") is not None:
                return str(task["id"])
            if result.get("id") is not None:
                return str(result["id"])

        if result is None:
            return None
        return str(result)

    def search_users(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        if not self.webhook_url:
            return []
        clean_query = query.strip()
        if not clean_query:
            return []
        bounded_limit = max(1, min(limit, 20))

        direct_search_matches = self._search_users_with_query_params(
            method="user.search",
            query=clean_query,
            limit=bounded_limit,
        )
        if direct_search_matches:
            return direct_search_matches

        # Some portals/webhooks ignore FIND for user.search. In this case, paginate user.get
        # and filter in memory to keep autocomplete functional.
        return self._search_users_with_fallback_scan(clean_query, bounded_limit)

    def _post(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.webhook_url}/{method}.json"
        response = httpx.post(url, json=payload, timeout=self.timeout_seconds)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            return {}
        return data

    def _get(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.webhook_url}/{method}.json"
        response = httpx.get(url, params=params, timeout=self.timeout_seconds)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            return {}
        return data

    def _search_users_with_query_params(
        self,
        method: str,
        query: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0
        while len(rows) < limit:
            payload = self._get(
                method=method,
                params={
                    "filter[FIND]": query,
                    "filter[ACTIVE]": "Y",
                    "select[0]": "ID",
                    "select[1]": "NAME",
                    "select[2]": "LAST_NAME",
                    "select[3]": "EMAIL",
                    "select[4]": "ACTIVE",
                    "start": start,
                },
            )
            result = payload.get("result")
            if not isinstance(result, list) or not result:
                break
            rows.extend(item for item in result if isinstance(item, dict))

            next_start = payload.get("next")
            if next_start is None:
                break
            try:
                start = int(next_start)
            except (TypeError, ValueError):
                break
        return rows[:limit]

    def _search_users_with_fallback_scan(
        self,
        query: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        normalized_query = _normalize_for_search(query)
        matches: list[dict[str, Any]] = []
        start = 0
        while len(matches) < limit:
            payload = self._get(
                method="user.get",
                params={
                    "filter[ACTIVE]": "Y",
                    "select[0]": "ID",
                    "select[1]": "NAME",
                    "select[2]": "LAST_NAME",
                    "select[3]": "EMAIL",
                    "select[4]": "ACTIVE",
                    "start": start,
                },
            )
            result = payload.get("result")
            if not isinstance(result, list) or not result:
                break

            for row in result:
                if not isinstance(row, dict):
                    continue
                if not _is_active_user(row):
                    continue
                candidate = " ".join(
                    [
                        str(row.get("NAME") or ""),
                        str(row.get("LAST_NAME") or ""),
                        str(row.get("EMAIL") or ""),
                    ]
                ).strip()
                if normalized_query and normalized_query not in _normalize_for_search(candidate):
                    continue
                matches.append(row)
                if len(matches) >= limit:
                    break

            next_start = payload.get("next")
            if next_start is None:
                break
            try:
                start = int(next_start)
            except (TypeError, ValueError):
                break

        return matches[:limit]


def _normalize_for_search(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _is_active_user(row: dict[str, Any]) -> bool:
    raw_active = row.get("ACTIVE")
    if isinstance(raw_active, bool):
        return raw_active
    return str(raw_active).strip().upper() in {"Y", "TRUE", "1"}
