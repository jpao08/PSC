from __future__ import annotations

from core.domain.models import IssueReport, NewIssueReport, User, ValidationError
from core.domain.rules import (
    ensure_can_use_issue_reports,
    ensure_issue_gut_value,
    ensure_required_text,
    ensure_user_active,
)
from core.ports.repositories import IndicatorRepositoryPort, IssueReportRepositoryPort


class CreateIssueReport:
    def __init__(
        self,
        issue_report_repository: IssueReportRepositoryPort,
        indicator_repository: IndicatorRepositoryPort,
    ) -> None:
        self.issue_report_repository = issue_report_repository
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        title: str,
        area_id: str | None,
        is_other_area: bool,
        requester_gravity: int,
        requester_urgency: int,
        requester_tendency: int,
        ocorrencia: str,
        identificacao_causa: str,
        proposta_solucao: str,
    ) -> IssueReport:
        ensure_user_active(user)
        ensure_can_use_issue_reports(user)

        clean_area_id = area_id.strip() if area_id else None
        if is_other_area:
            clean_area_id = None
        elif not clean_area_id:
            raise ValidationError("Selecione uma area ou marque Outras.")
        elif self.indicator_repository.get_area_by_id(clean_area_id) is None:
            raise ValidationError("Area invalida para Issue Report.")

        return self.issue_report_repository.create_issue_report(
            NewIssueReport(
                title=ensure_required_text(title, "titulo"),
                requester_id=user.id,
                area_id=clean_area_id,
                is_other_area=is_other_area,
                requester_gravity=ensure_issue_gut_value(requester_gravity, "gravidade"),
                requester_urgency=ensure_issue_gut_value(requester_urgency, "urgencia"),
                requester_tendency=ensure_issue_gut_value(requester_tendency, "tendencia"),
                ocorrencia=ensure_required_text(ocorrencia, "ocorrencia"),
                identificacao_causa=ensure_required_text(
                    identificacao_causa,
                    "identificacao da causa",
                ),
                proposta_solucao=ensure_required_text(proposta_solucao, "proposta de solucao"),
            )
        )
