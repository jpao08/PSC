from __future__ import annotations

import calendar
import base64
import hashlib
import hmac
import re
import secrets
from datetime import date
from decimal import Decimal
from typing import Iterable

from core.domain.models import (
    AggregationType,
    AuthenticationError,
    AuthorizationError,
    Indicator,
    IssueStatus,
    User,
    ValidationError,
)

_AREA_SCOPED_ROLES = {"gestor_area", "gestor_tatico", "gestor_operacional"}
_GLOBAL_VIEW_ROLES = {"executivo", "executivo_visualizacao"}
_VALID_ROLES = _AREA_SCOPED_ROLES | _GLOBAL_VIEW_ROLES
_VALID_AGGREGATIONS = {"sum", "avg", "latest"}
_VALID_ISSUE_STATUSES = {
    "Concluído",
    "Em atendimento",
    "Em Planejamento",
    "Delegada",
    "Recusada",
    "Não Iniciada",
}
_HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str, salt: str | None = None, iterations: int = 120_000) -> str:
    cleaned = password.strip()
    if not cleaned:
        raise ValidationError("A senha nao pode ser vazia.")
    local_salt = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        cleaned.encode("utf-8"),
        local_salt.encode("utf-8"),
        iterations,
    )
    encoded = base64.b64encode(derived).decode("ascii")
    return f"pbkdf2_sha256${iterations}${local_salt}${encoded}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt, _ = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    try:
        iterations = int(iterations_raw)
    except ValueError:
        return False
    computed = hash_password(password=password, salt=salt, iterations=iterations)
    return hmac.compare_digest(computed, stored_hash)


def ensure_user_active(user: User) -> None:
    if not user.is_active:
        raise AuthenticationError("Usuario inativo.")


def ensure_role(user: User, expected_role: str) -> None:
    if user.role != expected_role:
        raise AuthorizationError("Voce nao tem permissao para esta operacao.")


def ensure_valid_role(role: str) -> None:
    if role not in _VALID_ROLES:
        raise ValidationError("Role invalida.")


def ensure_valid_aggregation(aggregation_type: str) -> None:
    if aggregation_type not in _VALID_AGGREGATIONS:
        raise ValidationError("Tipo de agregacao invalido. Use sum, avg ou latest.")


def ensure_month(month: int) -> None:
    if month < 1 or month > 12:
        raise ValidationError("Mes deve estar entre 1 e 12.")


def ensure_week(week_number: int) -> None:
    if week_number < 1 or week_number > 4:
        raise ValidationError("Faixa deve estar entre 1 e 4.")


def get_month_ranges(year: int, month: int) -> list[tuple[int, int, int]]:
    ensure_month(month)
    last_day = calendar.monthrange(year, month)[1]
    return [
        (1, 1, 7),
        (2, 8, 14),
        (3, 15, 21),
        (4, 22, last_day),
    ]


def get_range_days_count(year: int, month: int, week_number: int) -> int:
    ensure_week(week_number)
    ranges = get_month_ranges(year=year, month=month)
    for number, start_day, end_day in ranges:
        if number == week_number:
            return (end_day - start_day) + 1
    raise ValidationError("Faixa mensal invalida.")


def ensure_indicator_in_user_area(user: User, indicator: Indicator) -> None:
    if user.role != "gestor_area":
        raise AuthorizationError("Somente gestor de area pode atualizar valores semanais.")
    if indicator.area_id not in get_user_area_ids(user):
        raise AuthorizationError("Indicador nao pertence a area do gestor.")


def ensure_can_view_indicator(user: User, indicator: Indicator) -> None:
    if user.role in _GLOBAL_VIEW_ROLES:
        return
    if user.role in _AREA_SCOPED_ROLES and indicator.area_id in get_user_area_ids(user):
        return
    raise AuthorizationError("Usuario sem permissao para acessar este indicador.")


def get_user_area_ids(user: User) -> list[str]:
    area_ids = list(user.area_ids or [])
    if user.area_id and user.area_id not in area_ids:
        area_ids.append(user.area_id)
    return area_ids


def ensure_can_edit_projected_value(user: User, indicator: Indicator) -> None:
    ensure_can_view_indicator(user=user, indicator=indicator)
    if not user.can_edit_projected_value:
        raise AuthorizationError("Usuario sem permissao para cadastrar valor projetado.")


def ensure_can_use_issue_reports(user: User) -> None:
    if user.role == "executivo" or user.can_use_issue_reports:
        return
    raise AuthorizationError("Usuario sem permissao para acessar Issue Reports.")


def ensure_can_use_commercial_drilldown(user: User) -> None:
    ensure_user_active(user)
    if user.role == "executivo" or user.can_view_commercial_drilldown:
        return
    raise AuthorizationError("Usuario sem permissao para acessar Drill Down Comercial.")


def ensure_can_use_marketing_drilldown(user: User) -> None:
    ensure_user_active(user)
    if user.role == "executivo" or user.can_view_marketing_drilldown:
        return
    raise AuthorizationError("Usuario sem permissao para acessar Drill Down Marketing.")


def ensure_can_view_financial_drilldown(user: User) -> None:
    ensure_user_active(user)
    if user.role == "executivo" or user.can_view_financial_drilldown or user.can_edit_financial_drilldown:
        return
    raise AuthorizationError("Usuario sem permissao para acessar Drill Down Financeiro.")


def ensure_can_edit_financial_drilldown(user: User) -> None:
    ensure_user_active(user)
    if user.role == "executivo" or user.can_edit_financial_drilldown:
        return
    raise AuthorizationError("Usuario sem permissao para editar Drill Down Financeiro.")


def ensure_can_start_commercial_sync(user: User) -> None:
    ensure_user_active(user)
    if user.role == "executivo" or user.can_admin_users:
        return
    raise AuthorizationError("Somente Admin pode iniciar sincronizacao comercial.")


def ensure_issue_gut_value(value: int, field_name: str) -> int:
    if value < 1 or value > 5:
        raise ValidationError(f"Campo {field_name} deve estar entre 1 e 5.")
    return value


def ensure_issue_status(status: str) -> IssueStatus:
    if status not in _VALID_ISSUE_STATUSES:
        raise ValidationError("Status de Issue Report invalido.")
    return status  # type: ignore[return-value]


def ensure_required_text(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError(f"Campo obrigatorio: {field_name}.")
    return cleaned


def ensure_maturity_level(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value < Decimal("0") or value > Decimal("100"):
        raise ValidationError("Maturidade deve estar entre 0 e 100.")
    return value


def ensure_confidence_level(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value < Decimal("0") or value > Decimal("100"):
        raise ValidationError("Confianca deve estar entre 0 e 100.")
    return value


def classify_performance(value: Decimal | None) -> str:
    if value is None:
        return "neutral"
    if value <= Decimal("30"):
        return "not_reliable"
    if value <= Decimal("50"):
        return "fragile"
    if value <= Decimal("70"):
        return "functional"
    if value <= Decimal("90"):
        return "reliable"
    return "strategic"


def calculate_achievement_percent(value: Decimal | None, target: Decimal | None) -> Decimal | None:
    if value is None or target is None or target == Decimal("0"):
        return None
    return (value / target) * Decimal("100")


def calculate_annual_value(
    values: Iterable[tuple[int, Decimal]],
    aggregation_type: AggregationType,
) -> Decimal | None:
    collected = list(values)
    if not collected:
        return None
    raw_values = [value for _, value in collected]
    if aggregation_type == "sum":
        return sum(raw_values, start=Decimal("0"))
    if aggregation_type == "latest":
        return max(collected, key=lambda item: item[0])[1]
    return sum(raw_values, start=Decimal("0")) / Decimal(len(raw_values))


def calculate_period_value(
    values: Iterable[tuple[int, Decimal]],
    aggregation_type: AggregationType,
) -> Decimal | None:
    return calculate_annual_value(values=values, aggregation_type=aggregation_type)


def resolve_monthly_snapshot(values: Iterable[tuple[int, Decimal]]) -> Decimal | None:
    collected = list(values)
    if not collected:
        return None
    return max(collected, key=lambda item: item[0])[1]


def ensure_hex_color_or_none(hex_color: str | None, field_name: str = "hex_color") -> str | None:
    if hex_color is None:
        return None
    cleaned = hex_color.strip()
    if not cleaned:
        return None
    if not _HEX_COLOR_PATTERN.fullmatch(cleaned):
        raise ValidationError(f"Campo {field_name} deve seguir o formato #RRGGBB.")
    return cleaned


def calculate_monthly_value(
    values: Iterable[tuple[int, Decimal]],
    aggregation_type: AggregationType,
    year: int,
    month: int,
) -> Decimal | None:
    _ = (aggregation_type, year, month)
    return resolve_monthly_snapshot(values)


def indicator_type_label(aggregation_type: AggregationType) -> str:
    if aggregation_type == "sum":
        return "Fluxo"
    if aggregation_type == "latest":
        return "Posicao"
    return "Proporcional"


def month_status(value: Decimal | None, not_applicable: bool) -> str:
    if not_applicable:
        return "not_calculable"
    if value is not None:
        return "filled"
    return "pending"


def quarter_months(quarter: int) -> list[int]:
    if quarter < 1 or quarter > 4:
        raise ValidationError("Trimestre deve estar entre 1 e 4.")
    start = ((quarter - 1) * 3) + 1
    return [start, start + 1, start + 2]


def quarter_for_month(month: int) -> int:
    ensure_month(month)
    return ((month - 1) // 3) + 1


def current_quarter_for_year(year: int, today: date | None = None) -> int:
    today = today or date.today()
    if year < today.year:
        return 4
    if year > today.year:
        return 1
    return quarter_for_month(today.month)


def last_closed_quarter_for_year(year: int, today: date | None = None) -> int | None:
    today = today or date.today()
    if year < today.year:
        return 4
    if year > today.year:
        return None
    current = quarter_for_month(today.month)
    if current == 1:
        return None
    return current - 1


def month_names_for_observation(month_numbers: list[int]) -> str:
    names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    return ", ".join(names[month - 1] for month in month_numbers)


def build_quarter_summary(
    quarter: int,
    aggregation_type: AggregationType,
    month_values: Iterable[tuple[int, Decimal | None, Decimal | None, str]],
    annual_target: Decimal | None,
    is_closed: bool,
) -> dict[str, object]:
    months = quarter_months(quarter)
    collected = list(month_values)
    not_calculable_months = [month for month, _, _, status in collected if status == "not_calculable"]
    pending_months = [month for month, _, _, status in collected if status == "pending"]
    filled_values = [
        (month, value)
        for month, value, _, status in collected
        if status == "filled" and value is not None
    ]
    target_values = [
        (month, target)
        for month, _, target, status in collected
        if status != "not_calculable" and target is not None
    ]
    expected_count = len(months) - len(not_calculable_months)
    filled_count = len(filled_values)
    completeness = (
        None
        if expected_count == 0
        else (Decimal(filled_count) / Decimal(expected_count)) * Decimal("100")
    )
    completeness_label = "N/A" if completeness is None else f"{completeness.quantize(Decimal('1'))}%"
    parts = [f"Completude: {completeness_label}"]
    if not_calculable_months:
        parts.append(f"Nao Calculavel: {month_names_for_observation(not_calculable_months)}")
    if pending_months:
        parts.append(f"Pendente: {month_names_for_observation(pending_months)}")
    if not pending_months and not not_calculable_months:
        parts.append("Nenhuma pendencia identificada")
    return {
        "quarter": quarter,
        "label": f"T{quarter}",
        "months": months,
        "value": calculate_period_value(filled_values, aggregation_type),
        "target": calculate_period_value(target_values, aggregation_type),
        "annual_target": annual_target,
        "completeness_percent": completeness,
        "filled_count": filled_count,
        "expected_count": expected_count,
        "not_calculable_months": not_calculable_months,
        "pending_months": pending_months,
        "analysis": f"Consolidado calculado com {filled_count} de {expected_count} meses disponiveis.",
        "observation": " | ".join(parts),
        "is_closed": is_closed,
    }
