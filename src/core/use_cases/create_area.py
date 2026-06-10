from __future__ import annotations

from core.domain.models import Area, User, ValidationError
from core.domain.rules import (
    ensure_hex_color_or_none,
    ensure_required_text,
    ensure_role,
    ensure_user_active,
)
from core.ports.repositories import IndicatorRepositoryPort


class CreateArea:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(self, user: User, name: str, hex_color: str | None) -> Area:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        clean_name = ensure_required_text(name, "nome")
        clean_hex_color = ensure_hex_color_or_none(hex_color)

        if self.indicator_repository.exists_active_area_name(clean_name):
            raise ValidationError("Ja existe uma area ativa com este nome.")

        return self.indicator_repository.create_area(
            name=clean_name,
            hex_color=clean_hex_color,
        )
