from decimal import Decimal

import pytest

from core.domain.rules import (
    calculate_achievement_percent,
    calculate_annual_value,
    build_quarter_summary,
    calculate_monthly_value,
    classify_performance,
    ensure_confidence_level,
    month_status,
)
from core.domain.models import ValidationError


def test_monthly_calculation_uses_latest_cumulative_value() -> None:
    result = calculate_monthly_value(
        values=[
            (1, Decimal("100")),
            (2, Decimal("150")),
            (3, Decimal("200")),
            (4, Decimal("250")),
        ],
        aggregation_type="sum",
        year=2026,
        month=1,
    )
    assert result == Decimal("250")


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
    assert result == Decimal("20")


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


def test_quarter_consolidation_and_completeness() -> None:
    base_months = [
        (1, Decimal("100"), Decimal("100"), "filled"),
        (2, Decimal("150"), Decimal("150"), "filled"),
        (3, Decimal("200"), Decimal("200"), "filled"),
    ]
    assert build_quarter_summary(1, "sum", base_months, Decimal("1000"), True)["value"] == Decimal("450")
    assert build_quarter_summary(1, "latest", base_months, Decimal("1000"), True)["value"] == Decimal("200")
    assert build_quarter_summary(1, "avg", base_months, Decimal("1000"), True)["value"] == Decimal("150")

    incomplete = build_quarter_summary(
        1,
        "sum",
        [
            (1, Decimal("0"), None, month_status(Decimal("0"), False)),
            (2, None, None, month_status(None, True)),
            (3, None, None, month_status(None, False)),
        ],
        None,
        False,
    )
    assert incomplete["value"] == Decimal("0")
    assert incomplete["filled_count"] == 1
    assert incomplete["expected_count"] == 2
    assert incomplete["completeness_percent"] == Decimal("50.0")


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
