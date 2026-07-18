from __future__ import annotations

from core.domain.models import User
from core.domain.rules import ensure_required_text, ensure_role, ensure_user_active
from core.ports.repositories import IssueReportRepositoryPort


class DeleteIssueReport:
    def __init__(self, issue_report_repository: IssueReportRepositoryPort) -> None:
        self.issue_report_repository = issue_report_repository

    def execute(self, user: User, issue_id: str) -> None:
        ensure_user_active(user)
        ensure_role(user, "executivo")
        self.issue_report_repository.soft_delete_issue_report(
            issue_id=ensure_required_text(issue_id, "issue_id"),
            deleted_by=user.id,
        )
