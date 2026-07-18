from decimal import Decimal

from core.domain.rules import calculate_monthly_value


def test_monthly_calculation_sum() -> None:
    result = calculate_monthly_value(
        values=[
            (1, Decimal("10")),
            (2, Decimal("20")),
            (4, Decimal("5")),
        ],
        aggregation_type="sum",
        year=2026,
        month=1,
    )
    assert result == Decimal("35")


def test_monthly_calculation_avg() -> None:
    result = calculate_monthly_value(
        values=[
            (1, Decimal("10")),
            (2, Decimal("20")),
        ],
        aggregation_type="avg",
        year=2026,
        month=5,
    )
    assert result == Decimal("15")


def test_monthly_calculation_latest_returns_last_filled_range() -> None:
    result = calculate_monthly_value(
        values=[
            (1, Decimal("10")),
            (2, Decimal("20")),
            (4, Decimal("55")),
        ],
        aggregation_type="latest",
        year=2026,
        month=5,
    )
    assert result == Decimal("55")
