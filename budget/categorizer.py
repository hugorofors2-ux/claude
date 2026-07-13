"""Regelbaserad kategorisering av transaktioner, med stöd för manuella rättningar."""

from __future__ import annotations

import pandas as pd

from .categories import DEFAULT_KEYWORD_RULES, UNCATEGORIZED


def categorize_description(description: str, rules: dict[str, list[str]]) -> str:
    upper = description.upper()
    for category, keywords in rules.items():
        for keyword in keywords:
            if keyword.upper() in upper:
                return category
    return UNCATEGORIZED


def categorize_transactions(
    df: pd.DataFrame,
    rules: dict[str, list[str]],
    overrides: dict[str, str] | None = None,
) -> pd.DataFrame:
    """Lägg till en `category`-kolumn.

    `overrides` mappar en exakt transaktionsbeskrivning till en kategori som
    användaren tidigare valt manuellt – dessa vinner alltid över nyckelordsreglerna,
    så att verktyget "lär sig" återkommande transaktioner.
    """
    overrides = overrides or {}

    def pick(description: str) -> str:
        if description in overrides:
            return overrides[description]
        return categorize_description(description, rules)

    out = df.copy()
    out["category"] = out["description"].map(pick)
    return out


def merge_rules(custom_keywords: dict[str, list[str]] | None) -> dict[str, list[str]]:
    """Slå ihop standardreglerna med användarens egna nyckelord per kategori."""
    merged = {category: list(keywords) for category, keywords in DEFAULT_KEYWORD_RULES.items()}
    for category, keywords in (custom_keywords or {}).items():
        bucket = merged.setdefault(category, [])
        for keyword in keywords:
            if keyword not in bucket:
                bucket.append(keyword)
    return merged
