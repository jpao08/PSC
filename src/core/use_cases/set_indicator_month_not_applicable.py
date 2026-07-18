from __future__ import annotations

from core.domain.models import NotFoundError, User
from core.domain.rules import ensure_indicator_in_user_area, ensure_month, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort


class SetIndicatorMonthNotApplicable:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        indicator_id: str,
        year: int,
        month: int,
        is_not_applicable: bool,
    ) -> None:
        ensure_user_active(user)
        ensure_month(month)

        indicator = self.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise NotFoundError("Indicador nao encontrado.")

        ensure_indicator_in_user_area(user=user, indicator=indicator)
        self.indicator_repository.set_month_not_applicable(
            indicator_id=indicator_id,
            year=year,
            month=month,
            is_not_applicable=is_not_applicable,
            user_id=user.id,
        )
