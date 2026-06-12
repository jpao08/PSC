from __future__ import annotations

from core.domain.models import Indicator, User
from core.use_cases.list_indicators import ListIndicators


class FakeIndicatorRepository:
    def __init__(self, indicators: list[Indicator]) -> None:
        self.indicators = indicators

    def list_active(
        self,
        area_id: str | None = None,
        area_ids: list[str] | None = None,
    ) -> list[Indicator]:
        if area_ids is not None:
            return [item for item in self.indicators if item.area_id in area_ids]
        if area_id is None:
            return self.indicators
        return [item for item in self.indicators if item.area_id == area_id]

    def list_weekly_values(self, indicator_ids: list[str], year: int, month: int | None = None) -> list:
        return []

    def list_month_targets(self, indicator_ids: list[str], year: int) -> list:
        return []

    def list_month_projections(self, indicator_ids: list[str], year: int) -> list:
        return []


def test_list_indicators_sorted_by_area_and_name() -> None:
    repository = FakeIndicatorRepository(
        indicators=[
            Indicator(
                id="3",
                area_id="area-2",
                area_name="Comercial",
                area_hex_color=None,
                name="Contratos",
                description=None,
                aggregation_type="sum",
                unit_id="unit-brl",
                unit="R$",
                is_active=True,
                created_by="user-1",
            ),
            Indicator(
                id="1",
                area_id="area-1",
                area_name="Financeiro",
                area_hex_color=None,
                name="EBITDA",
                description=None,
                aggregation_type="sum",
                unit_id="unit-brl",
                unit="R$",
                is_active=True,
                created_by="user-1",
            ),
            Indicator(
                id="2",
                area_id="area-2",
                area_name="Comercial",
                area_hex_color=None,
                name="Apresentacoes",
                description=None,
                aggregation_type="sum",
                unit_id="unit-un",
                unit="Unidades",
                is_active=True,
                created_by="user-1",
            ),
        ]
    )
    use_case = ListIndicators(indicator_repository=repository)
    user = User(
        id="user-1",
        email="exec@empresa.com",
        name="Executivo",
        role="executivo",
        area_id=None,
        is_active=True,
        password_hash="ignored",
    )

    rows = use_case.execute(user=user, year=2026)

    assert [row.area_name for row in rows] == ["Comercial", "Comercial", "Financeiro"]
    assert [row.indicator_name for row in rows] == ["Apresentacoes", "Contratos", "EBITDA"]


def test_list_indicators_manager_with_multiple_areas() -> None:
    repository = FakeIndicatorRepository(
        indicators=[
            Indicator(
                id="1",
                area_id="area-1",
                area_name="Financeiro",
                area_hex_color=None,
                name="EBITDA",
                description=None,
                aggregation_type="sum",
                unit_id="unit-brl",
                unit="R$",
                is_active=True,
                created_by="user-1",
            ),
            Indicator(
                id="2",
                area_id="area-2",
                area_name="Comercial",
                area_hex_color=None,
                name="Contratos",
                description=None,
                aggregation_type="sum",
                unit_id="unit-un",
                unit="Unidades",
                is_active=True,
                created_by="user-1",
            ),
            Indicator(
                id="3",
                area_id="area-3",
                area_name="RH",
                area_hex_color=None,
                name="Treinamentos",
                description=None,
                aggregation_type="sum",
                unit_id="unit-un",
                unit="Unidades",
                is_active=True,
                created_by="user-1",
            ),
        ]
    )
    use_case = ListIndicators(indicator_repository=repository)
    user = User(
        id="user-1",
        email="gestor@empresa.com",
        name="Gestor",
        role="gestor_area",
        area_id=None,
        area_ids=["area-1", "area-2"],
        is_active=True,
        password_hash="ignored",
    )

    rows = use_case.execute(user=user, year=2026)

    assert {row.area_id for row in rows} == {"area-1", "area-2"}
