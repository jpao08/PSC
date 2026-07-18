from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from core.domain.models import IndicatorTableRow, User
from core.domain.rules import calculate_monthly_value, ensure_user_active, get_user_area_ids
from core.ports.repositories import IndicatorRepositoryPort


class ListIndicators:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(self, user: User, year: int) -> list[IndicatorTableRow]:
        ensure_user_active(user)
        area_filter = get_user_area_ids(user) if user.role == "gestor_area" else None
        indicators = self.indicator_repository.list_active(area_ids=area_filter)
        indicator_ids = [indicator.id for indicator in indicators]
        values = self.indicator_repository.list_weekly_values(
            indicator_ids=indicator_ids,
            year=year,
        )
        targets = self.indicator_repository.list_month_targets(
            indicator_ids=indicator_ids,
            year=year,
        )
        projections = self.indicator_repository.list_month_projections(
            indicator_ids=indicator_ids,
            year=year,
        )
        not_applicable_items = self.indicator_repository.list_month_not_applicable(
            indicator_ids=indicator_ids,
            year=year,
        )

        grouped: dict[tuple[str, int], list[tuple[int, Decimal]]] = defaultdict(list)
        for item in values:
            grouped[(item.indicator_id, item.month)].append((item.week_number, item.value))

        target_map = {
            (item.indicator_id, item.month): item.target_value
            for item in targets
        }
        projection_map = {
            (item.indicator_id, item.month): item.projected_value
            for item in projections
        }
        not_applicable_map = {
            (item.indicator_id, item.month): True
            for item in not_applicable_items
        }

        rows: list[IndicatorTableRow] = []
        for indicator in indicators:
            monthly_values: dict[int, Decimal | None] = {}
            monthly_projections: dict[int, Decimal | None] = {}
            monthly_targets: dict[int, Decimal | None] = {}
            not_applicable: dict[int, bool] = {}
            below_target: dict[int, bool] = {}
            for month in range(1, 13):
                is_not_applicable = not_applicable_map.get((indicator.id, month), False)
                not_applicable[month] = is_not_applicable
                monthly_values[month] = (
                    None
                    if is_not_applicable
                    else calculate_monthly_value(
                        values=grouped.get((indicator.id, month), []),
                        aggregation_type=indicator.aggregation_type,
                        year=year,
                        month=month,
                    )
                )
                monthly_targets[month] = target_map.get((indicator.id, month))
                monthly_projections[month] = projection_map.get((indicator.id, month))
                below_target[month] = (
                    not is_not_applicable
                    and
                    monthly_values[month] is not None
                    and monthly_targets[month] is not None
                    and monthly_values[month] < monthly_targets[month]
                )

            rows.append(
                IndicatorTableRow(
                    indicator_id=indicator.id,
                    indicator_name=indicator.name,
                    area_id=indicator.area_id,
                    area_name=indicator.area_name,
                    area_hex_color=indicator.area_hex_color,
                    description=indicator.description,
                    aggregation_type=indicator.aggregation_type,
                    unit_id=indicator.unit_id,
                    unit=indicator.unit,
                    maturity_level=indicator.maturity_level,
                    monthly_values=monthly_values,
                    monthly_projections=monthly_projections,
                    monthly_targets=monthly_targets,
                    not_applicable=not_applicable,
                    below_target=below_target,
                )
            )
        rows.sort(
            key=lambda row: (
                (row.area_name or row.area_id).strip().lower(),
                row.indicator_name.strip().lower(),
            )
        )
        return rows
