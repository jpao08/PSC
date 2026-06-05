from __future__ import annotations

import calendar
import base64
import hashlib
import hmac
import secrets
from decimal import Decimal
from typing import Iterable

from core.domain.models import (
    AggregationType,
    AuthenticationError,
    AuthorizationError,
    Indicator,
    User,
    ValidationError,
)

_VALID_ROLES = {"gestor_area", "executivo"}
_VALID_AGGREGATIONS = {"sum", "avg"}


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
        raise ValidationError("Tipo de agregacao invalido. Use sum ou avg.")


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
    if not user.area_id or user.area_id != indicator.area_id:
        raise AuthorizationError("Indicador nao pertence a area do gestor.")


def ensure_can_view_indicator(user: User, indicator: Indicator) -> None:
    if user.role == "executivo":
        return
    if user.role == "gestor_area" and user.area_id == indicator.area_id:
        return
    raise AuthorizationError("Usuario sem permissao para acessar este indicador.")


def ensure_required_text(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError(f"Campo obrigatorio: {field_name}.")
    return cleaned


def calculate_monthly_value(
    values: Iterable[tuple[int, Decimal]],
    aggregation_type: AggregationType,
    year: int,
    month: int,
) -> Decimal | None:
    collected = list(values)
    if not collected:
        return None

    raw_values = [value for _, value in collected]
    total = sum(raw_values, start=Decimal("0"))
    if aggregation_type == "sum":
        return total

    weighted_total = Decimal("0")
    total_days = Decimal("0")
    for week_number, value in collected:
        days = Decimal(get_range_days_count(year=year, month=month, week_number=week_number))
        weighted_total += value * days
        total_days += days

    if total_days == Decimal("0"):
        return None
    return weighted_total / total_days
