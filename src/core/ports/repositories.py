from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from core.domain.models import (
    ActionPlan,
    ActionPlanHistoryEvent,
    Area,
    Indicator,
    IndicatorMonthProjection,
    IndicatorMonthTarget,
    IndicatorUnit,
    IndicatorValue,
    NewActionPlan,
    NewIndicator,
    User,
)


class UserRepositoryPort(Protocol):
    def get_by_email(self, email: str) -> User | None:
        ...

    def get_by_id(self, user_id: str) -> User | None:
        ...


class IndicatorRepositoryPort(Protocol):
    def list_active(self, area_id: str | None = None) -> list[Indicator]:
        ...

    def get_by_id(self, indicator_id: str) -> Indicator | None:
        ...

    def list_weekly_values(
        self,
        indicator_ids: list[str],
        year: int,
        month: int | None = None,
    ) -> list[IndicatorValue]:
        ...

    def upsert_weekly_value(self, value: IndicatorValue) -> None:
        ...

    def create_indicator(self, indicator: NewIndicator) -> Indicator:
        ...

    def update_indicator(self, indicator_id: str, indicator: NewIndicator) -> Indicator:
        ...

    def exists_active_name(
        self,
        name: str,
        exclude_indicator_id: str | None = None,
    ) -> bool:
        ...

    def delete_indicator_with_history(self, indicator_id: str) -> None:
        ...

    def list_areas(self) -> list[Area]:
        ...

    def get_area_by_id(self, area_id: str) -> Area | None:
        ...

    def exists_active_area_name(self, name: str, exclude_area_id: str | None = None) -> bool:
        ...

    def create_area(self, name: str, hex_color: str | None) -> Area:
        ...

    def update_area(self, area_id: str, name: str, hex_color: str | None) -> Area:
        ...

    def deactivate_area(self, area_id: str) -> None:
        ...

    def list_units(self) -> list[IndicatorUnit]:
        ...

    def get_unit_by_id(self, unit_id: str) -> IndicatorUnit | None:
        ...

    def list_month_targets(self, indicator_ids: list[str], year: int) -> list[IndicatorMonthTarget]:
        ...

    def list_month_projections(
        self,
        indicator_ids: list[str],
        year: int,
    ) -> list[IndicatorMonthProjection]:
        ...

    def upsert_month_target(
        self,
        indicator_id: str,
        year: int,
        month: int,
        target_value: Decimal,
        user_id: str,
    ) -> IndicatorMonthTarget:
        ...

    def upsert_month_projection(
        self,
        indicator_id: str,
        year: int,
        month: int,
        projected_value: Decimal,
        user_id: str,
    ) -> IndicatorMonthProjection:
        ...


class ActionPlanRepositoryPort(Protocol):
    def create_action_plan(self, plan: NewActionPlan) -> ActionPlan:
        ...

    def add_action_plan_history(self, event: ActionPlanHistoryEvent) -> None:
        ...

    def list_action_plans(self, indicator_id: str) -> list[ActionPlan]:
        ...


class SessionPort(Protocol):
    def issue_token(self, user_id: str) -> str:
        ...

    def read_user_id(self, token: str) -> str | None:
        ...
