from __future__ import annotations

from core.domain.models import User
from core.domain.rules import ensure_role, ensure_user_active
from core.ports.repositories import WinReportRepositoryPort


class DeleteWinReport:
    def __init__(self, win_report_repository: WinReportRepositoryPort) -> None:
        self.win_report_repository = win_report_repository

    def execute(self, user: User, win_id: str) -> None:
        ensure_user_active(user)
        ensure_role(user, "executivo")
        self.win_report_repository.soft_delete_win_report(win_id=win_id, deleted_by=user.id)
