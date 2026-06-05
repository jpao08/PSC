from __future__ import annotations

from core.domain.models import Indicator, NewIndicator, NotFoundError, User, ValidationError
from core.domain.rules import (
    ensure_required_text,
    ensure_role,
    ensure_user_active,
    ensure_valid_aggregation,
)
from core.ports.repositories import IndicatorRepositoryPort


class UpdateIndicator:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        indicator_id: str,
        area_id: str,
        name: str,
        description: str | None,
        aggregation_type: str,
        unit_id: str,
    ) -> Indicator:
        ensure_user_active(user)
        ensure_role(user, "executivo")
        ensure_valid_aggregation(aggregation_type)

        current = self.indicator_repository.get_by_id(indicator_id)
        if current is None:
            raise NotFoundError("Indicador nao encontrado.")

        clean_name = ensure_required_text(name, "nome")
        clean_area_id = ensure_required_text(area_id, "area")
        clean_unit_id = ensure_required_text(unit_id, "unidade")

        unit = self.indicator_repository.get_unit_by_id(clean_unit_id)
        if unit is None or not unit.is_active:
            raise ValidationError("Unidade invalida para cadastro de indicador.")

        if self.indicator_repository.exists_active_name(
            name=clean_name,
            exclude_indicator_id=indicator_id,
        ):
            raise ValidationError("Ja existe um indicador ativo com este nome.")

        return self.indicator_repository.update_indicator(
            indicator_id=indicator_id,
            indicator=NewIndicator(
                name=clean_name,
                area_id=clean_area_id,
                description=description.strip() if description else None,
                aggregation_type=aggregation_type,
                unit_id=clean_unit_id,
                created_by=current.created_by or user.id,
            ),
        )
