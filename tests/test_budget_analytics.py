import pandas as pd

from budget.analytics import (
    budget_vs_actual,
    find_deviations,
    month_over_month_change,
    monthly_category_summary,
    trend,
)


def _transactions():
    return pd.DataFrame(
        {
            "date": pd.to_datetime(
                ["2026-06-05", "2026-06-10", "2026-07-05", "2026-07-06", "2026-07-07"]
            ),
            "description": ["ICA", "HYRA", "ICA", "ICA", "LON"],
            "amount": [-500.0, -8000.0, -600.0, -700.0, 30000.0],
            "category": [
                "Mat & Livsmedel",
                "Boende & Hyra",
                "Mat & Livsmedel",
                "Mat & Livsmedel",
                "Lön & Inkomst",
            ],
        }
    )


def test_monthly_category_summary_ignores_income():
    summary = monthly_category_summary(_transactions())
    assert "Lön & Inkomst" not in set(summary["category"])
    june_food = summary[(summary["month"] == "2026-06") & (summary["category"] == "Mat & Livsmedel")]
    assert june_food["spend"].iloc[0] == 500.0
    july_food = summary[(summary["month"] == "2026-07") & (summary["category"] == "Mat & Livsmedel")]
    assert july_food["spend"].iloc[0] == 1300.0


def test_budget_vs_actual_computes_diff_and_pct():
    summary = monthly_category_summary(_transactions())
    budgets = {"2026-07": {"Mat & Livsmedel": 1000.0}}
    bva = budget_vs_actual(summary, budgets, "2026-07")
    row = bva[bva["category"] == "Mat & Livsmedel"].iloc[0]
    assert row["actual"] == 1300.0
    assert row["diff"] == 300.0
    assert row["pct_used"] == 130.0


def test_find_deviations_flags_overspend_above_threshold():
    summary = monthly_category_summary(_transactions())
    budgets = {"2026-07": {"Mat & Livsmedel": 1000.0}}
    bva = budget_vs_actual(summary, budgets, "2026-07")
    deviations = find_deviations(bva, threshold_pct=15.0)
    assert "Mat & Livsmedel" in set(deviations["category"])


def test_find_deviations_ignores_categories_without_budget():
    summary = monthly_category_summary(_transactions())
    bva = budget_vs_actual(summary, {}, "2026-06")
    deviations = find_deviations(bva, threshold_pct=15.0)
    assert deviations.empty


def test_trend_pivots_month_by_category():
    summary = monthly_category_summary(_transactions())
    pivot = trend(summary)
    assert pivot.loc["2026-06", "Mat & Livsmedel"] == 500.0
    assert pivot.loc["2026-07", "Mat & Livsmedel"] == 1300.0


def test_month_over_month_change():
    summary = monthly_category_summary(_transactions())
    change = month_over_month_change(summary)
    assert change["Mat & Livsmedel"] == 800.0
