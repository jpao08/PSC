from decimal import Decimal

import pytest

from core.domain.rules import (
    calculate_achievement_percent,
    calculate_annual_value,
    calculate_monthly_value,
    classify_performance,
    ensure_confidence_level,
)
from core.domain.models import ValidationError


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


def test_performance_scale_boundaries() -> None:
    assert classify_performance(None) == "neutral"
    assert classify_performance(Decimal("0")) == "not_reliable"
    assert classify_performance(Decimal("30")) == "not_reliable"
    assert classify_performance(Decimal("31")) == "fragile"
    assert classify_performance(Decimal("50")) == "fragile"
    assert classify_performance(Decimal("51")) == "functional"
    assert classify_performance(Decimal("70")) == "functional"
    assert classify_performance(Decimal("71")) == "reliable"
    assert classify_performance(Decimal("90")) == "reliable"
    assert classify_performance(Decimal("91")) == "strategic"
    assert classify_performance(Decimal("101")) == "strategic"


def test_confidence_validation() -> None:
    assert ensure_confidence_level(Decimal("0")) == Decimal("0")
    assert ensure_confidence_level(Decimal("100")) == Decimal("100")
    with pytest.raises(ValidationError):
        ensure_confidence_level(Decimal("100.01"))


def test_annual_projected_prefers_real_before_projection() -> None:
    values = [(1, Decimal("80")), (2, Decimal("75"))]
    assert calculate_annual_value(values, "sum") == Decimal("155")
    assert calculate_achievement_percent(Decimal("68"), Decimal("100")) == Decimal("68.00")
    assert calculate_achievement_percent(Decimal("68"), Decimal("0")) is None
