from __future__ import annotations

from core.domain.models import IssueReport, User
from core.domain.rules import ensure_can_use_issue_reports, ensure_user_active
from core.ports.repositories import IssueReportRepositoryPort


class ListIssueReports:
    def __init__(self, issue_report_repository: IssueReportRepositoryPort) -> None:
        self.issue_report_repository = issue_report_repository

    def execute(self, user: User) -> list[IssueReport]:
        ensure_user_active(user)
        ensure_can_use_issue_reports(user)
        requester_id = None if user.role == "executivo" else user.id
        return self.issue_report_repository.list_issue_reports(requester_id=requester_id)
