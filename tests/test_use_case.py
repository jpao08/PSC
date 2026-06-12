from __future__ import annotations

from dataclasses import replace
from datetime import date
from decimal import Decimal

import pytest

from core.domain.models import (
    ActionPlan,
    ActionPlanHistoryEvent,
    Area,
    AuthorizationError,
    BitrixUser,
    Indicator,
    IndicatorMonthProjection,
    IndicatorUnit,
    NewActionPlan,
    NewIndicator,
    NotFoundError,
    User,
    ValidationError,
)
from core.use_cases.create_action_plan import CreateActionPlan
from core.use_cases.create_area import CreateArea
from core.use_cases.create_indicator import CreateIndicator
from core.use_cases.delete_area import DeleteArea
from core.use_cases.list_indicators import ListIndicators
from core.use_cases.register_indicator_value import RegisterIndicatorValue
from core.use_cases.search_bitrix_users import SearchBitrixUsers
from core.use_cases.update_area import UpdateArea
from core.use_cases.upsert_indicator_month_projection import UpsertIndicatorMonthProjection


def build_user(
    role: str,
    area_id: str | None = None,
    can_edit_projected_value: bool = False,
    area_ids: list[str] | None = None,
) -> User:
    return User(
        id="user-1",
        email="user@example.com",
        name="User",
        role=role,
        area_id=area_id,
        is_active=True,
        password_hash="ignored",
        can_edit_projected_value=can_edit_projected_value,
        area_ids=area_ids,
    )


class FakeIndicatorRepository:
    def __init__(self, indicator: Indicator, existing_names: set[str] | None = None) -> None:
        self.indicator = indicator
        self.saved_values: list[dict[str, object]] = []
        self.created_indicators: list[NewIndicator] = []
        self.updated_indicators: list[tuple[str, NewIndicator]] = []
        self.deleted_indicators: list[str] = []
        self.areas: list[Area] = [
            Area(id="area-A", name="Area A", hex_color="#1D4ED8", is_active=True),
            Area(id="area-B", name="Area B", hex_color="#16A34A", is_active=True),
        ]
        self.last_projection_upsert: IndicatorMonthProjection | None = None
        self.existing_names = existing_names or set()

    def list_active(
        self,
        area_id: str | None = None,
        area_ids: list[str] | None = None,
    ) -> list[Indicator]:
        indicators = [self.indicator]
        if area_ids is not None:
            return [indicator for indicator in indicators if indicator.area_id in area_ids]
        if area_id is not None:
            return [indicator for indicator in indicators if indicator.area_id == area_id]
        return indicators

    def get_by_id(self, indicator_id: str) -> Indicator | None:
        if indicator_id == self.indicator.id:
            return self.indicator
        return None

    def list_weekly_values(
        self,
        indicator_ids: list[str],
        year: int,
        month: int | None = None,
    ) -> list:
        return []

    def upsert_weekly_value(self, value) -> None:  # noqa: ANN001
        self.saved_values.append({
            "indicator_id": value.indicator_id,
            "year": value.year,
            "month": value.month,
            "week_number": value.week_number,
            "value": value.value,
        })

    def create_indicator(self, indicator: NewIndicator) -> Indicator:
        self.created_indicators.append(indicator)
        self.existing_names.add(indicator.name)
        return replace(
            self.indicator,
            id="new-indicator-id",
            area_id=indicator.area_id,
            name=indicator.name,
            description=indicator.description,
            aggregation_type=indicator.aggregation_type,
            unit_id=indicator.unit_id,
            unit="%",
            created_by=indicator.created_by,
        )

    def update_indicator(self, indicator_id: str, indicator: NewIndicator) -> Indicator:
        self.updated_indicators.append((indicator_id, indicator))
        self.existing_names.add(indicator.name)
        return replace(
            self.indicator,
            id=indicator_id,
            area_id=indicator.area_id,
            name=indicator.name,
            description=indicator.description,
            aggregation_type=indicator.aggregation_type,
            unit_id=indicator.unit_id,
            unit="%",
            created_by=indicator.created_by,
        )

    def list_month_targets(self, indicator_ids: list[str], year: int) -> list:
        return []

    def list_month_projections(self, indicator_ids: list[str], year: int) -> list:
        return []

    def delete_indicator_with_history(self, indicator_id: str) -> None:
        self.deleted_indicators.append(indicator_id)

    def exists_active_name(
        self,
        name: str,
        exclude_indicator_id: str | None = None,
    ) -> bool:
        if exclude_indicator_id and self.indicator.id == exclude_indicator_id:
            return name in {item for item in self.existing_names if item != self.indicator.name}
        return name in self.existing_names

    def list_units(self) -> list[IndicatorUnit]:
        return [IndicatorUnit(id="unit-percent", code="PERCENT", label="%")]

    def get_unit_by_id(self, unit_id: str) -> IndicatorUnit | None:
        if unit_id == "unit-percent":
            return IndicatorUnit(id="unit-percent", code="PERCENT", label="%")
        return None

    def upsert_month_target(
        self,
        indicator_id: str,
        year: int,
        month: int,
        target_value: Decimal,
        user_id: str,
    ):  # noqa: ANN201
        raise NotImplementedError

    def list_areas(self) -> list:
        return [area for area in self.areas if area.is_active]

    def get_area_by_id(self, area_id: str) -> Area | None:
        for area in self.areas:
            if area.id == area_id:
                return area
        return None

    def exists_active_area_name(self, name: str, exclude_area_id: str | None = None) -> bool:
        for area in self.areas:
            if not area.is_active:
                continue
            if exclude_area_id and area.id == exclude_area_id:
                continue
            if area.name == name:
                return True
        return False

    def create_area(self, name: str, hex_color: str | None) -> Area:
        area = Area(id=f"area-{len(self.areas) + 1}", name=name, hex_color=hex_color, is_active=True)
        self.areas.append(area)
        return area

    def update_area(self, area_id: str, name: str, hex_color: str | None) -> Area:
        for index, area in enumerate(self.areas):
            if area.id == area_id:
                updated = Area(id=area.id, name=name, hex_color=hex_color, is_active=area.is_active)
                self.areas[index] = updated
                return updated
        raise NotFoundError("Area nao encontrada para atualizacao.")

    def deactivate_area(self, area_id: str) -> None:
        for index, area in enumerate(self.areas):
            if area.id == area_id:
                self.areas[index] = Area(
                    id=area.id,
                    name=area.name,
                    hex_color=area.hex_color,
                    is_active=False,
                )
                return
        raise NotFoundError("Area nao encontrada para desativacao.")

    def upsert_month_projection(
        self,
        indicator_id: str,
        year: int,
        month: int,
        projected_value: Decimal,
        user_id: str,
    ) -> IndicatorMonthProjection:
        saved = IndicatorMonthProjection(
            indicator_id=indicator_id,
            year=year,
            month=month,
            projected_value=projected_value,
            created_by=user_id,
            updated_by=user_id,
        )
        self.last_projection_upsert = saved
        return saved


class FakeActionPlanRepository:
    def __init__(self) -> None:
        self.created: ActionPlan | None = None
        self.history: list[ActionPlanHistoryEvent] = []

    def create_action_plan(self, plan: NewActionPlan) -> ActionPlan:
        created = ActionPlan(
            id="plan-1",
            indicator_id=plan.indicator_id,
            title=plan.title,
            ocorrencia=plan.ocorrencia,
            identificacao_causa=plan.identificacao_causa,
            proposta_solucao=plan.proposta_solucao,
            bitrix_responsible_id=plan.bitrix_responsible_id,
            responsible_name=plan.responsible_name,
            responsible_email=plan.responsible_email,
            due_date=plan.due_date,
            bitrix_task_id=plan.bitrix_task_id,
            status=plan.status,
            created_by=plan.created_by,
        )
        self.created = created
        return created

    def add_action_plan_history(self, event: ActionPlanHistoryEvent) -> None:
        self.history.append(event)

    def list_action_plans(self, indicator_id: str) -> list[ActionPlan]:
        return []


class FakeTaskGateway:
    def __init__(self) -> None:
        self.called = False
        self.last_responsible_id: str | None = None

    def search_users(self, query: str, limit: int = 10) -> list[BitrixUser]:
        return [
            BitrixUser(id="42", name="Maria Gestora", email="maria@empresa.com"),
            BitrixUser(id="77", name="Joao Lider", email="joao@empresa.com"),
        ][:limit]

    def create_task(
        self,
        title: str,
        description: str,
        responsible_bitrix_user_id: str | None,
        due_date: date | None,
        creator_bitrix_user_id: str | None = None,
        observer_bitrix_user_ids: list[str] | None = None,
    ) -> str | None:
        self.called = True
        self.last_responsible_id = responsible_bitrix_user_id
        return "BITRIX-42"


def test_manager_area_authorization_for_weekly_update() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = RegisterIndicatorValue(indicator_repository=repository)
    manager_from_other_area = build_user(role="gestor_area", area_id="area-B")

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=manager_from_other_area,
            indicator_id="ind-1",
            year=2026,
            month=5,
            week_number=1,
            value=Decimal("10"),
        )


def test_manager_multi_area_authorization_for_weekly_update() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-B",
        area_name="Area B",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = RegisterIndicatorValue(indicator_repository=repository)
    manager = build_user(role="gestor_area", area_ids=["area-A", "area-B"])

    use_case.execute(
        user=manager,
        indicator_id="ind-1",
        year=2026,
        month=5,
        week_number=1,
        value=Decimal("10"),
    )

    assert repository.saved_values[0]["value"] == Decimal("10")


def test_manager_multi_area_can_list_allowed_indicator() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-B",
        area_name="Area B",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = ListIndicators(indicator_repository=repository)
    manager = build_user(role="gestor_area", area_ids=["area-A", "area-B"])

    rows = use_case.execute(user=manager, year=2026)

    assert [row.indicator_id for row in rows] == ["ind-1"]


def test_create_action_plan_calls_bitrix_gateway() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Qualidade",
        description=None,
        aggregation_type="avg",
        unit_id="unit-pts",
        unit="pts",
        is_active=True,
        created_by="user-1",
    )
    indicator_repository = FakeIndicatorRepository(indicator=indicator)
    action_plan_repository = FakeActionPlanRepository()
    task_gateway = FakeTaskGateway()

    use_case = CreateActionPlan(
        action_plan_repository=action_plan_repository,
        indicator_repository=indicator_repository,
        task_gateway=task_gateway,
    )

    executive = build_user(role="executivo")
    created = use_case.execute(
        user=executive,
        indicator_id="ind-1",
        title="Plano de melhoria",
        ocorrencia="Perda de eficiencia no processo",
        identificacao_causa="Falta de rotina padronizada",
        proposta_solucao="Definir checklist semanal",
        bitrix_responsible_id="42",
        responsible_name="Maria",
        responsible_email="maria@empresa.com",
        due_date=date(2026, 6, 15),
    )

    assert created.bitrix_task_id == "BITRIX-42"
    assert created.bitrix_responsible_id == "42"
    assert task_gateway.called is True
    assert task_gateway.last_responsible_id == "42"
    assert len(action_plan_repository.history) == 1


def test_create_indicator_only_executive() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Produtividade",
        description=None,
        aggregation_type="sum",
        unit_id="unit-percent",
        unit="un",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = CreateIndicator(indicator_repository=repository)

    manager = build_user(role="gestor_area", area_id="area-A")

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=manager,
            area_id="area-A",
            name="Novo indicador",
            description="",
            aggregation_type="sum",
            unit_id="unit-percent",
        )


def test_create_indicator_rejects_duplicate_name() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Produtividade",
        description=None,
        aggregation_type="sum",
        unit_id="unit-percent",
        unit="un",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator, existing_names={"Receita Total"})
    use_case = CreateIndicator(indicator_repository=repository)
    executive = build_user(role="executivo")

    with pytest.raises(ValidationError):
        use_case.execute(
            user=executive,
            area_id="area-A",
            name="Receita Total",
            description="",
            aggregation_type="sum",
            unit_id="unit-percent",
        )


def test_search_bitrix_users_only_executive() -> None:
    gateway = FakeTaskGateway()
    use_case = SearchBitrixUsers(task_gateway=gateway)
    manager = build_user(role="gestor_area", area_id="area-A")

    with pytest.raises(AuthorizationError):
        use_case.execute(user=manager, query="maria", limit=5)


def test_upsert_month_projection_requires_permission_flag() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpsertIndicatorMonthProjection(indicator_repository=repository)
    user_without_flag = build_user(role="executivo")

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=user_without_flag,
            indicator_id="ind-1",
            year=2026,
            month=6,
            projected_value=Decimal("100"),
        )


def test_upsert_month_projection_succeeds_with_permission_flag() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpsertIndicatorMonthProjection(indicator_repository=repository)
    user_with_flag = build_user(role="executivo", can_edit_projected_value=True)

    saved = use_case.execute(
        user=user_with_flag,
        indicator_id="ind-1",
        year=2026,
        month=6,
        projected_value=Decimal("100"),
    )

    assert saved.projected_value == Decimal("100")
    assert repository.last_projection_upsert is not None


def test_upsert_month_projection_allows_negative_value_with_permission_flag() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Resultado",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpsertIndicatorMonthProjection(indicator_repository=repository)
    user_with_flag = build_user(role="executivo", can_edit_projected_value=True)

    saved = use_case.execute(
        user=user_with_flag,
        indicator_id="ind-1",
        year=2026,
        month=6,
        projected_value=Decimal("-100"),
    )

    assert saved.projected_value == Decimal("-100")


def test_upsert_month_projection_manager_same_area_with_flag_succeeds() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpsertIndicatorMonthProjection(indicator_repository=repository)
    manager = build_user(
        role="gestor_area",
        area_id="area-A",
        can_edit_projected_value=True,
    )

    saved = use_case.execute(
        user=manager,
        indicator_id="ind-1",
        year=2026,
        month=6,
        projected_value=Decimal("88"),
    )

    assert saved.projected_value == Decimal("88")
    assert repository.last_projection_upsert is not None


def test_upsert_month_projection_manager_other_area_with_flag_denied() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpsertIndicatorMonthProjection(indicator_repository=repository)
    manager = build_user(
        role="gestor_area",
        area_id="area-B",
        can_edit_projected_value=True,
    )

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=manager,
            indicator_id="ind-1",
            year=2026,
            month=6,
            projected_value=Decimal("88"),
        )


def test_upsert_month_projection_manager_multi_area_with_flag_succeeds() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-B",
        area_name="Area B",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpsertIndicatorMonthProjection(indicator_repository=repository)
    manager = build_user(
        role="gestor_area",
        area_ids=["area-A", "area-B"],
        can_edit_projected_value=True,
    )

    saved = use_case.execute(
        user=manager,
        indicator_id="ind-1",
        year=2026,
        month=6,
        projected_value=Decimal("88"),
    )

    assert saved.projected_value == Decimal("88")


def test_create_area_only_executive() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = CreateArea(indicator_repository=repository)

    with pytest.raises(AuthorizationError):
        use_case.execute(
            user=build_user(role="gestor_area", area_id="area-A"),
            name="Nova Area",
            hex_color="#123456",
        )


def test_update_area_exec_updates_name_and_color() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = UpdateArea(indicator_repository=repository)

    updated = use_case.execute(
        user=build_user(role="executivo"),
        area_id="area-A",
        name="Area A Atualizada",
        hex_color="#ABCDEF",
    )

    assert updated.name == "Area A Atualizada"
    assert updated.hex_color == "#ABCDEF"


def test_delete_area_soft_delete_marks_area_inactive() -> None:
    indicator = Indicator(
        id="ind-1",
        area_id="area-A",
        area_name="Area A",
        area_hex_color=None,
        name="Receita",
        description=None,
        aggregation_type="sum",
        unit_id="unit-brl",
        unit="R$",
        is_active=True,
        created_by="user-1",
    )
    repository = FakeIndicatorRepository(indicator=indicator)
    use_case = DeleteArea(indicator_repository=repository)

    use_case.execute(user=build_user(role="executivo"), area_id="area-A")

    area = repository.get_area_by_id("area-A")
    assert area is not None
    assert area.is_active is False
