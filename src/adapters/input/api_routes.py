from __future__ import annotations

import os
import subprocess
import sys
import time
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.wiring import Container
from core.domain.models import (
    ActionPlan,
    AuthenticationError,
    AuthorizationError,
    DomainError,
    NotFoundError,
    User,
    ValidationError,
)
from core.domain.rules import ensure_can_view_indicator, ensure_user_active


class LoginRequest(BaseModel):
    email: str
    password: str


class WeeklyValuePayload(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    week_number: int = Field(ge=1, le=6)
    value: str


class ActionPlanPayload(BaseModel):
    indicator_id: str
    title: str
    problem_description: str
    expected_action: str
    bitrix_responsible_id: str
    responsible_name: str
    responsible_email: str | None = None
    due_date: date | None = None


class CreateIndicatorPayload(BaseModel):
    area_id: str
    name: str
    description: str | None = None
    aggregation_type: str
    unit: str | None = None
    target_value: str | None = None


def _to_http_error(error: DomainError) -> HTTPException:
    if isinstance(error, AuthenticationError):
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error))
    if isinstance(error, AuthorizationError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, ValidationError):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


def _decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _parse_decimal(value: str, field_name: str) -> Decimal:
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Campo {field_name} deve ser numerico.",
        ) from exc


def _serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "area_id": user.area_id,
        "is_active": user.is_active,
    }


def _serialize_action_plan(plan: ActionPlan) -> dict[str, Any]:
    return {
        "id": plan.id,
        "indicator_id": plan.indicator_id,
        "title": plan.title,
        "problem_description": plan.problem_description,
        "expected_action": plan.expected_action,
        "bitrix_responsible_id": plan.bitrix_responsible_id,
        "responsible_name": plan.responsible_name,
        "responsible_email": plan.responsible_email,
        "due_date": plan.due_date.isoformat() if plan.due_date else None,
        "bitrix_task_id": plan.bitrix_task_id,
        "status": plan.status,
        "created_by": plan.created_by,
    }


def _find_listening_pids_windows(port: int) -> set[int]:
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"],
        capture_output=True,
        text=True,
        check=False,
    )

    pids: set[int] = set()
    suffix = f":{port}"
    for raw_line in result.stdout.splitlines():
        parts = [item for item in raw_line.strip().split() if item]
        if len(parts) < 5:
            continue

        local_address = parts[1]
        state = parts[3].upper()
        pid_raw = parts[4]
        if state not in {"LISTENING", "ESCUTANDO"}:
            continue
        if not local_address.endswith(suffix):
            continue

        try:
            pid = int(pid_raw)
        except ValueError:
            continue
        if pid > 0:
            pids.add(pid)

    return pids


def _shutdown_server_processes(port: int) -> None:
    # Small delay to allow the HTTP response to be returned before shutdown.
    time.sleep(0.4)

    starter_pid_raw = os.getenv("PSC_STARTER_PID", "").strip()
    starter_pid = int(starter_pid_raw) if starter_pid_raw.isdigit() else 0

    candidate_pids: set[int] = {os.getpid(), os.getppid()}
    if starter_pid > 0:
        candidate_pids.add(starter_pid)

    if sys.platform.startswith("win"):
        candidate_pids.update(_find_listening_pids_windows(port))
        for pid in sorted(candidate_pids, reverse=True):
            if pid <= 0:
                continue
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F", "/T"],
                capture_output=True,
                text=True,
                check=False,
            )
        os._exit(0)

    for pid in sorted(candidate_pids, reverse=True):
        if pid <= 0:
            continue
        subprocess.run(
            ["kill", "-TERM", str(pid)],
            capture_output=True,
            text=True,
            check=False,
        )
    os._exit(0)


def create_api_router(container: Container) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["api"])
    bearer = HTTPBearer(auto_error=False)

    def get_current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> User:
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token ausente.",
            )

        user_id = container.session_port.read_user_id(credentials.credentials)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalido.",
            )

        user = container.user_repository.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario nao encontrado.",
            )

        try:
            ensure_user_active(user)
        except DomainError as error:
            raise _to_http_error(error) from error
        return user

    @router.post("/login")
    def login(payload: LoginRequest) -> dict[str, Any]:
        try:
            session = container.authenticate_user.execute(
                email=payload.email,
                password=payload.password,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "access_token": session.token,
            "token_type": "bearer",
            "user": _serialize_user(session.user),
        }

    @router.get("/me")
    def me(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
        return _serialize_user(current_user)

    @router.get("/areas")
    def list_areas(current_user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
        try:
            if current_user.role != "executivo":
                raise AuthorizationError("Somente executivo pode listar areas para cadastro.")
            areas = container.indicator_repository.list_areas()
            return [
                {
                    "id": area.id,
                    "name": area.name,
                    "is_active": area.is_active,
                }
                for area in areas
            ]
        except DomainError as error:
            raise _to_http_error(error) from error

    @router.get("/bitrix-users")
    def search_bitrix_users(
        query: str = Query(..., min_length=2, max_length=120),
        limit: int = Query(10, ge=1, le=20),
        current_user: User = Depends(get_current_user),
    ) -> list[dict[str, Any]]:
        try:
            users = container.search_bitrix_users.execute(
                user=current_user,
                query=query,
                limit=limit,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return [
            {
                "id": bitrix_user.id,
                "name": bitrix_user.name,
                "email": bitrix_user.email,
            }
            for bitrix_user in users
        ]

    @router.get("/indicators")
    def list_indicators(
        year: int = Query(..., ge=2000, le=2100),
        current_user: User = Depends(get_current_user),
    ) -> list[dict[str, Any]]:
        try:
            rows = container.list_indicators.execute(user=current_user, year=year)
        except DomainError as error:
            raise _to_http_error(error) from error

        payload: list[dict[str, Any]] = []
        for row in rows:
            months = [
                {
                    "month": month,
                    "value": _decimal_to_float(row.monthly_values.get(month)),
                }
                for month in range(1, 13)
            ]
            payload.append(
                {
                    "indicator_id": row.indicator_id,
                    "indicator_name": row.indicator_name,
                    "area_id": row.area_id,
                    "area_name": row.area_name,
                    "aggregation_type": row.aggregation_type,
                    "unit": row.unit,
                    "target_value": _decimal_to_float(row.target_value),
                    "months": months,
                }
            )
        return payload

    @router.get("/indicators/{indicator_id}/weekly-values")
    def list_weekly_values(
        indicator_id: str,
        year: int = Query(..., ge=2000, le=2100),
        month: int = Query(..., ge=1, le=12),
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        indicator = container.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Indicador nao encontrado.",
            )

        try:
            ensure_can_view_indicator(user=current_user, indicator=indicator)
        except DomainError as error:
            raise _to_http_error(error) from error

        values = container.indicator_repository.list_weekly_values(
            indicator_ids=[indicator_id],
            year=year,
            month=month,
        )
        by_week: dict[int, Decimal] = {item.week_number: item.value for item in values}
        weeks = [
            {
                "week_number": week_number,
                "value": _decimal_to_float(by_week.get(week_number)),
            }
            for week_number in range(1, 7)
        ]
        return {
            "indicator_id": indicator_id,
            "year": year,
            "month": month,
            "weeks": weeks,
        }

    @router.post("/indicators/{indicator_id}/weekly-values")
    def save_weekly_value(
        indicator_id: str,
        payload: WeeklyValuePayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        numeric_value = _parse_decimal(payload.value, "value")
        try:
            saved = container.register_indicator_value.execute(
                user=current_user,
                indicator_id=indicator_id,
                year=payload.year,
                month=payload.month,
                week_number=payload.week_number,
                value=numeric_value,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "indicator_id": saved.indicator_id,
            "year": saved.year,
            "month": saved.month,
            "week_number": saved.week_number,
            "value": _decimal_to_float(saved.value),
        }

    @router.post("/action-plans")
    def create_action_plan(
        payload: ActionPlanPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            created = container.create_action_plan.execute(
                user=current_user,
                indicator_id=payload.indicator_id,
                title=payload.title,
                problem_description=payload.problem_description,
                expected_action=payload.expected_action,
                bitrix_responsible_id=payload.bitrix_responsible_id,
                responsible_name=payload.responsible_name,
                responsible_email=payload.responsible_email,
                due_date=payload.due_date,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return _serialize_action_plan(created)

    @router.get("/action-plans")
    def list_action_plans(
        indicator_id: str,
        current_user: User = Depends(get_current_user),
    ) -> list[dict[str, Any]]:
        indicator = container.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Indicador nao encontrado.",
            )

        try:
            ensure_can_view_indicator(user=current_user, indicator=indicator)
        except DomainError as error:
            raise _to_http_error(error) from error

        plans = container.action_plan_repository.list_action_plans(indicator_id=indicator_id)
        return [_serialize_action_plan(plan) for plan in plans]

    @router.post("/indicators")
    def create_indicator(
        payload: CreateIndicatorPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        target_value = (
            _parse_decimal(payload.target_value, "target_value")
            if payload.target_value
            else None
        )
        try:
            created = container.create_indicator.execute(
                user=current_user,
                area_id=payload.area_id,
                name=payload.name,
                description=payload.description,
                aggregation_type=payload.aggregation_type,
                unit=payload.unit,
                target_value=target_value,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "id": created.id,
            "area_id": created.area_id,
            "area_name": created.area_name,
            "name": created.name,
            "description": created.description,
            "aggregation_type": created.aggregation_type,
            "unit": created.unit,
            "target_value": _decimal_to_float(created.target_value),
        }

    @router.post("/system/shutdown")
    def shutdown_app(
        background_tasks: BackgroundTasks,
        request: Request,
        _current_user: User = Depends(get_current_user),
    ) -> dict[str, str]:
        shutdown_port = request.url.port
        if shutdown_port is None:
            env_port = os.getenv("PSC_SERVER_PORT", "8010")
            shutdown_port = int(env_port) if env_port.isdigit() else 8010

        background_tasks.add_task(_shutdown_server_processes, shutdown_port)
        return {"status": "shutting_down", "message": "Aplicacao em encerramento."}

    return router
