import math

import pandas as pd

from fantasy_wc import odds_model


def test_implied_probs_normalised():
    ph, pd_, pa = odds_model.implied_probs(2.0, 4.0, 4.0)
    assert math.isclose(ph + pd_ + pa, 1.0, rel_tol=1e-9)
    # Lägst odds -> högst sannolikhet.
    assert ph > pa


def test_clean_sheet_prob_poisson():
    assert math.isclose(odds_model.clean_sheet_prob(0.0), 1.0)
    assert math.isclose(odds_model.clean_sheet_prob(1.0), math.exp(-1.0))
    assert odds_model.clean_sheet_prob(2.0) < odds_model.clean_sheet_prob(1.0)


def test_xg_from_explicit_columns():
    row = pd.Series({"home": "A", "away": "B", "home_xg": 1.8, "away_xg": 0.7})
    m = odds_model.xg_from_odds_row(row, {"base_total_goals": 2.6, "odds_supremacy_coef": 2.0})
    assert m.home_xg == 1.8 and m.away_xg == 0.7
    assert m.opponent_xg("A") == 0.7
    assert m.team_xg("B") == 0.7


def test_xg_from_odds_favourite_has_higher_xg():
    row = pd.Series(
        {"home": "A", "away": "B", "home_odds": 1.5, "draw_odds": 4.0, "away_odds": 6.0, "total_line": 2.5}
    )
    m = odds_model.xg_from_odds_row(row, {"base_total_goals": 2.6, "odds_supremacy_coef": 2.0})
    assert m.home_xg > m.away_xg
    assert math.isclose(m.home_xg + m.away_xg, 2.5, rel_tol=1e-9)


def test_xg_ranking_fallback():
    row = pd.Series({"home": "A", "away": "B"})
    cfg = {"base_total_goals": 2.6, "odds_supremacy_coef": 2.0, "ranking_supremacy_coef": 1.0}
    m = odds_model.xg_from_odds_row(row, cfg, team_points={"A": 1900, "B": 1700})
    assert m.home_xg > m.away_xg
