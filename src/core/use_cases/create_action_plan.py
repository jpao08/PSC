from __future__ import annotations

from datetime import date

from core.domain.models import (
    ActionPlan,
    ActionPlanHistoryEvent,
    NewActionPlan,
    NotFoundError,
    User,
)
from core.domain.rules import (
    ensure_can_view_indicator,
    ensure_required_text,
    ensure_role,
    ensure_user_active,
)
from core.ports.repositories import ActionPlanRepositoryPort, IndicatorRepositoryPort
from core.ports.task_gateway import TaskGatewayPort


class CreateActionPlan:
    def __init__(
        self,
        action_plan_repository: ActionPlanRepositoryPort,
        indicator_repository: IndicatorRepositoryPort,
        task_gateway: TaskGatewayPort,
    ) -> None:
        self.action_plan_repository = action_plan_repository
        self.indicator_repository = indicator_repository
        self.task_gateway = task_gateway

    def execute(
        self,
        user: User,
        indicator_id: str,
        title: str,
        problem_description: str,
        expected_action: str,
        bitrix_responsible_id: str,
        responsible_name: str,
        responsible_email: str | None,
        due_date: date | None,
    ) -> ActionPlan:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        indicator = self.indicator_repository.get_by_id(indicator_id)
        if indicator is None:
            raise NotFoundError("Indicador nao encontrado.")
        ensure_can_view_indicator(user=user, indicator=indicator)

        clean_title = ensure_required_text(title, "titulo")
        clean_problem = ensure_required_text(problem_description, "descricao do problema")
        clean_expected = ensure_required_text(expected_action, "acao esperada")
        clean_bitrix_responsible_id = ensure_required_text(
            bitrix_responsible_id,
            "responsavel do Bitrix24",
        )
        clean_responsible = ensure_required_text(responsible_name, "responsavel")

        description = (
            f"Indicador: {indicator.name}\n"
            f"Area: {indicator.area_name or indicator.area_id}\n"
            f"Problema: {clean_problem}\n"
            f"Acao esperada: {clean_expected}\n"
            f"Responsavel Bitrix ID: {clean_bitrix_responsible_id}\n"
            f"Responsavel: {clean_responsible}\n"
            f"Email: {responsible_email or '-'}\n"
            f"Prazo: {due_date.isoformat() if due_date else '-'}"
        )

        bitrix_task_id: str | None = None
        status = "created"
        try:
            bitrix_task_id = self.task_gateway.create_task(
                title=clean_title,
                description=description,
                responsible_bitrix_user_id=clean_bitrix_responsible_id,
                due_date=due_date,
            )
            if not bitrix_task_id:
                status = "bitrix_pending"
        except Exception:
            status = "bitrix_pending"

        plan = self.action_plan_repository.create_action_plan(
            NewActionPlan(
                indicator_id=indicator_id,
                title=clean_title,
                problem_description=clean_problem,
                expected_action=clean_expected,
                bitrix_responsible_id=clean_bitrix_responsible_id,
                responsible_name=clean_responsible,
                responsible_email=responsible_email,
                due_date=due_date,
                bitrix_task_id=bitrix_task_id,
                status=status,
                created_by=user.id,
            )
        )

        history_description = (
            "Plano criado. Tentativa de criacao no Bitrix24: "
            + (f"ok ({bitrix_task_id})" if bitrix_task_id else "pendente/falha")
        )
        self.action_plan_repository.add_action_plan_history(
            ActionPlanHistoryEvent(
                action_plan_id=plan.id,
                event_type="created",
                event_description=history_description,
                created_by=user.id,
            )
        )
        return plan
