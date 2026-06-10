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
    IndicatorMonthProjection,
    IndicatorMonthTarget,
    IndicatorUnit,
    IndicatorValue,
    NotFoundError,
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
            can_edit_projected_value=bool(row.get("can_edit_projected_value", False)),
        )


class SupabaseIndicatorRepository(IndicatorRepositoryPort):
    def __init__(self, client: Client) -> None:
        self.client = client

    def _list_area_map(self, only_active: bool) -> dict[str, Area]:
        query = self.client.table("areas").select("*")
        if only_active:
            query = query.eq("is_active", True)
        response = query.execute()
        rows = response.data or []
        return {
            str(row["id"]): Area(
                id=str(row["id"]),
                name=str(row["name"]),
                hex_color=str(row["hex_color"]) if row.get("hex_color") else None,
                is_active=bool(row.get("is_active", True)),
            )
            for row in rows
        }

    def list_areas(self) -> list[Area]:
        return sorted(self._list_area_map(only_active=True).values(), key=lambda area: area.name)

    def get_area_by_id(self, area_id: str) -> Area | None:
        response = (
            self.client.table("areas")
            .select("*")
            .eq("id", area_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None
        row = rows[0]
        return Area(
            id=str(row["id"]),
            name=str(row["name"]),
            hex_color=str(row["hex_color"]) if row.get("hex_color") else None,
            is_active=bool(row.get("is_active", True)),
        )

    def exists_active_area_name(self, name: str, exclude_area_id: str | None = None) -> bool:
        query = self.client.table("areas").select("id").eq("is_active", True).eq("name", name)
        if exclude_area_id:
            query = query.neq("id", exclude_area_id)
        response = query.limit(1).execute()
        rows = response.data or []
        return bool(rows)

    def create_area(self, name: str, hex_color: str | None) -> Area:
        payload = {
            "name": name,
            "hex_color": hex_color,
            "is_active": True,
        }
        response = self.client.table("areas").insert(payload).execute()
        row = (response.data or [])[0]
        return Area(
            id=str(row["id"]),
            name=str(row["name"]),
            hex_color=str(row["hex_color"]) if row.get("hex_color") else None,
            is_active=bool(row.get("is_active", True)),
        )

    def update_area(self, area_id: str, name: str, hex_color: str | None) -> Area:
        payload = {
            "name": name,
            "hex_color": hex_color,
        }
        response = self.client.table("areas").update(payload).eq("id", area_id).execute()
        rows = response.data or []
        if not rows:
            refreshed = self.get_area_by_id(area_id)
            if refreshed is None:
                raise NotFoundError("Area nao encontrada para atualizacao.")
            return refreshed

        row = rows[0]
        return Area(
            id=str(row["id"]),
            name=str(row["name"]),
            hex_color=str(row["hex_color"]) if row.get("hex_color") else None,
            is_active=bool(row.get("is_active", True)),
        )

    def deactivate_area(self, area_id: str) -> None:
        self.client.table("areas").update({"is_active": False}).eq("id", area_id).execute()

    def list_units(self) -> list[IndicatorUnit]:
        response = (
            self.client.table("indicator_units")
            .select("*")
            .eq("is_active", True)
            .order("label")
            .execute()
        )
        rows = response.data or []
        return [
            IndicatorUnit(
                id=str(row["id"]),
                code=str(row["code"]),
                label=str(row["label"]),
                is_active=bool(row.get("is_active", True)),
            )
            for row in rows
        ]

    def get_unit_by_id(self, unit_id: str) -> IndicatorUnit | None:
        response = (
            self.client.table("indicator_units")
            .select("*")
            .eq("id", unit_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None
        row = rows[0]
        return IndicatorUnit(
            id=str(row["id"]),
            code=str(row["code"]),
            label=str(row["label"]),
            is_active=bool(row.get("is_active", True)),
        )

    def list_active(self, area_id: str | None = None) -> list[Indicator]:
        query = self.client.table("indicators").select("*").eq("is_active", True)
        if area_id:
            query = query.eq("area_id", area_id)
        response = query.order("name").execute()
        rows = response.data or []

        area_map = self._list_area_map(only_active=False)
        unit_map = {unit.id: unit for unit in self.list_units()}
        return [
            self._to_indicator(
                row=row,
                area=area_map.get(str(row["area_id"])),
                unit=unit_map.get(str(row["unit_id"])) if row.get("unit_id") else None,
            )
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

        area_map = self._list_area_map(only_active=False)
        unit_map = {unit.id: unit for unit in self.list_units()}
        row = rows[0]
        return self._to_indicator(
            row=row,
            area=area_map.get(str(row["area_id"])),
            unit=unit_map.get(str(row["unit_id"])) if row.get("unit_id") else None,
        )

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
        unit = self.get_unit_by_id(indicator.unit_id)
        payload = {
            "area_id": indicator.area_id,
            "name": indicator.name,
            "description": indicator.description,
            "aggregation_type": indicator.aggregation_type,
            "unit_id": indicator.unit_id,
            "unit": unit.label if unit is not None else None,
            "created_by": indicator.created_by,
            "is_active": True,
        }
        response = self.client.table("indicators").insert(payload).execute()
        rows = response.data or []
        row = rows[0]
        area_map = {area.id: area for area in self.list_areas()}
        return self._to_indicator(
            row=row,
            area=area_map.get(str(row["area_id"])),
            unit=unit,
        )

    def update_indicator(self, indicator_id: str, indicator: NewIndicator) -> Indicator:
        unit = self.get_unit_by_id(indicator.unit_id)
        payload = {
            "area_id": indicator.area_id,
            "name": indicator.name,
            "description": indicator.description,
            "aggregation_type": indicator.aggregation_type,
            "unit_id": indicator.unit_id,
            "unit": unit.label if unit is not None else None,
        }
        response = self.client.table("indicators").update(payload).eq("id", indicator_id).execute()
        rows = response.data or []
        if not rows:
            refreshed = self.get_by_id(indicator_id)
            if refreshed is None:
                raise NotFoundError("Indicador nao encontrado para atualizacao.")
            return refreshed

        row = rows[0]
        area_map = {area.id: area for area in self.list_areas()}
        return self._to_indicator(
            row=row,
            area=area_map.get(str(row["area_id"])),
            unit=unit,
        )

    def exists_active_name(
        self,
        name: str,
        exclude_indicator_id: str | None = None,
    ) -> bool:
        query = self.client.table("indicators").select("id").eq("is_active", True).eq("name", name)
        if exclude_indicator_id:
            query = query.neq("id", exclude_indicator_id)
        response = query.limit(1).execute()
        rows = response.data or []
        return bool(rows)

    def delete_indicator_with_history(self, indicator_id: str) -> None:
        action_plans_response = (
            self.client.table("action_plans")
            .select("id")
            .eq("indicator_id", indicator_id)
            .execute()
        )
        action_plan_rows = action_plans_response.data or []
        action_plan_ids = [str(row["id"]) for row in action_plan_rows if row.get("id")]

        if action_plan_ids:
            self.client.table("action_plan_history").delete().in_("action_plan_id", action_plan_ids).execute()

        self.client.table("action_plans").delete().eq("indicator_id", indicator_id).execute()
        self.client.table("indicator_month_projections").delete().eq("indicator_id", indicator_id).execute()
        self.client.table("indicator_month_targets").delete().eq("indicator_id", indicator_id).execute()
        self.client.table("indicator_value_history").delete().eq("indicator_id", indicator_id).execute()
        self.client.table("indicator_values").delete().eq("indicator_id", indicator_id).execute()
        self.client.table("indicators").delete().eq("id", indicator_id).execute()

    def list_month_targets(self, indicator_ids: list[str], year: int) -> list[IndicatorMonthTarget]:
        if not indicator_ids:
            return []
        response = (
            self.client.table("indicator_month_targets")
            .select("*")
            .in_("indicator_id", indicator_ids)
            .eq("year", year)
            .execute()
        )
        rows = response.data or []
        return [
            IndicatorMonthTarget(
                indicator_id=str(row["indicator_id"]),
                year=int(row["year"]),
                month=int(row["month"]),
                target_value=Decimal(str(row["target_value"])),
                created_by=str(row["created_by"]) if row.get("created_by") else None,
                updated_by=str(row["updated_by"]) if row.get("updated_by") else None,
            )
            for row in rows
        ]

    def list_month_projections(
        self,
        indicator_ids: list[str],
        year: int,
    ) -> list[IndicatorMonthProjection]:
        if not indicator_ids:
            return []
        response = (
            self.client.table("indicator_month_projections")
            .select("*")
            .in_("indicator_id", indicator_ids)
            .eq("year", year)
            .execute()
        )
        rows = response.data or []
        return [
            IndicatorMonthProjection(
                indicator_id=str(row["indicator_id"]),
                year=int(row["year"]),
                month=int(row["month"]),
                projected_value=Decimal(str(row["projected_value"])),
                created_by=str(row["created_by"]) if row.get("created_by") else None,
                updated_by=str(row["updated_by"]) if row.get("updated_by") else None,
            )
            for row in rows
        ]

    def upsert_month_target(
        self,
        indicator_id: str,
        year: int,
        month: int,
        target_value: Decimal,
        user_id: str,
    ) -> IndicatorMonthTarget:
        existing_response = (
            self.client.table("indicator_month_targets")
            .select("*")
            .eq("indicator_id", indicator_id)
            .eq("year", year)
            .eq("month", month)
            .limit(1)
            .execute()
        )
        existing_rows = existing_response.data or []

        if existing_rows:
            payload = {
                "target_value": str(target_value),
                "updated_by": user_id,
            }
            response = (
                self.client.table("indicator_month_targets")
                .update(payload)
                .eq("indicator_id", indicator_id)
                .eq("year", year)
                .eq("month", month)
                .execute()
            )
        else:
            payload = {
                "indicator_id": indicator_id,
                "year": year,
                "month": month,
                "target_value": str(target_value),
                "created_by": user_id,
                "updated_by": user_id,
            }
            response = self.client.table("indicator_month_targets").insert(payload).execute()

        row = (response.data or [])[0]
        return IndicatorMonthTarget(
            indicator_id=str(row["indicator_id"]),
            year=int(row["year"]),
            month=int(row["month"]),
            target_value=Decimal(str(row["target_value"])),
            created_by=str(row["created_by"]) if row.get("created_by") else None,
            updated_by=str(row["updated_by"]) if row.get("updated_by") else None,
        )

    def upsert_month_projection(
        self,
        indicator_id: str,
        year: int,
        month: int,
        projected_value: Decimal,
        user_id: str,
    ) -> IndicatorMonthProjection:
        existing_response = (
            self.client.table("indicator_month_projections")
            .select("*")
            .eq("indicator_id", indicator_id)
            .eq("year", year)
            .eq("month", month)
            .limit(1)
            .execute()
        )
        existing_rows = existing_response.data or []

        if existing_rows:
            payload = {
                "projected_value": str(projected_value),
                "updated_by": user_id,
            }
            response = (
                self.client.table("indicator_month_projections")
                .update(payload)
                .eq("indicator_id", indicator_id)
                .eq("year", year)
                .eq("month", month)
                .execute()
            )
        else:
            payload = {
                "indicator_id": indicator_id,
                "year": year,
                "month": month,
                "projected_value": str(projected_value),
                "created_by": user_id,
                "updated_by": user_id,
            }
            response = self.client.table("indicator_month_projections").insert(payload).execute()

        row = (response.data or [])[0]
        return IndicatorMonthProjection(
            indicator_id=str(row["indicator_id"]),
            year=int(row["year"]),
            month=int(row["month"]),
            projected_value=Decimal(str(row["projected_value"])),
            created_by=str(row["created_by"]) if row.get("created_by") else None,
            updated_by=str(row["updated_by"]) if row.get("updated_by") else None,
        )

    @staticmethod
    def _to_indicator(
        row: dict[str, Any],
        area: Area | None,
        unit: IndicatorUnit | None,
    ) -> Indicator:
        return Indicator(
            id=str(row["id"]),
            area_id=str(row["area_id"]),
            area_name=area.name if area else None,
            area_hex_color=area.hex_color if area else None,
            name=str(row["name"]),
            description=str(row["description"]) if row.get("description") else None,
            aggregation_type=str(row["aggregation_type"]),
            unit_id=str(row["unit_id"]) if row.get("unit_id") else None,
            unit=(unit.label if unit else (str(row["unit"]) if row.get("unit") else None)),
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
            "ocorrencia": plan.ocorrencia,
            "identificacao_causa": plan.identificacao_causa,
            "proposta_solucao": plan.proposta_solucao,
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
            ocorrencia=str(row.get("ocorrencia") or ""),
            identificacao_causa=str(row.get("identificacao_causa") or ""),
            proposta_solucao=str(row.get("proposta_solucao") or ""),
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
