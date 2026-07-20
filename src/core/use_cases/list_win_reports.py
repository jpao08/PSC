from __future__ import annotations

from core.domain.models import User, WinReport
from core.domain.rules import ensure_can_use_issue_reports, ensure_user_active
from core.ports.repositories import WinReportRepositoryPort


class ListWinReports:
    def __init__(self, win_report_repository: WinReportRepositoryPort) -> None:
        self.win_report_repository = win_report_repository

    def execute(self, user: User) -> list[WinReport]:
        ensure_user_active(user)
        ensure_can_use_issue_reports(user)
        requester_id = None if user.role == "executivo" else user.id
        return self.win_report_repository.list_win_reports(requester_id=requester_id)
