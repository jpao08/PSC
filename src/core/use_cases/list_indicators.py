from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from core.domain.models import IndicatorTableRow, User
from core.domain.rules import calculate_monthly_value, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort


class ListIndicators:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(self, user: User, year: int) -> list[IndicatorTableRow]:
        ensure_user_active(user)
        area_filter = user.area_id if user.role == "gestor_area" else None
        indicators = self.indicator_repository.list_active(area_id=area_filter)
        indicator_ids = [indicator.id for indicator in indicators]
        values = self.indicator_repository.list_weekly_values(
            indicator_ids=indicator_ids,
            year=year,
        )

        grouped: dict[tuple[str, int], list[Decimal]] = defaultdict(list)
        for item in values:
            grouped[(item.indicator_id, item.month)].append(item.value)

        rows: list[IndicatorTableRow] = []
        for indicator in indicators:
            monthly_values: dict[int, Decimal | None] = {}
            for month in range(1, 13):
                monthly_values[month] = calculate_monthly_value(
                    values=grouped.get((indicator.id, month), []),
                    aggregation_type=indicator.aggregation_type,
                )

            rows.append(
                IndicatorTableRow(
                    indicator_id=indicator.id,
                    indicator_name=indicator.name,
                    area_id=indicator.area_id,
                    area_name=indicator.area_name,
                    aggregation_type=indicator.aggregation_type,
                    unit=indicator.unit,
                    target_value=indicator.target_value,
                    monthly_values=monthly_values,
                )
            )
        rows.sort(
            key=lambda row: (
                (row.area_name or row.area_id).strip().lower(),
                row.indicator_name.strip().lower(),
            )
        )
        return rows
