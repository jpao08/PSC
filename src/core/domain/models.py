from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

Role = Literal[
    "gestor_area",
    "gestor_tatico",
    "gestor_operacional",
    "executivo",
    "executivo_visualizacao",
]
AggregationType = Literal["sum", "avg", "latest"]


class DomainError(Exception):
    """Base domain error."""


class AuthenticationError(DomainError):
    """Raised when credentials are invalid."""


class AuthorizationError(DomainError):
    """Raised when the user has no permission for an operation."""


class ValidationError(DomainError):
    """Raised when user input violates business rules."""


class NotFoundError(DomainError):
    """Raised when an entity does not exist."""


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str
    role: Role
    area_id: str | None
    is_active: bool
    password_hash: str
    can_edit_projected_value: bool = False
    can_edit_indicator_maturity: bool = False
    can_use_issue_reports: bool = False
    can_admin_users: bool = False
    can_view_commercial_drilldown: bool = False
    can_view_marketing_drilldown: bool = False
    can_view_financial_drilldown: bool = False
    can_edit_financial_drilldown: bool = False
    bitrix_user_id: str | None = None
    bitrix_portal_domain: str | None = None
    area_ids: list[str] | None = None


@dataclass(frozen=True)
class Area:
    id: str
    name: str
    hex_color: str | None = None
    is_active: bool = True


@dataclass(frozen=True)
class IndicatorUnit:
    id: str
    code: str
    label: str
    is_active: bool = True


@dataclass(frozen=True)
class Indicator:
    id: str
    area_id: str
    area_name: str | None
    area_hex_color: str | None
    name: str
    description: str | None
    aggregation_type: AggregationType
    unit_id: str | None
    unit: str | None
    is_active: bool
    created_by: str | None
    maturity_level: Decimal | None = None


@dataclass(frozen=True)
class IndicatorValue:
    indicator_id: str
    year: int
    month: int
    week_number: int
    value: Decimal
    source_user_id: str


@dataclass(frozen=True)
class IndicatorTableRow:
    indicator_id: str
    indicator_name: str
    area_id: str
    area_name: str | None
    area_hex_color: str | None
    description: str | None
    aggregation_type: AggregationType
    unit_id: str | None
    unit: str | None
    maturity_level: Decimal | None
    monthly_values: dict[int, Decimal | None]
    monthly_projections: dict[int, Decimal | None]
    monthly_targets: dict[int, Decimal | None]
    not_applicable: dict[int, bool]
    below_target: dict[int, bool]
    annual_target: Decimal | None = None
    annual_projected: Decimal | None = None
    annual_real: Decimal | None = None
    confidence_level: Decimal | None = None
    projected_achievement_percent: Decimal | None = None
    maturity_classification: str = "neutral"
    confidence_classification: str = "neutral"
    projected_achievement_classification: str = "neutral"


@dataclass(frozen=True)
class IndicatorMonthTarget:
    indicator_id: str
    year: int
    month: int
    target_value: Decimal
    created_by: str | None
    updated_by: str | None


@dataclass(frozen=True)
class IndicatorMonthProjection:
    indicator_id: str
    year: int
    month: int
    projected_value: Decimal
    created_by: str | None
    updated_by: str | None


@dataclass(frozen=True)
class IndicatorYearPlanning:
    indicator_id: str
    year: int
    annual_target: Decimal | None
    confidence_level: Decimal | None
    created_by: str | None
    updated_by: str | None


@dataclass(frozen=True)
class IndicatorMonthNotApplicable:
    indicator_id: str
    year: int
    month: int
    marked_by: str | None


@dataclass(frozen=True)
class NewActionPlan:
    indicator_id: str
    title: str
    ocorrencia: str
    identificacao_causa: str
    proposta_solucao: str
    bitrix_responsible_id: str | None
    responsible_name: str
    responsible_email: str | None
    due_date: date | None
    bitrix_task_id: str | None
    status: str
    created_by: str


@dataclass(frozen=True)
class ActionPlan:
    id: str
    indicator_id: str
    title: str
    ocorrencia: str
    identificacao_causa: str
    proposta_solucao: str
    bitrix_responsible_id: str | None
    responsible_name: str
    responsible_email: str | None
    due_date: date | None
    bitrix_task_id: str | None
    status: str
    created_by: str


@dataclass(frozen=True)
class ActionPlanHistoryEvent:
    action_plan_id: str
    event_type: str
    event_description: str
    created_by: str


@dataclass(frozen=True)
class BitrixUser:
    id: str
    name: str
    email: str | None


@dataclass(frozen=True)
class NewIndicator:
    area_id: str
    name: str
    description: str | None
    aggregation_type: AggregationType
    unit_id: str
    maturity_level: Decimal | None
    created_by: str


IssueStatus = Literal[
    "Concluído",
    "Em atendimento",
    "Em Planejamento",
    "Delegada",
    "Recusada",
    "Não Iniciada",
]


@dataclass(frozen=True)
class NewIssueReport:
    title: str
    requester_id: str
    area_id: str | None
    is_other_area: bool
    requester_gravity: int
    requester_urgency: int
    requester_tendency: int
    ocorrencia: str
    identificacao_causa: str
    proposta_solucao: str


@dataclass(frozen=True)
class IssueReport:
    id: str
    title: str
    requester_id: str
    requester_name: str | None
    area_id: str | None
    area_name: str | None
    is_other_area: bool
    requester_gravity: int
    requester_urgency: int
    requester_tendency: int
    requester_priority_score: int
    executive_gravity: int | None
    executive_urgency: int | None
    executive_tendency: int | None
    executive_priority_score: int | None
    ocorrencia: str
    identificacao_causa: str
    proposta_solucao: str
    status: IssueStatus
    created_at: datetime
    reviewed_by: str | None
    reviewed_at: datetime | None
    tags: list["IssueTag"] | None = None


@dataclass(frozen=True)
class IssueTag:
    id: str
    name: str
    color: str | None
    is_active: bool = True


@dataclass(frozen=True)
class NewWinReport:
    title: str
    requester_id: str
    area_id: str | None
    is_other_area: bool
    description: str


@dataclass(frozen=True)
class WinReport:
    id: str
    title: str
    requester_id: str
    requester_name: str | None
    area_id: str | None
    area_name: str | None
    is_other_area: bool
    description: str
    status: IssueStatus
    created_at: datetime
    reviewed_by: str | None
    reviewed_at: datetime | None


@dataclass(frozen=True)
class AuthenticatedSession:
    token: str
    user: User


CommercialMetricKind = Literal["flow", "stock"]
CommercialMetricUnit = Literal["quantity", "money"]
CommercialSyncStatus = Literal["pending", "running", "completed", "failed", "cancelled"]


@dataclass(frozen=True)
class CommercialSyncJob:
    job_id: str
    job_type: str
    status: CommercialSyncStatus
    started_at: datetime | None
    current_step: str | None
    processed_records: int
    total_records: int | None
    created_at: datetime | None
    updated_at: datetime | None


@dataclass(frozen=True)
class CommercialDrilldownRow:
    responsible_id: str | None
    responsible_name: str
    responsible_active: bool
    months: dict[str, Decimal | None]
    annual_summary: Decimal | None
    is_total: bool = False


@dataclass(frozen=True)
class CommercialDrilldownMetric:
    metric_key: str
    label: str
    kind: CommercialMetricKind
    unit: CommercialMetricUnit
    summary_label: str
    rows: list[CommercialDrilldownRow]


@dataclass(frozen=True)
class CommercialDrilldownDashboard:
    year: int
    months: list[int]
    responsibles: list[dict[str, object]]
    metrics: list[CommercialDrilldownMetric]
    last_successful_sync_at: datetime | None
    active_job: CommercialSyncJob | None


@dataclass(frozen=True)
class CommercialDrilldownItem:
    deal_id: str
    title: str | None
    responsible_id: str | None
    responsible_name: str
    responsible_status: Literal["active", "inactive"]
    stage_id: str | None
    stage_name: str | None
    event_date: datetime | None
    reference_date: datetime | None
    quantity_contribution: Decimal | None
    monetary_contribution: Decimal | None
    opportunity: Decimal | None
    currency_id: str | None
    bitrix_url: str | None


@dataclass(frozen=True)
class CommercialDrilldownItemsPage:
    year: int
    month: int
    metric_key: str
    responsible_id: str | None
    page: int
    page_size: int
    total_items: int
    items: list[CommercialDrilldownItem]


@dataclass(frozen=True)
class CommercialSyncStartResult:
    job_id: str
    status: CommercialSyncStatus
    created: bool
    message: str
