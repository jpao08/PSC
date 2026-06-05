from __future__ import annotations

from datetime import date
from typing import Protocol

from core.domain.models import BitrixUser


class TaskGatewayPort(Protocol):
    def search_users(self, query: str, limit: int = 10) -> list[BitrixUser]:
        ...

    def create_task(
        self,
        title: str,
        description: str,
        responsible_bitrix_user_id: str | None,
        due_date: date | None,
        creator_bitrix_user_id: str | None = None,
        observer_bitrix_user_ids: list[str] | None = None,
    ) -> str | None:
        ...
