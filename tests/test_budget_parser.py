import pandas as pd

from budget.parser import guess_column, normalize


def test_guess_column_matches_swedish_bank_headers():
    columns = ["Bokföringsdag", "Beskrivning", "Belopp", "Saldo"]
    assert guess_column(columns, ["bokföringsdag", "datum"]) == "Bokföringsdag"
    assert guess_column(columns, ["beskrivning", "text"]) == "Beskrivning"
    assert guess_column(columns, ["belopp", "amount"]) == "Belopp"


def test_guess_column_returns_none_when_no_match():
    assert guess_column(["A", "B"], ["belopp", "amount"]) is None


def test_normalize_parses_comma_decimal_and_thousands_space():
    raw = pd.DataFrame(
        {
            "Bokföringsdag": ["2026-06-01", "2026-06-03"],
            "Beskrivning": ["ICA SUPERMARKET", "HYRA JUNI"],
            "Belopp": ["-1 234,50", "-8 500,00"],
        }
    )
    out = normalize(raw)
    assert list(out.columns) == ["date", "description", "amount"]
    assert out.loc[0, "amount"] == -1234.50
    assert out.loc[1, "amount"] == -8500.00
    assert out.loc[0, "description"] == "ICA SUPERMARKET"


def test_normalize_raises_when_columns_unidentifiable():
    raw = pd.DataFrame({"A": [1], "B": [2], "C": [3]})
    try:
        normalize(raw)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_normalize_accepts_explicit_column_override():
    raw = pd.DataFrame({"d": ["2026-01-01"], "t": ["Something"], "kr": [-100]})
    out = normalize(raw, date_col="d", desc_col="t", amount_col="kr")
    assert out.loc[0, "amount"] == -100
