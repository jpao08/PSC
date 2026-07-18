from __future__ import annotations

from decimal import Decimal

from core.domain.models import Indicator, NewIndicator, User, ValidationError
from core.domain.rules import (
    ensure_maturity_level,
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
        unit_id: str,
        maturity_level: Decimal | None = None,
    ) -> Indicator:
        ensure_user_active(user)
        ensure_role(user, "executivo")
        ensure_valid_aggregation(aggregation_type)

        clean_name = ensure_required_text(name, "nome")
        clean_unit_id = ensure_required_text(unit_id, "unidade")
        unit = self.indicator_repository.get_unit_by_id(clean_unit_id)
        if unit is None or not unit.is_active:
            raise ValidationError("Unidade invalida para cadastro de indicador.")

        if self.indicator_repository.exists_active_name(clean_name):
            raise ValidationError("Ja existe um indicador ativo com este nome.")

        return self.indicator_repository.create_indicator(
            NewIndicator(
                area_id=ensure_required_text(area_id, "area"),
                name=clean_name,
                description=description.strip() if description else None,
                aggregation_type=aggregation_type,
                unit_id=clean_unit_id,
                maturity_level=ensure_maturity_level(maturity_level),
                created_by=user.id,
            )
        )
