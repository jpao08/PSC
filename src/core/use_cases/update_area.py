from __future__ import annotations

from core.domain.models import Area, NotFoundError, User, ValidationError
from core.domain.rules import (
    ensure_hex_color_or_none,
    ensure_required_text,
    ensure_role,
    ensure_user_active,
)
from core.ports.repositories import IndicatorRepositoryPort


class UpdateArea:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        area_id: str,
        name: str,
        hex_color: str | None,
    ) -> Area:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        area = self.indicator_repository.get_area_by_id(area_id)
        if area is None or not area.is_active:
            raise NotFoundError("Area nao encontrada.")

        clean_name = ensure_required_text(name, "nome")
        clean_hex_color = ensure_hex_color_or_none(hex_color)

        if self.indicator_repository.exists_active_area_name(
            name=clean_name,
            exclude_area_id=area_id,
        ):
            raise ValidationError("Ja existe uma area ativa com este nome.")

        return self.indicator_repository.update_area(
            area_id=area_id,
            name=clean_name,
            hex_color=clean_hex_color,
        )
