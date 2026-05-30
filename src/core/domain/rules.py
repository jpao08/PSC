from __future__ import annotations

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
    if week_number < 1 or week_number > 6:
        raise ValidationError("Semana deve estar entre 1 e 6.")


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
    values: Iterable[Decimal],
    aggregation_type: AggregationType,
) -> Decimal | None:
    collected = list(values)
    if not collected:
        return None
    total = sum(collected, start=Decimal("0"))
    if aggregation_type == "sum":
        return total
    return total / Decimal(len(collected))
