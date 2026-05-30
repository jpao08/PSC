from __future__ import annotations

from core.domain.models import BitrixUser, User
from core.domain.rules import ensure_role, ensure_user_active
from core.ports.task_gateway import TaskGatewayPort


class SearchBitrixUsers:
    def __init__(self, task_gateway: TaskGatewayPort) -> None:
        self.task_gateway = task_gateway

    def execute(self, user: User, query: str, limit: int = 10) -> list[BitrixUser]:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        clean_query = query.strip()
        if len(clean_query) < 2:
            return []

        bounded_limit = max(1, min(limit, 20))
        return self.task_gateway.search_users(query=clean_query, limit=bounded_limit)
