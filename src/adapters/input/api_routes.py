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
    CommercialDrilldownDashboard,
    CommercialDrilldownItemsPage,
    CommercialSyncJob,
    CommercialSyncStartResult,
    DomainError,
    NotFoundError,
    IssueReport,
    IssueTag,
    User,
    ValidationError,
    WinReport,
)
from core.domain.rules import (
    ensure_can_use_issue_reports,
    ensure_can_start_commercial_sync,
    ensure_can_use_commercial_drilldown,
    ensure_can_view_indicator,
    ensure_confidence_level,
    ensure_hex_color_or_none,
    ensure_issue_status,
    ensure_required_text,
    ensure_role,
    ensure_user_active,
    get_month_ranges,
)


class LoginRequest(BaseModel):
    email: str
    password: str


class WeeklyValuePayload(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    week_number: int = Field(ge=1, le=4)
    value: str


class ActionPlanPayload(BaseModel):
    indicator_id: str
    title: str
    ocorrencia: str
    identificacao_causa: str
    proposta_solucao: str
    bitrix_responsible_id: str
    responsible_name: str
    responsible_email: str | None = None
    due_date: date | None = None


class CreateIndicatorPayload(BaseModel):
    area_id: str
    name: str
    description: str | None = None
    aggregation_type: str
    unit_id: str
    maturity_level: str | None = None


class UpdateIndicatorPayload(BaseModel):
    area_id: str
    name: str
    description: str | None = None
    aggregation_type: str
    unit_id: str
    maturity_level: str | None = None


class AreaPayload(BaseModel):
    name: str
    hex_color: str | None = None


class MonthlyTargetPayload(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    target_value: str | None = None


class MonthlyProjectionPayload(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    projected_value: str | None = None


class MonthlyNotApplicablePayload(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    is_not_applicable: bool


class AnnualPlanningPayload(BaseModel):
    year: int
    annual_target: str | None = None
    confidence_level: str | None = None


class CreateIssueReportPayload(BaseModel):
    title: str
    area_id: str | None = None
    is_other_area: bool = False
    requester_gravity: int = Field(ge=1, le=5)
    requester_urgency: int = Field(ge=1, le=5)
    requester_tendency: int = Field(ge=1, le=5)
    ocorrencia: str
    identificacao_causa: str
    proposta_solucao: str


class CreateWinReportPayload(BaseModel):
    title: str
    area_id: str | None = None
    is_other_area: bool = False
    description: str


class IssueExecutiveReviewPayload(BaseModel):
    executive_gravity: int | None = Field(default=None, ge=1, le=5)
    executive_urgency: int | None = Field(default=None, ge=1, le=5)
    executive_tendency: int | None = Field(default=None, ge=1, le=5)
    status: str | None = None


class IssueTagPayload(BaseModel):
    name: str
    color: str | None = None


class IssueTagsPayload(BaseModel):
    tag_ids: list[str] = Field(default_factory=list)


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


def _parse_optional_decimal(value: str | None, field_name: str) -> Decimal | None:
    if value is None or not value.strip():
        return None
    return _parse_decimal(value, field_name)


def _serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "area_id": user.area_id,
        "area_ids": user.area_ids or ([user.area_id] if user.area_id else []),
        "is_active": user.is_active,
        "can_edit_projected_value": user.can_edit_projected_value,
        "can_edit_indicator_maturity": user.can_edit_indicator_maturity,
        "can_use_issue_reports": user.can_use_issue_reports,
        "can_admin_users": user.can_admin_users,
        "can_view_commercial_drilldown": user.can_view_commercial_drilldown,
        "can_view_marketing_drilldown": user.can_view_marketing_drilldown,
        "can_view_financial_drilldown": user.can_view_financial_drilldown,
        "can_edit_financial_drilldown": user.can_edit_financial_drilldown,
        "bitrix_user_id": user.bitrix_user_id,
        "bitrix_portal_domain": user.bitrix_portal_domain,
    }


def _serialize_action_plan(plan: ActionPlan) -> dict[str, Any]:
    return {
        "id": plan.id,
        "indicator_id": plan.indicator_id,
        "title": plan.title,
        "ocorrencia": plan.ocorrencia,
        "identificacao_causa": plan.identificacao_causa,
        "proposta_solucao": plan.proposta_solucao,
        "bitrix_responsible_id": plan.bitrix_responsible_id,
        "responsible_name": plan.responsible_name,
        "responsible_email": plan.responsible_email,
        "due_date": plan.due_date.isoformat() if plan.due_date else None,
        "bitrix_task_id": plan.bitrix_task_id,
        "status": plan.status,
        "created_by": plan.created_by,
    }


def _serialize_issue_report(issue: IssueReport) -> dict[str, Any]:
    return {
        "id": issue.id,
        "title": issue.title,
        "requester_id": issue.requester_id,
        "requester_name": issue.requester_name,
        "area_id": issue.area_id,
        "area_name": "Outras" if issue.is_other_area else issue.area_name,
        "is_other_area": issue.is_other_area,
        "requester_gravity": issue.requester_gravity,
        "requester_urgency": issue.requester_urgency,
        "requester_tendency": issue.requester_tendency,
        "requester_priority_score": issue.requester_priority_score,
        "executive_gravity": issue.executive_gravity,
        "executive_urgency": issue.executive_urgency,
        "executive_tendency": issue.executive_tendency,
        "executive_priority_score": issue.executive_priority_score,
        "ocorrencia": issue.ocorrencia,
        "identificacao_causa": issue.identificacao_causa,
        "proposta_solucao": issue.proposta_solucao,
        "status": issue.status,
        "created_at": issue.created_at.isoformat(),
        "reviewed_by": issue.reviewed_by,
        "reviewed_at": issue.reviewed_at.isoformat() if issue.reviewed_at else None,
        "tags": [_serialize_issue_tag(tag) for tag in issue.tags or []],
    }


def _serialize_issue_tag(tag: IssueTag) -> dict[str, Any]:
    return {
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
        "is_active": tag.is_active,
    }


def _serialize_win_report(win: WinReport) -> dict[str, Any]:
    return {
        "id": win.id,
        "title": win.title,
        "requester_id": win.requester_id,
        "requester_name": win.requester_name,
        "area_id": win.area_id,
        "area_name": "Outras" if win.is_other_area else win.area_name,
        "is_other_area": win.is_other_area,
        "description": win.description,
        "status": win.status,
        "created_at": win.created_at.isoformat(),
        "reviewed_by": win.reviewed_by,
        "reviewed_at": win.reviewed_at.isoformat() if win.reviewed_at else None,
    }


def _serialize_commercial_job(job: CommercialSyncJob | None) -> dict[str, Any] | None:
    if job is None:
        return None
    return {
        "jobId": job.job_id,
        "jobType": job.job_type,
        "status": job.status,
        "startedAt": job.started_at.isoformat() if job.started_at else None,
        "currentStep": job.current_step,
        "processedRecords": job.processed_records,
        "totalRecords": job.total_records,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "updatedAt": job.updated_at.isoformat() if job.updated_at else None,
    }


def _serialize_commercial_dashboard(
    dashboard: CommercialDrilldownDashboard,
) -> dict[str, Any]:
    return {
        "year": dashboard.year,
        "months": dashboard.months,
        "responsibles": dashboard.responsibles,
        "metrics": [
            {
                "metricKey": metric.metric_key,
                "label": metric.label,
                "kind": metric.kind,
                "unit": metric.unit,
                "summaryLabel": metric.summary_label,
                "rows": [
                    {
                        "responsibleId": row.responsible_id,
                        "responsibleName": row.responsible_name,
                        "responsibleActive": row.responsible_active,
                        "isTotal": row.is_total,
                        "months": {
                            month: _decimal_to_float(value)
                            for month, value in row.months.items()
                        },
                        "annualSummary": _decimal_to_float(row.annual_summary),
                    }
                    for row in metric.rows
                ],
            }
            for metric in dashboard.metrics
        ],
        "lastSuccessfulSyncAt": (
            dashboard.last_successful_sync_at.isoformat()
            if dashboard.last_successful_sync_at
            else None
        ),
        "activeJob": _serialize_commercial_job(dashboard.active_job),
    }


def _serialize_commercial_items(page: CommercialDrilldownItemsPage) -> dict[str, Any]:
    return {
        "year": page.year,
        "month": page.month,
        "metricKey": page.metric_key,
        "responsibleId": page.responsible_id,
        "page": page.page,
        "pageSize": page.page_size,
        "totalItems": page.total_items,
        "items": [
            {
                "dealId": item.deal_id,
                "title": item.title,
                "responsibleId": item.responsible_id,
                "responsibleName": item.responsible_name,
                "responsibleStatus": item.responsible_status,
                "stageId": item.stage_id,
                "stageName": item.stage_name,
                "eventDate": item.event_date.isoformat() if item.event_date else None,
                "referenceDate": item.reference_date.isoformat() if item.reference_date else None,
                "quantityContribution": _decimal_to_float(item.quantity_contribution),
                "monetaryContribution": _decimal_to_float(item.monetary_contribution),
                "opportunity": _decimal_to_float(item.opportunity),
                "currencyId": item.currency_id,
                "bitrixUrl": item.bitrix_url,
            }
            for item in page.items
        ],
    }


def _serialize_commercial_sync_start(
    result: CommercialSyncStartResult,
) -> dict[str, Any]:
    return {
        "jobId": result.job_id,
        "status": result.status,
        "created": result.created,
        "message": result.message,
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

    @router.get("/commercial-drilldown")
    def commercial_drilldown_dashboard(
        year: int = Query(default=date.today().year),
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_can_use_commercial_drilldown(current_user)
            return _serialize_commercial_dashboard(
                container.commercial_drilldown_repository.get_dashboard(year)
            )
        except DomainError as error:
            raise _to_http_error(error) from error

    @router.get("/commercial-drilldown/items")
    def commercial_drilldown_items(
        year: int,
        month: int = Query(ge=1, le=12),
        metric_key: str = Query(min_length=1),
        responsible_id: str | None = None,
        q: str | None = None,
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        sort: str = "date_desc",
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_can_use_commercial_drilldown(current_user)
            return _serialize_commercial_items(
                container.commercial_drilldown_repository.get_items(
                    year=year,
                    month=month,
                    metric_key=metric_key,
                    responsible_id=responsible_id,
                    query=q,
                    page=page,
                    page_size=page_size,
                    sort=sort,
                )
            )
        except DomainError as error:
            raise _to_http_error(error) from error

    @router.get("/commercial-drilldown/sync-status")
    def commercial_drilldown_sync_status(
        current_user: User = Depends(get_current_user),
    ) -> dict[str, object]:
        try:
            ensure_can_use_commercial_drilldown(current_user)
            return container.commercial_drilldown_repository.get_sync_status()
        except DomainError as error:
            raise _to_http_error(error) from error

    @router.post("/commercial-drilldown/sync")
    def start_commercial_drilldown_sync(
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_can_start_commercial_sync(current_user)
            return _serialize_commercial_sync_start(
                container.commercial_drilldown_repository.start_sync(current_user.id)
            )
        except DomainError as error:
            raise _to_http_error(error) from error

    @router.get("/areas")
    def list_areas(current_user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
        try:
            if (
                current_user.role not in {"executivo", "executivo_visualizacao"}
                and not current_user.can_use_issue_reports
            ):
                raise AuthorizationError("Somente executivo pode listar areas para cadastro.")
            areas = container.indicator_repository.list_areas()
            return [
                {
                    "id": area.id,
                    "name": area.name,
                    "hex_color": area.hex_color,
                    "is_active": area.is_active,
                }
                for area in areas
            ]
        except DomainError as error:
            raise _to_http_error(error) from error

    @router.post("/areas")
    def create_area(
        payload: AreaPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            created = container.create_area.execute(
                user=current_user,
                name=payload.name,
                hex_color=payload.hex_color,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "id": created.id,
            "name": created.name,
            "hex_color": created.hex_color,
            "is_active": created.is_active,
        }

    @router.put("/areas/{area_id}")
    def update_area(
        area_id: str,
        payload: AreaPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            updated = container.update_area.execute(
                user=current_user,
                area_id=area_id,
                name=payload.name,
                hex_color=payload.hex_color,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "id": updated.id,
            "name": updated.name,
            "hex_color": updated.hex_color,
            "is_active": updated.is_active,
        }

    @router.delete("/areas/{area_id}")
    def delete_area(
        area_id: str,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, str]:
        try:
            container.delete_area.execute(user=current_user, area_id=area_id)
        except DomainError as error:
            raise _to_http_error(error) from error
        return {"status": "deleted"}

    @router.get("/indicator-units")
    def list_indicator_units(current_user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
        try:
            if current_user.role != "executivo":
                raise AuthorizationError("Somente executivo pode listar unidades para cadastro.")
            units = container.indicator_repository.list_units()
        except DomainError as error:
            raise _to_http_error(error) from error

        return [
            {
                "id": unit.id,
                "code": unit.code,
                "label": unit.label,
            }
            for unit in units
        ]

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
                    "projected_value": _decimal_to_float(row.monthly_projections.get(month)),
                    "monthly_target": _decimal_to_float(row.monthly_targets.get(month)),
                    "not_applicable": bool(row.not_applicable.get(month, False)),
                    "below_target": bool(row.below_target.get(month, False)),
                }
                for month in range(1, 13)
            ]
            payload.append(
                {
                    "indicator_id": row.indicator_id,
                    "indicator_name": row.indicator_name,
                    "area_id": row.area_id,
                    "area_name": row.area_name,
                    "area_hex_color": row.area_hex_color,
                    "description": row.description,
                    "aggregation_type": row.aggregation_type,
                    "unit_id": row.unit_id,
                    "unit": row.unit,
                    "maturity_level": _decimal_to_float(row.maturity_level),
                    "annual_target": _decimal_to_float(row.annual_target),
                    "annual_projected": _decimal_to_float(row.annual_projected),
                    "annual_real": _decimal_to_float(row.annual_real),
                    "confidence_level": _decimal_to_float(row.confidence_level),
                    "projected_achievement_percent": _decimal_to_float(
                        row.projected_achievement_percent
                    ),
                    "maturity_classification": row.maturity_classification,
                    "confidence_classification": row.confidence_classification,
                    "projected_achievement_classification": (
                        row.projected_achievement_classification
                    ),
                    "months": months,
                }
            )
        return payload

    @router.get("/issue-reports")
    def list_issue_reports(
        current_user: User = Depends(get_current_user),
    ) -> list[dict[str, Any]]:
        try:
            issues = container.list_issue_reports.execute(user=current_user)
        except DomainError as error:
            raise _to_http_error(error) from error
        return [_serialize_issue_report(issue) for issue in issues]

    @router.get("/wins")
    def list_wins(
        current_user: User = Depends(get_current_user),
    ) -> list[dict[str, Any]]:
        try:
            wins = container.list_win_reports.execute(user=current_user)
        except DomainError as error:
            raise _to_http_error(error) from error
        return [_serialize_win_report(win) for win in wins]

    @router.post("/wins")
    def create_win(
        payload: CreateWinReportPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            win = container.create_win_report.execute(
                user=current_user,
                title=payload.title,
                area_id=payload.area_id,
                is_other_area=payload.is_other_area,
                description=payload.description,
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_win_report(win)

    @router.patch("/wins/{win_id}/status")
    def update_win_status(
        win_id: str,
        payload: IssueExecutiveReviewPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_user_active(current_user)
            ensure_role(current_user, "executivo")
            status_value = ensure_issue_status(payload.status) if payload.status is not None else None
            win = container.win_report_repository.update_win_status(
                win_id=win_id,
                status=status_value,
                reviewed_by=current_user.id,
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_win_report(win)

    @router.delete("/wins/{win_id}")
    def delete_win(
        win_id: str,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, str]:
        try:
            container.delete_win_report.execute(user=current_user, win_id=win_id)
        except DomainError as error:
            raise _to_http_error(error) from error
        return {"status": "deleted"}

    @router.get("/issue-tags")
    def list_issue_tags(
        current_user: User = Depends(get_current_user),
    ) -> list[dict[str, Any]]:
        try:
            ensure_user_active(current_user)
            ensure_can_use_issue_reports(current_user)
            tags = container.issue_report_repository.list_issue_tags()
        except DomainError as error:
            raise _to_http_error(error) from error
        return [_serialize_issue_tag(tag) for tag in tags]

    @router.post("/issue-tags")
    def create_issue_tag(
        payload: IssueTagPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_user_active(current_user)
            ensure_role(current_user, "executivo")
            tag = container.issue_report_repository.create_issue_tag(
                name=ensure_required_text(payload.name, "nome da tag"),
                color=ensure_hex_color_or_none(payload.color, "cor da tag"),
                created_by=current_user.id,
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_issue_tag(tag)

    @router.put("/issue-tags/{tag_id}")
    def update_issue_tag(
        tag_id: str,
        payload: IssueTagPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_user_active(current_user)
            ensure_role(current_user, "executivo")
            tag = container.issue_report_repository.update_issue_tag(
                tag_id=tag_id,
                name=ensure_required_text(payload.name, "nome da tag"),
                color=ensure_hex_color_or_none(payload.color, "cor da tag"),
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_issue_tag(tag)

    @router.delete("/issue-tags/{tag_id}")
    def delete_issue_tag(
        tag_id: str,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, str]:
        try:
            ensure_user_active(current_user)
            ensure_role(current_user, "executivo")
            container.issue_report_repository.deactivate_issue_tag(tag_id)
        except DomainError as error:
            raise _to_http_error(error) from error
        return {"status": "deleted"}

    @router.post("/issue-reports")
    def create_issue_report(
        payload: CreateIssueReportPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            issue = container.create_issue_report.execute(
                user=current_user,
                title=payload.title,
                area_id=payload.area_id,
                is_other_area=payload.is_other_area,
                requester_gravity=payload.requester_gravity,
                requester_urgency=payload.requester_urgency,
                requester_tendency=payload.requester_tendency,
                ocorrencia=payload.ocorrencia,
                identificacao_causa=payload.identificacao_causa,
                proposta_solucao=payload.proposta_solucao,
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_issue_report(issue)

    @router.patch("/issue-reports/{issue_id}/executive-review")
    def update_issue_report_executive_review(
        issue_id: str,
        payload: IssueExecutiveReviewPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            issue = container.update_issue_report_executive_review.execute(
                user=current_user,
                issue_id=issue_id,
                executive_gravity=payload.executive_gravity,
                executive_urgency=payload.executive_urgency,
                executive_tendency=payload.executive_tendency,
                status=payload.status,
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_issue_report(issue)

    @router.patch("/issue-reports/{issue_id}/tags")
    def update_issue_report_tags(
        issue_id: str,
        payload: IssueTagsPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            ensure_user_active(current_user)
            ensure_role(current_user, "executivo")
            unique_tag_ids = list(dict.fromkeys(tag_id for tag_id in payload.tag_ids if tag_id))
            issue = container.issue_report_repository.replace_issue_tags(
                issue_id=issue_id,
                tag_ids=unique_tag_ids,
                updated_by=current_user.id,
            )
        except DomainError as error:
            raise _to_http_error(error) from error
        return _serialize_issue_report(issue)

    @router.delete("/issue-reports/{issue_id}")
    def delete_issue_report(
        issue_id: str,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, str]:
        try:
            container.delete_issue_report.execute(user=current_user, issue_id=issue_id)
        except DomainError as error:
            raise _to_http_error(error) from error
        return {"status": "deleted"}

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
        month_ranges = get_month_ranges(year=year, month=month)
        weeks = [
            {
                "week_number": week_number,
                "label": f"Faixa {week_number} ({start_day}-{end_day})",
                "start_day": start_day,
                "end_day": end_day,
                "value": _decimal_to_float(by_week.get(week_number)),
            }
            for week_number, start_day, end_day in month_ranges
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
                ocorrencia=payload.ocorrencia,
                identificacao_causa=payload.identificacao_causa,
                proposta_solucao=payload.proposta_solucao,
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
        try:
            created = container.create_indicator.execute(
                user=current_user,
                area_id=payload.area_id,
                name=payload.name,
                description=payload.description,
                aggregation_type=payload.aggregation_type,
                unit_id=payload.unit_id,
                maturity_level=(
                    _parse_decimal(payload.maturity_level, "maturity_level")
                    if payload.maturity_level not in (None, "")
                    else None
                ),
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
            "unit_id": created.unit_id,
            "unit": created.unit,
            "maturity_level": _decimal_to_float(created.maturity_level),
        }

    @router.put("/indicators/{indicator_id}")
    def update_indicator(
        indicator_id: str,
        payload: UpdateIndicatorPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            updated = container.update_indicator.execute(
                user=current_user,
                indicator_id=indicator_id,
                area_id=payload.area_id,
                name=payload.name,
                description=payload.description,
                aggregation_type=payload.aggregation_type,
                unit_id=payload.unit_id,
                maturity_level=(
                    _parse_decimal(payload.maturity_level, "maturity_level")
                    if payload.maturity_level not in (None, "")
                    else None
                ),
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "id": updated.id,
            "area_id": updated.area_id,
            "area_name": updated.area_name,
            "name": updated.name,
            "description": updated.description,
            "aggregation_type": updated.aggregation_type,
            "unit_id": updated.unit_id,
            "unit": updated.unit,
            "maturity_level": _decimal_to_float(updated.maturity_level),
        }

    @router.delete("/indicators/{indicator_id}")
    def delete_indicator(
        indicator_id: str,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, str]:
        try:
            container.delete_indicator.execute(user=current_user, indicator_id=indicator_id)
        except DomainError as error:
            raise _to_http_error(error) from error
        return {"status": "deleted"}

    @router.post("/indicators/{indicator_id}/monthly-target")
    def upsert_monthly_target(
        indicator_id: str,
        payload: MonthlyTargetPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        target_value = _parse_optional_decimal(payload.target_value, "target_value")
        try:
            saved = container.upsert_indicator_month_target.execute(
                user=current_user,
                indicator_id=indicator_id,
                year=payload.year,
                month=payload.month,
                target_value=target_value,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        if saved is None:
            return {
                "indicator_id": indicator_id,
                "year": payload.year,
                "month": payload.month,
                "target_value": None,
                "status": "deleted",
            }

        return {
            "indicator_id": saved.indicator_id,
            "year": saved.year,
            "month": saved.month,
            "target_value": _decimal_to_float(saved.target_value),
            "created_by": saved.created_by,
            "updated_by": saved.updated_by,
        }

    @router.post("/indicators/{indicator_id}/monthly-projection")
    def upsert_monthly_projection(
        indicator_id: str,
        payload: MonthlyProjectionPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        projected_value = _parse_optional_decimal(payload.projected_value, "projected_value")
        try:
            saved = container.upsert_indicator_month_projection.execute(
                user=current_user,
                indicator_id=indicator_id,
                year=payload.year,
                month=payload.month,
                projected_value=projected_value,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        if saved is None:
            return {
                "indicator_id": indicator_id,
                "year": payload.year,
                "month": payload.month,
                "projected_value": None,
                "status": "deleted",
            }

        return {
            "indicator_id": saved.indicator_id,
            "year": saved.year,
            "month": saved.month,
            "projected_value": _decimal_to_float(saved.projected_value),
            "created_by": saved.created_by,
            "updated_by": saved.updated_by,
        }

    @router.post("/indicators/{indicator_id}/monthly-na")
    def set_month_not_applicable(
        indicator_id: str,
        payload: MonthlyNotApplicablePayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            container.set_indicator_month_not_applicable.execute(
                user=current_user,
                indicator_id=indicator_id,
                year=payload.year,
                month=payload.month,
                is_not_applicable=payload.is_not_applicable,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "indicator_id": indicator_id,
            "year": payload.year,
            "month": payload.month,
            "not_applicable": payload.is_not_applicable,
        }

    @router.post("/indicators/{indicator_id}/annual-planning")
    def upsert_annual_planning(
        indicator_id: str,
        payload: AnnualPlanningPayload,
        current_user: User = Depends(get_current_user),
    ) -> dict[str, Any]:
        try:
            annual_target = _parse_optional_decimal(payload.annual_target, "annual_target")
            confidence_level = ensure_confidence_level(
                _parse_optional_decimal(payload.confidence_level, "confidence_level")
            )
            ensure_role(current_user, "executivo")
            saved = container.indicator_repository.upsert_year_planning(
                indicator_id=indicator_id,
                year=payload.year,
                annual_target=annual_target,
                confidence_level=confidence_level,
                user_id=current_user.id,
            )
        except DomainError as error:
            raise _to_http_error(error) from error

        return {
            "indicator_id": saved.indicator_id,
            "year": saved.year,
            "annual_target": _decimal_to_float(saved.annual_target),
            "confidence_level": _decimal_to_float(saved.confidence_level),
            "created_by": saved.created_by,
            "updated_by": saved.updated_by,
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
