from __future__ import annotations

from decimal import Decimal

from core.domain.models import IndicatorMonthTarget, NotFoundError, User, ValidationError
from core.domain.rules import ensure_month, ensure_role, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort


class UpsertIndicatorMonthTarget:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        indicator_id: str,
        year: int,
        month: int,
        target_value: Decimal,
    ) -> IndicatorMonthTarget:
        ensure_user_active(user)
        ensure_role(user, "executivo")
        ensure_month(month)

        if target_value < Decimal("0"):
            raise ValidationError("A meta mensal nao pode ser negativa.")

        indicator = self.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise NotFoundError("Indicador nao encontrado.")

        return self.indicator_repository.upsert_month_target(
            indicator_id=indicator_id,
            year=year,
            month=month,
            target_value=target_value,
            user_id=user.id,
        )
