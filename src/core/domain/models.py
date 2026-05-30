from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

Role = Literal["gestor_area", "executivo"]
AggregationType = Literal["sum", "avg"]


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


@dataclass(frozen=True)
class Area:
    id: str
    name: str
    is_active: bool = True


@dataclass(frozen=True)
class Indicator:
    id: str
    area_id: str
    area_name: str | None
    name: str
    description: str | None
    aggregation_type: AggregationType
    unit: str | None
    target_value: Decimal | None
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
    aggregation_type: AggregationType
    unit: str | None
    target_value: Decimal | None
    monthly_values: dict[int, Decimal | None]


@dataclass(frozen=True)
class NewActionPlan:
    indicator_id: str
    title: str
    problem_description: str
    expected_action: str
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
    problem_description: str
    expected_action: str
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
    unit: str | None
    target_value: Decimal | None
    created_by: str


@dataclass(frozen=True)
class AuthenticatedSession:
    token: str
    user: User
