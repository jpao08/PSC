from __future__ import annotations

from core.domain.models import NotFoundError, User
from core.domain.rules import ensure_role, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort


class DeleteIndicator:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(self, user: User, indicator_id: str) -> None:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        indicator = self.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise NotFoundError("Indicador nao encontrado.")

        self.indicator_repository.delete_indicator_with_history(indicator_id=indicator_id)
