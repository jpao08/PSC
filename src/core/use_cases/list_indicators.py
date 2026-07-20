from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from core.domain.models import IndicatorTableRow, User
from core.domain.rules import (
    calculate_achievement_percent,
    calculate_annual_value,
    calculate_monthly_value,
    classify_performance,
    ensure_user_active,
    get_user_area_ids,
)
from core.ports.repositories import IndicatorRepositoryPort


class ListIndicators:
    def __init__(self, indicator_repository: IndicatorRepositoryPort) -> None:
        self.indicator_repository = indicator_repository

    def execute(self, user: User, year: int) -> list[IndicatorTableRow]:
        ensure_user_active(user)
        area_filter = (
            get_user_area_ids(user)
            if user.role in {"gestor_area", "gestor_tatico", "gestor_operacional"}
            else None
        )
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
        year_planning = self.indicator_repository.list_year_planning(
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
        year_planning_map = {
            item.indicator_id: item
            for item in year_planning
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

            planning = year_planning_map.get(indicator.id)
            annual_target = planning.annual_target if planning else None
            confidence_level = planning.confidence_level if planning else None
            real_values = [
                (month, value)
                for month, value in monthly_values.items()
                if value is not None
            ]
            projected_values = [
                (month, monthly_values[month] if monthly_values[month] is not None else projected)
                for month, projected in monthly_projections.items()
                if monthly_values[month] is not None or projected is not None
            ]
            annual_real = calculate_annual_value(real_values, indicator.aggregation_type)
            annual_projected = calculate_annual_value(projected_values, indicator.aggregation_type)
            achievement = calculate_achievement_percent(annual_projected, annual_target)

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
                    annual_target=annual_target,
                    annual_projected=annual_projected,
                    annual_real=annual_real,
                    confidence_level=confidence_level,
                    projected_achievement_percent=achievement,
                    maturity_classification=classify_performance(indicator.maturity_level),
                    confidence_classification=classify_performance(confidence_level),
                    projected_achievement_classification=classify_performance(achievement),
                )
            )
        rows.sort(
            key=lambda row: (
                (row.area_name or row.area_id).strip().lower(),
                row.indicator_name.strip().lower(),
            )
        )
        return rows
