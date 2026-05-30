from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import date
from decimal import Decimal
from typing import Any

from supabase import Client

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
from core.ports.repositories import (
    ActionPlanRepositoryPort,
    IndicatorRepositoryPort,
    SessionPort,
    UserRepositoryPort,
)


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _to_iso_date(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value[:10])


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


class SimpleTokenService(SessionPort):
    def __init__(self, secret_key: str, ttl_minutes: int = 720) -> None:
        self.secret_key = secret_key.encode("utf-8")
        self.ttl_seconds = ttl_minutes * 60

    def issue_token(self, user_id: str) -> str:
        payload = {
            "sub": user_id,
            "exp": int(time.time()) + self.ttl_seconds,
        }
        payload_raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        signature = hmac.new(self.secret_key, payload_raw, hashlib.sha256).digest()
        return f"{_b64encode(payload_raw)}.{_b64encode(signature)}"

    def read_user_id(self, token: str) -> str | None:
        try:
            payload_b64, signature_b64 = token.split(".", 1)
            payload_raw = _b64decode(payload_b64)
            signature_raw = _b64decode(signature_b64)
        except Exception:
            return None

        expected_signature = hmac.new(self.secret_key, payload_raw, hashlib.sha256).digest()
        if not hmac.compare_digest(signature_raw, expected_signature):
            return None

        try:
            payload = json.loads(payload_raw.decode("utf-8"))
        except Exception:
            return None

        expires_at = int(payload.get("exp", 0))
        if expires_at <= int(time.time()):
            return None

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject:
            return None
        return subject


class SupabaseUserRepository(UserRepositoryPort):
    def __init__(self, client: Client) -> None:
        self.client = client

    def get_by_email(self, email: str) -> User | None:
        response = self.client.table("users").select("*").eq("email", email).limit(1).execute()
        rows = response.data or []
        if not rows:
            return None
        return self._to_user(rows[0])

    def get_by_id(self, user_id: str) -> User | None:
        response = self.client.table("users").select("*").eq("id", user_id).limit(1).execute()
        rows = response.data or []
        if not rows:
            return None
        return self._to_user(rows[0])

    @staticmethod
    def _to_user(row: dict[str, Any]) -> User:
        return User(
            id=str(row["id"]),
            email=str(row["email"]),
            name=str(row.get("name") or ""),
            role=str(row["role"]),
            area_id=str(row["area_id"]) if row.get("area_id") else None,
            is_active=bool(row.get("is_active", True)),
            password_hash=str(row.get("password_hash") or ""),
        )


class SupabaseIndicatorRepository(IndicatorRepositoryPort):
    def __init__(self, client: Client) -> None:
        self.client = client

    def list_areas(self) -> list[Area]:
        response = (
            self.client.table("areas")
            .select("*")
            .eq("is_active", True)
            .order("name")
            .execute()
        )
        rows = response.data or []
        return [
            Area(
                id=str(row["id"]),
                name=str(row["name"]),
                is_active=bool(row.get("is_active", True)),
            )
            for row in rows
        ]

    def list_active(self, area_id: str | None = None) -> list[Indicator]:
        query = self.client.table("indicators").select("*").eq("is_active", True)
        if area_id:
            query = query.eq("area_id", area_id)
        response = query.order("name").execute()
        rows = response.data or []

        area_map = {area.id: area.name for area in self.list_areas()}
        return [
            self._to_indicator(row=row, area_name=area_map.get(str(row["area_id"])))
            for row in rows
        ]

    def get_by_id(self, indicator_id: str) -> Indicator | None:
        response = (
            self.client.table("indicators")
            .select("*")
            .eq("id", indicator_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None

        area_map = {area.id: area.name for area in self.list_areas()}
        row = rows[0]
        return self._to_indicator(row=row, area_name=area_map.get(str(row["area_id"])))

    def list_weekly_values(
        self,
        indicator_ids: list[str],
        year: int,
        month: int | None = None,
    ) -> list[IndicatorValue]:
        if not indicator_ids:
            return []

        query = (
            self.client.table("indicator_values")
            .select("*")
            .in_("indicator_id", indicator_ids)
            .eq("year", year)
        )
        if month is not None:
            query = query.eq("month", month)
        response = query.order("week_number").execute()
        rows = response.data or []

        return [
            IndicatorValue(
                indicator_id=str(row["indicator_id"]),
                year=int(row["year"]),
                month=int(row["month"]),
                week_number=int(row["week_number"]),
                value=Decimal(str(row["value"])),
                source_user_id=str(row["source_user_id"]),
            )
            for row in rows
        ]

    def upsert_weekly_value(self, value: IndicatorValue) -> None:
        existing_response = (
            self.client.table("indicator_values")
            .select("*")
            .eq("indicator_id", value.indicator_id)
            .eq("year", value.year)
            .eq("month", value.month)
            .eq("week_number", value.week_number)
            .limit(1)
            .execute()
        )
        existing_rows = existing_response.data or []
        existing_row = existing_rows[0] if existing_rows else None

        if existing_row is not None:
            previous_value = Decimal(str(existing_row["value"]))
            if previous_value != value.value:
                history_payload = {
                    "indicator_value_id": str(existing_row["id"]),
                    "indicator_id": value.indicator_id,
                    "year": value.year,
                    "month": value.month,
                    "week_number": value.week_number,
                    "previous_value": str(previous_value),
                    "new_value": str(value.value),
                    "changed_by": value.source_user_id,
                }
                self.client.table("indicator_value_history").insert(history_payload).execute()

        payload = {
            "indicator_id": value.indicator_id,
            "year": value.year,
            "month": value.month,
            "week_number": value.week_number,
            "value": str(value.value),
            "source_user_id": value.source_user_id,
        }
        self.client.table("indicator_values").upsert(
            payload,
            on_conflict="indicator_id,year,month,week_number",
        ).execute()

    def create_indicator(self, indicator: NewIndicator) -> Indicator:
        payload = {
            "area_id": indicator.area_id,
            "name": indicator.name,
            "description": indicator.description,
            "aggregation_type": indicator.aggregation_type,
            "unit": indicator.unit,
            "target_value": (
                str(indicator.target_value)
                if indicator.target_value is not None
                else None
            ),
            "created_by": indicator.created_by,
            "is_active": True,
        }
        response = self.client.table("indicators").insert(payload).execute()
        rows = response.data or []
        row = rows[0]
        area_map = {area.id: area.name for area in self.list_areas()}
        return self._to_indicator(row=row, area_name=area_map.get(str(row["area_id"])))

    @staticmethod
    def _to_indicator(row: dict[str, Any], area_name: str | None) -> Indicator:
        return Indicator(
            id=str(row["id"]),
            area_id=str(row["area_id"]),
            area_name=area_name,
            name=str(row["name"]),
            description=str(row["description"]) if row.get("description") else None,
            aggregation_type=str(row["aggregation_type"]),
            unit=str(row["unit"]) if row.get("unit") else None,
            target_value=_to_decimal(row.get("target_value")),
            is_active=bool(row.get("is_active", True)),
            created_by=str(row["created_by"]) if row.get("created_by") else None,
        )


class SupabaseActionPlanRepository(ActionPlanRepositoryPort):
    def __init__(self, client: Client) -> None:
        self.client = client

    def create_action_plan(self, plan: NewActionPlan) -> ActionPlan:
        payload = {
            "indicator_id": plan.indicator_id,
            "title": plan.title,
            "problem_description": plan.problem_description,
            "expected_action": plan.expected_action,
            "bitrix_responsible_id": plan.bitrix_responsible_id,
            "responsible_name": plan.responsible_name,
            "responsible_email": plan.responsible_email,
            "due_date": _to_iso_date(plan.due_date),
            "bitrix_task_id": plan.bitrix_task_id,
            "status": plan.status,
            "created_by": plan.created_by,
        }
        response = self.client.table("action_plans").insert(payload).execute()
        rows = response.data or []
        return self._to_action_plan(rows[0])

    def add_action_plan_history(self, event: ActionPlanHistoryEvent) -> None:
        payload = {
            "action_plan_id": event.action_plan_id,
            "event_type": event.event_type,
            "event_description": event.event_description,
            "created_by": event.created_by,
        }
        self.client.table("action_plan_history").insert(payload).execute()

    def list_action_plans(self, indicator_id: str) -> list[ActionPlan]:
        response = (
            self.client.table("action_plans")
            .select("*")
            .eq("indicator_id", indicator_id)
            .order("created_at", desc=True)
            .execute()
        )
        rows = response.data or []
        return [self._to_action_plan(row) for row in rows]

    @staticmethod
    def _to_action_plan(row: dict[str, Any]) -> ActionPlan:
        return ActionPlan(
            id=str(row["id"]),
            indicator_id=str(row["indicator_id"]),
            title=str(row["title"]),
            problem_description=str(row["problem_description"]),
            expected_action=str(row["expected_action"]),
            bitrix_responsible_id=(
                str(row["bitrix_responsible_id"])
                if row.get("bitrix_responsible_id")
                else None
            ),
            responsible_name=str(row["responsible_name"]),
            responsible_email=(
                str(row["responsible_email"])
                if row.get("responsible_email")
                else None
            ),
            due_date=_parse_date(row.get("due_date")),
            bitrix_task_id=str(row["bitrix_task_id"]) if row.get("bitrix_task_id") else None,
            status=str(row.get("status") or "created"),
            created_by=str(row["created_by"]),
        )
