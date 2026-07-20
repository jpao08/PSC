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
    can_use_issue_reports: bool = False
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
