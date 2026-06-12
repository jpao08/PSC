from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

Role = Literal["gestor_area", "executivo"]
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
    monthly_values: dict[int, Decimal | None]
    monthly_projections: dict[int, Decimal | None]
    monthly_targets: dict[int, Decimal | None]
    below_target: dict[int, bool]


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
    created_by: str


@dataclass(frozen=True)
class AuthenticatedSession:
    token: str
    user: User
