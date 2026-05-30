from __future__ import annotations

from typing import Protocol

from core.domain.models import (
    ActionPlan,
    ActionPlanHistoryEvent,
    Area,
    Indicator,
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

    def list_areas(self) -> list[Area]:
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
