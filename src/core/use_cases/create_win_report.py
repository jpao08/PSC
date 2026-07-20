from __future__ import annotations

from core.domain.models import NewWinReport, User, ValidationError, WinReport
from core.domain.rules import ensure_can_use_issue_reports, ensure_required_text, ensure_user_active
from core.ports.repositories import IndicatorRepositoryPort, WinReportRepositoryPort


class CreateWinReport:
    def __init__(
        self,
        win_report_repository: WinReportRepositoryPort,
        indicator_repository: IndicatorRepositoryPort,
    ) -> None:
        self.win_report_repository = win_report_repository
        self.indicator_repository = indicator_repository

    def execute(
        self,
        user: User,
        title: str,
        area_id: str | None,
        is_other_area: bool,
        description: str,
    ) -> WinReport:
        ensure_user_active(user)
        ensure_can_use_issue_reports(user)

        clean_area_id = area_id.strip() if area_id else None
        if is_other_area:
            clean_area_id = None
        elif not clean_area_id:
            raise ValidationError("Selecione uma area ou marque Outras.")
        elif self.indicator_repository.get_area_by_id(clean_area_id) is None:
            raise ValidationError("Area invalida para Win.")

        return self.win_report_repository.create_win_report(
            NewWinReport(
                title=ensure_required_text(title, "titulo"),
                requester_id=user.id,
                area_id=clean_area_id,
                is_other_area=is_other_area,
                description=ensure_required_text(description, "descricao"),
            )
        )
