from __future__ import annotations

from decimal import Decimal

from core.domain.models import IndicatorValue, NotFoundError, User
from core.domain.rules import (
    ensure_indicator_in_user_area,
    ensure_month,
    ensure_user_active,
    ensure_week,
)
from core.ports.repositories import IndicatorRepositoryPort


class RegisterIndicatorValue:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        indicator_id: str,
        year: int,
        month: int,
        week_number: int,
        value: Decimal,
    ) -> IndicatorValue:
        ensure_user_active(user)
        ensure_month(month)
        ensure_week(week_number)
        indicator = self.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise NotFoundError("Indicador nao encontrado.")
        ensure_indicator_in_user_area(user=user, indicator=indicator)

        weekly_value = IndicatorValue(
            indicator_id=indicator_id,
            year=year,
            month=month,
            week_number=week_number,
            value=value,
            source_user_id=user.id,
        )
        self.indicator_repository.upsert_weekly_value(weekly_value)
        return weekly_value
