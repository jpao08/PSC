from __future__ import annotations

from datetime import datetime

import pytest

from core.domain.models import Area, AuthorizationError, IssueReport, IssueTag, NewIssueReport, User, ValidationError
from core.use_cases.create_issue_report import CreateIssueReport
from core.use_cases.delete_issue_report import DeleteIssueReport
from core.use_cases.list_issue_reports import ListIssueReports
from core.use_cases.update_issue_report_executive_review import UpdateIssueReportExecutiveReview


def build_user(
    role: str = "gestor_area",
    can_use_issue_reports: bool = False,
    user_id: str = "user-1",
) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        name=user_id,
        role=role,
        area_id=None,
        is_active=True,
        password_hash="ignored",
        can_use_issue_reports=can_use_issue_reports,
    )


class FakeIndicatorRepository:
    def get_area_by_id(self, area_id: str) -> Area | None:
        if area_id == "area-1":
            return Area(id="area-1", name="Financeiro")
        return None


class FakeIssueReportRepository:
    def __init__(self) -> None:
        self.issues: list[IssueReport] = []
        self.tags: list[IssueTag] = []
        self.created: NewIssueReport | None = None

    def create_issue_report(self, issue: NewIssueReport) -> IssueReport:
        self.created = issue
        created = IssueReport(
            id="issue-1",
            title=issue.title,
            requester_id=issue.requester_id,
            requester_name="Solicitante",
            area_id=issue.area_id,
            area_name="Financeiro" if issue.area_id else None,
            is_other_area=issue.is_other_area,
            requester_gravity=issue.requester_gravity,
            requester_urgency=issue.requester_urgency,
            requester_tendency=issue.requester_tendency,
            requester_priority_score=(
                issue.requester_gravity * issue.requester_urgency * issue.requester_tendency
            ),
            executive_gravity=None,
            executive_urgency=None,
            executive_tendency=None,
            executive_priority_score=None,
            ocorrencia=issue.ocorrencia,
            identificacao_causa=issue.identificacao_causa,
            proposta_solucao=issue.proposta_solucao,
            status="Não Iniciada",
            created_at=datetime(2026, 6, 25),
            reviewed_by=None,
            reviewed_at=None,
            tags=[],
        )
        self.issues.append(created)
        return created

    def list_issue_reports(self, requester_id: str | None = None) -> list[IssueReport]:
        if requester_id:
            return [issue for issue in self.issues if issue.requester_id == requester_id]
        return list(self.issues)

    def update_executive_review(
        self,
        issue_id: str,
        executive_gravity: int | None,
        executive_urgency: int | None,
        executive_tendency: int | None,
        status: str | None,
        reviewed_by: str,
    ) -> IssueReport:
        issue = self.issues[0]
        next_gravity = executive_gravity if executive_gravity is not None else issue.executive_gravity
        next_urgency = executive_urgency if executive_urgency is not None else issue.executive_urgency
        next_tendency = executive_tendency if executive_tendency is not None else issue.executive_tendency
        next_score = (
            next_gravity * next_urgency * next_tendency
            if next_gravity is not None and next_urgency is not None and next_tendency is not None
            else issue.executive_priority_score
        )
        updated = IssueReport(
            **{
                **issue.__dict__,
                "executive_gravity": next_gravity,
                "executive_urgency": next_urgency,
                "executive_tendency": next_tendency,
                "executive_priority_score": next_score,
                "status": status or issue.status,
                "reviewed_by": reviewed_by,
                "reviewed_at": datetime(2026, 6, 25),
            }
        )
        self.issues[0] = updated
        return updated

    def soft_delete_issue_report(self, issue_id: str, deleted_by: str) -> None:
        self.issues = [issue for issue in self.issues if issue.id != issue_id]

    def list_issue_tags(self) -> list[IssueTag]:
        return [tag for tag in self.tags if tag.is_active]

    def create_issue_tag(self, name: str, color: str | None, created_by: str) -> IssueTag:
        tag = IssueTag(id=f"tag-{len(self.tags) + 1}", name=name, color=color, is_active=True)
        self.tags.append(tag)
        return tag

    def update_issue_tag(self, tag_id: str, name: str, color: str | None) -> IssueTag:
        for index, tag in enumerate(self.tags):
            if tag.id == tag_id:
                updated = IssueTag(id=tag.id, name=name, color=color, is_active=tag.is_active)
                self.tags[index] = updated
                return updated
        raise AssertionError("tag not found")

    def deactivate_issue_tag(self, tag_id: str) -> None:
        self.tags = [
            IssueTag(id=tag.id, name=tag.name, color=tag.color, is_active=False)
            if tag.id == tag_id
            else tag
            for tag in self.tags
        ]

    def replace_issue_tags(self, issue_id: str, tag_ids: list[str], updated_by: str) -> IssueReport:
        selected_tags = [tag for tag in self.tags if tag.id in tag_ids and tag.is_active]
        for index, issue in enumerate(self.issues):
            if issue.id == issue_id:
                updated = IssueReport(**{**issue.__dict__, "tags": selected_tags})
                self.issues[index] = updated
                return updated
        raise AssertionError("issue not found")


def test_issue_report_permission_required_for_manager() -> None:
    use_case = CreateIssueReport(FakeIssueReportRepository(), FakeIndicatorRepository())

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=build_user(can_use_issue_reports=False),
            title="Issue",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=3,
            requester_urgency=4,
            requester_tendency=5,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )


def test_issue_report_creation_calculates_requester_score_and_allows_other_area() -> None:
    repository = FakeIssueReportRepository()
    use_case = CreateIssueReport(repository, FakeIndicatorRepository())

    issue = use_case.execute(
        user=build_user(can_use_issue_reports=True),
        title="Issue critico",
        area_id=None,
        is_other_area=True,
        requester_gravity=3,
        requester_urgency=4,
        requester_tendency=5,
        ocorrencia="Ocorrencia",
        identificacao_causa="Causa",
        proposta_solucao="Solucao",
    )

    assert issue.requester_priority_score == 60
    assert issue.is_other_area is True
    assert repository.created is not None
    assert repository.created.area_id is None
    assert repository.created.ocorrencia == "Ocorrencia"
    assert repository.created.identificacao_causa == "Causa"
    assert repository.created.proposta_solucao == "Solucao"


def test_view_only_executive_with_permission_can_create_issue_reports() -> None:
    use_case = CreateIssueReport(FakeIssueReportRepository(), FakeIndicatorRepository())

    issue = use_case.execute(
        user=build_user(role="executivo_visualizacao", can_use_issue_reports=True),
        title="Issue",
        area_id="area-1",
        is_other_area=False,
        requester_gravity=3,
        requester_urgency=4,
        requester_tendency=5,
        ocorrencia="Ocorrencia",
        identificacao_causa="Causa",
        proposta_solucao="Solucao",
    )

    assert issue.title == "Issue"


def test_view_only_executive_without_permission_cannot_access_issue_reports() -> None:
    use_case = CreateIssueReport(FakeIssueReportRepository(), FakeIndicatorRepository())

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=build_user(role="executivo_visualizacao", can_use_issue_reports=False),
            title="Issue",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=3,
            requester_urgency=4,
            requester_tendency=5,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )


def test_issue_report_listing_is_limited_to_requester_for_non_executive() -> None:
    repository = FakeIssueReportRepository()
    use_case = CreateIssueReport(repository, FakeIndicatorRepository())
    use_case.execute(
        user=build_user(can_use_issue_reports=True, user_id="user-1"),
        title="Meu Issue",
        area_id="area-1",
        is_other_area=False,
        requester_gravity=1,
        requester_urgency=2,
        requester_tendency=3,
        ocorrencia="Ocorrencia",
        identificacao_causa="Causa",
        proposta_solucao="Solucao",
    )
    use_case.execute(
        user=build_user(can_use_issue_reports=True, user_id="user-2"),
        title="Outro Issue",
        area_id="area-1",
        is_other_area=False,
        requester_gravity=1,
        requester_urgency=2,
        requester_tendency=3,
        ocorrencia="Ocorrencia",
        identificacao_causa="Causa",
        proposta_solucao="Solucao",
    )

    listed = ListIssueReports(repository).execute(build_user(can_use_issue_reports=True, user_id="user-1"))

    assert [issue.title for issue in listed] == ["Meu Issue"]


def test_only_executive_updates_executive_priority_and_status() -> None:
    repository = FakeIssueReportRepository()
    repository.create_issue_report(
        NewIssueReport(
            title="Issue",
            requester_id="user-1",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=1,
            requester_urgency=2,
            requester_tendency=3,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )
    )
    use_case = UpdateIssueReportExecutiveReview(repository)

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=build_user(can_use_issue_reports=True),
            issue_id="issue-1",
            executive_gravity=5,
            executive_urgency=5,
            executive_tendency=5,
            status="Em atendimento",
        )

    updated = use_case.execute(
        user=build_user(role="executivo"),
        issue_id="issue-1",
        executive_gravity=5,
        executive_urgency=4,
        executive_tendency=3,
        status="Em atendimento",
    )

    assert updated.executive_priority_score == 60
    assert updated.status == "Em atendimento"


def test_executive_can_update_only_issue_status() -> None:
    repository = FakeIssueReportRepository()
    repository.create_issue_report(
        NewIssueReport(
            title="Issue",
            requester_id="user-1",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=1,
            requester_urgency=2,
            requester_tendency=3,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )
    )
    use_case = UpdateIssueReportExecutiveReview(repository)

    updated = use_case.execute(
        user=build_user(role="executivo"),
        issue_id="issue-1",
        status="Delegada",
    )

    assert updated.status == "Delegada"
    assert updated.executive_priority_score is None


def test_executive_gut_update_requires_all_three_values() -> None:
    repository = FakeIssueReportRepository()
    repository.create_issue_report(
        NewIssueReport(
            title="Issue",
            requester_id="user-1",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=1,
            requester_urgency=2,
            requester_tendency=3,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )
    )
    use_case = UpdateIssueReportExecutiveReview(repository)

    with pytest.raises(ValidationError):
        use_case.execute(
            user=build_user(role="executivo"),
            issue_id="issue-1",
            executive_gravity=5,
            executive_urgency=5,
        )


def test_only_executive_soft_deletes_issue_report() -> None:
    repository = FakeIssueReportRepository()
    repository.create_issue_report(
        NewIssueReport(
            title="Issue",
            requester_id="user-1",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=1,
            requester_urgency=2,
            requester_tendency=3,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )
    )
    use_case = DeleteIssueReport(repository)

    with pytest.raises(AuthorizationError):
        use_case.execute(user=build_user(can_use_issue_reports=True), issue_id="issue-1")

    use_case.execute(user=build_user(role="executivo"), issue_id="issue-1")

    assert repository.issues == []


def test_issue_tags_can_be_created_and_assigned_to_issue() -> None:
    repository = FakeIssueReportRepository()
    repository.create_issue_report(
        NewIssueReport(
            title="Issue",
            requester_id="user-1",
            area_id="area-1",
            is_other_area=False,
            requester_gravity=1,
            requester_urgency=2,
            requester_tendency=3,
            ocorrencia="Ocorrencia",
            identificacao_causa="Causa",
            proposta_solucao="Solucao",
        )
    )

    tag = repository.create_issue_tag(name="Cliente", color="#0B6BCB", created_by="exec")
    updated = repository.replace_issue_tags(
        issue_id="issue-1",
        tag_ids=[tag.id],
        updated_by="exec",
    )

    assert [item.name for item in repository.list_issue_tags()] == ["Cliente"]
    assert [item.id for item in updated.tags or []] == [tag.id]
