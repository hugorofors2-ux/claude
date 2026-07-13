import pandas as pd

from budget.categories import DEFAULT_KEYWORD_RULES, UNCATEGORIZED
from budget.categorizer import categorize_description, categorize_transactions, merge_rules


def test_categorize_description_matches_known_keyword():
    assert categorize_description("ICA SUPERMARKET SODERMALM", DEFAULT_KEYWORD_RULES) == "Mat & Livsmedel"
    assert categorize_description("NETFLIX.COM", DEFAULT_KEYWORD_RULES) == "Abonnemang & Räkningar"


def test_categorize_description_falls_back_to_uncategorized():
    assert categorize_description("OKÄND BUTIK XYZ", DEFAULT_KEYWORD_RULES) == UNCATEGORIZED


def test_categorize_transactions_applies_overrides():
    df = pd.DataFrame(
        {
            "date": pd.to_datetime(["2026-01-01", "2026-01-02"]),
            "description": ["ICA SUPERMARKET", "MYSTERY CO"],
            "amount": [-100.0, -50.0],
        }
    )
    overrides = {"MYSTERY CO": "Nöje & Fritid"}
    out = categorize_transactions(df, DEFAULT_KEYWORD_RULES, overrides)
    assert out.loc[0, "category"] == "Mat & Livsmedel"
    assert out.loc[1, "category"] == "Nöje & Fritid"


def test_merge_rules_adds_custom_keywords_without_mutating_defaults():
    custom = {"Mat & Livsmedel": ["MIN LOKALA BUTIK"]}
    merged = merge_rules(custom)
    assert "MIN LOKALA BUTIK" in merged["Mat & Livsmedel"]
    assert "MIN LOKALA BUTIK" not in DEFAULT_KEYWORD_RULES["Mat & Livsmedel"]
