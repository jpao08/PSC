from decimal import Decimal

from core.domain.rules import calculate_monthly_value


def test_monthly_calculation_sum() -> None:
    result = calculate_monthly_value(
        values=[Decimal("10"), Decimal("20"), Decimal("5")],
        aggregation_type="sum",
    )
    assert result == Decimal("35")


def test_monthly_calculation_avg() -> None:
    result = calculate_monthly_value(
        values=[Decimal("10"), Decimal("20")],
        aggregation_type="avg",
    )
    assert result == Decimal("15")
