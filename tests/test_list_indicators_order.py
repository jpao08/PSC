from __future__ import annotations

from decimal import Decimal

from core.domain.models import Indicator, User
from core.use_cases.list_indicators import ListIndicators


class FakeIndicatorRepository:
    def __init__(self, indicators: list[Indicator]) -> None:
        self.indicators = indicators

    def list_active(self, area_id: str | None = None) -> list[Indicator]:
        if area_id is None:
            return self.indicators
        return [item for item in self.indicators if item.area_id == area_id]

    def list_weekly_values(self, indicator_ids: list[str], year: int, month: int | None = None) -> list:
        return []


def test_list_indicators_sorted_by_area_and_name() -> None:
    repository = FakeIndicatorRepository(
        indicators=[
            Indicator(
                id="3",
                area_id="area-2",
                area_name="Comercial",
                name="Contratos",
                description=None,
                aggregation_type="sum",
                unit="R$",
                target_value=None,
                is_active=True,
                created_by="user-1",
            ),
            Indicator(
                id="1",
                area_id="area-1",
                area_name="Financeiro",
                name="EBITDA",
                description=None,
                aggregation_type="sum",
                unit="R$",
                target_value=Decimal("100"),
                is_active=True,
                created_by="user-1",
            ),
            Indicator(
                id="2",
                area_id="area-2",
                area_name="Comercial",
                name="Apresentacoes",
                description=None,
                aggregation_type="sum",
                unit="Unidades",
                target_value=None,
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
