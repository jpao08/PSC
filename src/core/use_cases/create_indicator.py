from __future__ import annotations

from decimal import Decimal

from core.domain.models import Indicator, NewIndicator, User
from core.domain.rules import (
    ensure_required_text,
    ensure_role,
    ensure_user_active,
    ensure_valid_aggregation,
)
from core.ports.repositories import IndicatorRepositoryPort


class CreateIndicator:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        area_id: str,
        name: str,
        description: str | None,
        aggregation_type: str,
        unit: str | None,
        target_value: Decimal | None,
    ) -> Indicator:
        ensure_user_active(user)
        ensure_role(user, "executivo")
        ensure_valid_aggregation(aggregation_type)

        return self.indicator_repository.create_indicator(
            NewIndicator(
                area_id=ensure_required_text(area_id, "area"),
                name=ensure_required_text(name, "nome"),
                description=description.strip() if description else None,
                aggregation_type=aggregation_type,
                unit=unit.strip() if unit else None,
                target_value=target_value,
                created_by=user.id,
            )
        )
