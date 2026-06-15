"""Generera data/players.csv och data/teams.csv från officiell FIFA-fantasydata.

Hämtar det officiella FIFA World Cup 2026 Fantasy-datasetet (position, pris,
ägarandel, startsannolikhet, poäng) och härleder modellinputs (goal_share,
assist_share, lagstyrka). Kör:

    python scripts/build_data.py

Kräver nätverksåtkomst till raw.githubusercontent.com.
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pandas as pd
import requests

BASE = "https://raw.githubusercontent.com/jlbgouveia/fifa-wc2026-fantasy-analytics/main"
SOURCE_URL = f"{BASE}/wc2026_players.csv"
ROUNDS_URL = f"{BASE}/fifa_fantasy_rounds.json"  # officiella fantasy-omgångar (matchdagar)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

START_MAP = {"Likely Starter": 0.90, "Maybe Starter": 0.45, "Unlikely Starter": 0.12}
POS_GOAL_PRIOR = {"FWD": 0.45, "MID": 0.20, "DEF": 0.06, "GK": 0.0}
POS_AST_PRIOR = {"FWD": 0.12, "MID": 0.18, "DEF": 0.06, "GK": 0.0}


def load_source() -> pd.DataFrame:
    resp = requests.get(SOURCE_URL, timeout=30)
    resp.raise_for_status()
    return pd.read_csv(io.StringIO(resp.text))


def _rate(num, den, positions, prior) -> np.ndarray:
    return np.array([n / d if d >= 5 else prior[p] for n, d, p in zip(num, den, positions)])


def build_players(src: pd.DataFrame) -> pd.DataFrame:
    for c in ["club_goals_4y", "club_assists_4y", "club_games_4y",
              "nt_goals_4y", "nt_assists_4y", "nt_games_4y"]:
        src[c] = pd.to_numeric(src[c], errors="coerce").fillna(0.0)

    games = src["club_games_4y"] + src["nt_games_4y"]
    goals = src["club_goals_4y"] + src["nt_goals_4y"]
    assist = src["club_assists_4y"] + src["nt_assists_4y"]
    pos = src["fantasy_position"]

    players = pd.DataFrame({
        "id": src["player_id"],
        "name": src["display_name"],
        "team": src["country"],
        "position": pos,
        "price": src["fantasy_price"].round(1),
        "start_prob": src["starting_likelihood"].map(START_MAP).fillna(0.12),
        "_g": _rate(goals, games, pos, POS_GOAL_PRIOR),
        "_a": _rate(assist, games, pos, POS_AST_PRIOR),
        "saves_p90": np.where(pos == "GK", 3.0, 0.0),
        "yellow_p90": np.where(pos == "GK", 0.08, 0.15),
        "ownership": (pd.to_numeric(src["percent_selected"], errors="coerce").fillna(0) / 100).round(4),
        "pen_taker": 0,
        "avg_points": pd.to_numeric(src["avg_points"], errors="coerce").fillna(0),
        "total_points": pd.to_numeric(src["total_points"], errors="coerce").fillna(0),
    })
    players["goal_share"] = players.groupby("team")["_g"].transform(
        lambda s: s / s.sum() if s.sum() else 0).round(4)
    players["assist_share"] = players.groupby("team")["_a"].transform(
        lambda s: s / s.sum() if s.sum() else 0).round(4)
    cols = ["id", "name", "team", "position", "price", "start_prob", "goal_share",
            "assist_share", "saves_p90", "yellow_p90", "ownership", "pen_taker",
            "avg_points", "total_points"]
    return players[cols]


def build_teams(src: pd.DataFrame, players: pd.DataFrame) -> pd.DataFrame:
    strength = players.groupby("team")["price"].apply(lambda g: g.nlargest(11).mean())
    groups = src.drop_duplicates("country").set_index("country")["group"]
    ranks = strength.sort_values(ascending=False)
    return pd.DataFrame({
        "team": ranks.index,
        "group": [groups[t] for t in ranks.index],
        "fifa_rank": range(1, len(ranks) + 1),
        "ranking_points": [round(1300 + (v - 4) * 120) for v in ranks.values],
    })


def build_fixtures() -> pd.DataFrame:
    """Riktigt VM-schema från officiella FIFA Fantasy-omgångar (matchdag = round id)."""
    resp = requests.get(ROUNDS_URL, timeout=30)
    resp.raise_for_status()
    rounds = resp.json()
    rows = []
    for r in rounds:
        for t in r["tournaments"]:
            rows.append({
                "matchday": r["id"],
                "date": t["date"][:10],
                "home": t["homeSquadName"],
                "away": t["awaySquadName"],
            })
    return pd.DataFrame(rows).sort_values(["matchday", "date", "home"]).reset_index(drop=True)


def main() -> None:
    src = load_source()
    players = build_players(src)
    teams = build_teams(src, players)
    players.to_csv(DATA_DIR / "players.csv", index=False)
    teams.to_csv(DATA_DIR / "teams.csv", index=False)

    fixtures = build_fixtures()
    fixtures.to_csv(DATA_DIR / "fixtures.csv", index=False)
    # odds-mall: en rad per match med tomma odds (fylls vid behov; annars ranking-fallback)
    odds = fixtures[["matchday", "home", "away"]].copy()
    for col in ["home_odds", "draw_odds", "away_odds", "total_line", "home_xg", "away_xg"]:
        odds[col] = ""
    if not (DATA_DIR / "odds.csv").exists():
        odds.to_csv(DATA_DIR / "odds.csv", index=False)
        odds_note = "skrev ny odds.csv-mall"
    else:
        odds_note = "behöll befintlig odds.csv"

    print(f"Skrev {len(players)} spelare, {len(teams)} lag, {len(fixtures)} matcher "
          f"till {DATA_DIR} ({odds_note}).")


if __name__ == "__main__":
    main()
