from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from core.domain.models import (
    ActionPlan,
    ActionPlanHistoryEvent,
    Area,
    CommercialDrilldownDashboard,
    CommercialDrilldownItemsPage,
    CommercialSyncStartResult,
    Indicator,
    IndicatorMonthNotApplicable,
    IndicatorMonthProjection,
    IndicatorMonthTarget,
    IndicatorUnit,
    IndicatorValue,
    IndicatorYearPlanning,
    IssueReport,
    IssueTag,
    NewActionPlan,
    NewIssueReport,
    NewIndicator,
    NewWinReport,
    User,
    WinReport,
)


class UserRepositoryPort(Protocol):
    def get_by_email(self, email: str) -> User | None:
        ...

    def get_by_id(self, user_id: str) -> User | None:
        ...


class IndicatorRepositoryPort(Protocol):
    def list_active(
        self,
        area_id: str | None = None,
        area_ids: list[str] | None = None,
    ) -> list[Indicator]:
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

    def list_month_not_applicable(
        self,
        indicator_ids: list[str],
        year: int,
    ) -> list[IndicatorMonthNotApplicable]:
        ...

    def list_year_planning(
        self,
        indicator_ids: list[str],
        year: int,
    ) -> list[IndicatorYearPlanning]:
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

    def delete_month_target(self, indicator_id: str, year: int, month: int) -> None:
        ...

    def delete_month_projection(self, indicator_id: str, year: int, month: int) -> None:
        ...

    def set_month_not_applicable(
        self,
        indicator_id: str,
        year: int,
        month: int,
        is_not_applicable: bool,
        user_id: str,
    ) -> None:
        ...

    def upsert_year_planning(
        self,
        indicator_id: str,
        year: int,
        annual_target: Decimal | None,
        confidence_level: Decimal | None,
        user_id: str,
    ) -> IndicatorYearPlanning:
        ...


class ActionPlanRepositoryPort(Protocol):
    def create_action_plan(self, plan: NewActionPlan) -> ActionPlan:
        ...

    def add_action_plan_history(self, event: ActionPlanHistoryEvent) -> None:
        ...

    def list_action_plans(self, indicator_id: str) -> list[ActionPlan]:
        ...


class IssueReportRepositoryPort(Protocol):
    def create_issue_report(self, issue: NewIssueReport) -> IssueReport:
        ...

    def list_issue_reports(self, requester_id: str | None = None) -> list[IssueReport]:
        ...

    def update_executive_review(
        self,
        issue_id: str,
        executive_gravity: int | None,
        executive_urgency: int | None,
        executive_tendency: int | None,
        status: str | None,
        reviewed_by: str,
    ) -> IssueReport:
        ...

    def soft_delete_issue_report(self, issue_id: str, deleted_by: str) -> None:
        ...

    def list_issue_tags(self) -> list[IssueTag]:
        ...

    def create_issue_tag(self, name: str, color: str | None, created_by: str) -> IssueTag:
        ...

    def update_issue_tag(self, tag_id: str, name: str, color: str | None) -> IssueTag:
        ...

    def deactivate_issue_tag(self, tag_id: str) -> None:
        ...

    def replace_issue_tags(self, issue_id: str, tag_ids: list[str], updated_by: str) -> IssueReport:
        ...


class WinReportRepositoryPort(Protocol):
    def create_win_report(self, win: NewWinReport) -> WinReport:
        ...

    def list_win_reports(self, requester_id: str | None = None) -> list[WinReport]:
        ...

    def update_win_status(
        self,
        win_id: str,
        status: str | None,
        reviewed_by: str,
    ) -> WinReport:
        ...

    def soft_delete_win_report(self, win_id: str, deleted_by: str) -> None:
        ...


class CommercialDrilldownRepositoryPort(Protocol):
    def get_dashboard(self, year: int) -> CommercialDrilldownDashboard:
        ...

    def get_items(
        self,
        year: int,
        month: int,
        metric_key: str,
        responsible_id: str | None,
        query: str | None,
        page: int,
        page_size: int,
        sort: str,
    ) -> CommercialDrilldownItemsPage:
        ...

    def start_sync(self, triggered_by_user_id: str) -> CommercialSyncStartResult:
        ...

    def get_sync_status(self) -> dict[str, object]:
        ...


class SessionPort(Protocol):
    def issue_token(self, user_id: str) -> str:
        ...

    def read_user_id(self, token: str) -> str | None:
        ...
