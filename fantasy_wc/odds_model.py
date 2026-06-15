"""Omvandlar odds (och FIFA-ranking som fallback) till förväntade mål per lag.

Kärnidé: härled lag-xG från marknadens 1X2-sannolikheter och Over/Under-totalen,
och beräkna clean sheet-sannolikhet via en Poisson-modell.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class MatchXG:
    home: str
    away: str
    home_xg: float
    away_xg: float

    def opponent_xg(self, team: str) -> float:
        if team == self.home:
            return self.away_xg
        if team == self.away:
            return self.home_xg
        raise KeyError(team)

    def team_xg(self, team: str) -> float:
        if team == self.home:
            return self.home_xg
        if team == self.away:
            return self.away_xg
        raise KeyError(team)


def implied_probs(home_odds: float, draw_odds: float, away_odds: float) -> tuple[float, float, float]:
    """Decimalodds -> normaliserade sannolikheter (vigorish borttagen)."""
    inv = np.array([1.0 / home_odds, 1.0 / draw_odds, 1.0 / away_odds])
    inv = inv / inv.sum()
    return float(inv[0]), float(inv[1]), float(inv[2])


def clean_sheet_prob(opp_xg: float) -> float:
    """P(motståndaren gör 0 mål) under Poisson = exp(-xG)."""
    return math.exp(-max(opp_xg, 0.0))


def xg_from_odds_row(row, model_cfg: dict, team_points: dict[str, float] | None = None) -> MatchXG:
    """Härled hemma/borta-xG för en oddsrad.

    Prioritetsordning:
      1. Explicita home_xg/away_xg om de finns ifyllda.
      2. 1X2-odds + total (Over/Under-linje eller config-default).
      3. FIFA-rankingpoäng som fallback.
    """
    home, away = row["home"], row["away"]

    def _present(key):
        return key in row and row[key] == row[key] and str(row[key]).strip() != ""

    if _present("home_xg") and _present("away_xg"):
        return MatchXG(home, away, float(row["home_xg"]), float(row["away_xg"]))

    total = float(row["total_line"]) if _present("total_line") else model_cfg["base_total_goals"]

    if _present("home_odds") and _present("draw_odds") and _present("away_odds"):
        p_home, _p_draw, p_away = implied_probs(
            float(row["home_odds"]), float(row["draw_odds"]), float(row["away_odds"])
        )
        supremacy = model_cfg["odds_supremacy_coef"] * (p_home - p_away)
    elif team_points is not None and home in team_points and away in team_points:
        diff = (team_points[home] - team_points[away]) / 100.0
        supremacy = model_cfg["ranking_supremacy_coef"] * diff
    else:
        supremacy = 0.0

    home_xg = max((total + supremacy) / 2.0, 0.05)
    away_xg = max((total - supremacy) / 2.0, 0.05)
    return MatchXG(home, away, home_xg, away_xg)


def build_match_xg(odds_df, matchday: int, model_cfg: dict, team_points: dict[str, float] | None = None) -> list[MatchXG]:
    rows = odds_df[odds_df["matchday"] == matchday]
    return [xg_from_odds_row(row, model_cfg, team_points) for _, row in rows.iterrows()]
