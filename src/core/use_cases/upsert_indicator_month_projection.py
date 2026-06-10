from __future__ import annotations

from decimal import Decimal

from core.domain.models import IndicatorMonthProjection, NotFoundError, User, ValidationError
from core.domain.rules import ensure_can_edit_projected_value, ensure_month, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort


class UpsertIndicatorMonthProjection:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        indicator_id: str,
        year: int,
        month: int,
        projected_value: Decimal,
    ) -> IndicatorMonthProjection:
        ensure_user_active(user)
        ensure_month(month)

        if projected_value < Decimal("0"):
            raise ValidationError("O valor projetado mensal nao pode ser negativo.")

        indicator = self.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise NotFoundError("Indicador nao encontrado.")

        ensure_can_edit_projected_value(user=user, indicator=indicator)

        return self.indicator_repository.upsert_month_projection(
            indicator_id=indicator_id,
            year=year,
            month=month,
            projected_value=projected_value,
            user_id=user.id,
        )
