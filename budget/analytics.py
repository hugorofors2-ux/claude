"""Sammanställningar: utfall per kategori, budget vs. utfall, trender och avvikelser."""

from __future__ import annotations

import pandas as pd


def monthly_category_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Summera utgifter (belopp < 0) per månad och kategori, som positiva belopp."""
    expenses = df[df["amount"] < 0].copy()
    if expenses.empty:
        return pd.DataFrame(columns=["month", "category", "spend"])
    expenses["month"] = pd.to_datetime(expenses["date"]).dt.to_period("M").astype(str)
    expenses["spend"] = -expenses["amount"]
    return expenses.groupby(["month", "category"], as_index=False)["spend"].sum()


def budget_vs_actual(summary: pd.DataFrame, budgets: dict, month: str) -> pd.DataFrame:
    """Jämför budget och utfall per kategori för en given månad ("YYYY-MM")."""
    month_budget = budgets.get(month, {})
    actual = (
        summary[summary["month"] == month].set_index("category")["spend"].to_dict()
        if not summary.empty
        else {}
    )
    categories = sorted(set(month_budget) | set(actual))
    rows = []
    for category in categories:
        budget = float(month_budget.get(category, 0.0))
        actual_spend = float(actual.get(category, 0.0))
        rows.append(
            {
                "category": category,
                "budget": budget,
                "actual": actual_spend,
                "diff": actual_spend - budget,
                "pct_used": (actual_spend / budget * 100) if budget else (100.0 if actual_spend else 0.0),
            }
        )
    result = pd.DataFrame(rows, columns=["category", "budget", "actual", "diff", "pct_used"])
    if not result.empty:
        result = result.sort_values("actual", ascending=False).reset_index(drop=True)
    return result


def trend(summary: pd.DataFrame, categories: list[str] | None = None) -> pd.DataFrame:
    """Pivotera utfall till en tabell: rader = månad, kolumner = kategori."""
    if summary.empty:
        return pd.DataFrame()
    pivot = summary.pivot_table(index="month", columns="category", values="spend", fill_value=0.0)
    if categories:
        cols = [c for c in categories if c in pivot.columns]
        pivot = pivot[cols]
    return pivot.sort_index()


def find_deviations(budget_vs_actual_df: pd.DataFrame, threshold_pct: float = 15.0) -> pd.DataFrame:
    """Kategorier vars utfall avviker >= threshold_pct% från budgeten (över eller under)."""
    if budget_vs_actual_df.empty:
        return budget_vs_actual_df
    dev = budget_vs_actual_df[budget_vs_actual_df["budget"] > 0].copy()
    if dev.empty:
        return dev
    dev["pct_diff"] = (dev["diff"] / dev["budget"]) * 100
    dev = dev[dev["pct_diff"].abs() >= threshold_pct]
    return dev.sort_values("pct_diff", ascending=False).reset_index(drop=True)


def month_over_month_change(summary: pd.DataFrame) -> pd.Series:
    """Förändring i kronor per kategori mellan de två senaste månaderna."""
    pivot = trend(summary)
    if pivot.empty or len(pivot) < 2:
        return pd.Series(dtype=float)
    return (pivot.iloc[-1] - pivot.iloc[-2]).sort_values(ascending=False)
