from __future__ import annotations

from core.domain.models import IssueReport, User, ValidationError
from core.domain.rules import (
    ensure_issue_gut_value,
    ensure_issue_status,
    ensure_required_text,
    ensure_role,
    ensure_user_active,
)
from core.ports.repositories import IssueReportRepositoryPort


class UpdateIssueReportExecutiveReview:
    def __init__(self, issue_report_repository: IssueReportRepositoryPort) -> None:
        self.issue_report_repository = issue_report_repository

    def execute(
        self,
        user: User,
        issue_id: str,
        executive_gravity: int | None = None,
        executive_urgency: int | None = None,
        executive_tendency: int | None = None,
        status: str | None = None,
    ) -> IssueReport:
        ensure_user_active(user)
        ensure_role(user, "executivo")

        clean_issue_id = ensure_required_text(issue_id, "issue_id")
        has_any_gut = any(
            value is not None
            for value in (executive_gravity, executive_urgency, executive_tendency)
        )
        has_full_gut = all(
            value is not None
            for value in (executive_gravity, executive_urgency, executive_tendency)
        )
        if has_any_gut and not has_full_gut:
            raise ValidationError("Informe Gravidade, Urgencia e Tendencia executivas.")
        if not has_any_gut and status is None:
            raise ValidationError("Informe Status ou GUT executivo para atualizar o Issue Report.")

        return self.issue_report_repository.update_executive_review(
            issue_id=clean_issue_id,
            executive_gravity=(
                ensure_issue_gut_value(executive_gravity, "gravidade executiva")
                if executive_gravity is not None
                else None
            ),
            executive_urgency=(
                ensure_issue_gut_value(executive_urgency, "urgencia executiva")
                if executive_urgency is not None
                else None
            ),
            executive_tendency=(
                ensure_issue_gut_value(executive_tendency, "tendencia executiva")
                if executive_tendency is not None
                else None
            ),
            status=ensure_issue_status(status) if status is not None else None,
            reviewed_by=user.id,
        )
