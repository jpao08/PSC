from __future__ import annotations

from core.domain.models import NotFoundError, User
from core.domain.rules import ensure_role, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort


class DeleteArea:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(self, user: User, area_id: str) -> None:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        area = self.indicator_repository.get_area_by_id(area_id)
        if area is None or not area.is_active:
            raise NotFoundError("Area nao encontrada.")

        self.indicator_repository.deactivate_area(area_id=area_id)
