"""Inläsning och validering av CSV-data."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import DATA_DIR

REQUIRED_COLUMNS = {
    "teams": ["team", "ranking_points"],
    "fixtures": ["matchday", "home", "away"],
    "odds": ["matchday", "home", "away"],
    "players": ["id", "name", "team", "position", "price", "start_prob"],
    "my_squad": ["id"],
}

# Spelarkolumner med standardvärden om de saknas i CSV.
PLAYER_DEFAULTS = {
    "goal_share": 0.0,
    "assist_share": 0.0,
    "saves_p90": 0.0,
    "yellow_p90": 0.15,
    "ownership": 0.10,
    "pen_taker": 0,
}

VALID_POSITIONS = {"GK", "DEF", "MID", "FWD"}


def _read_csv(name: str, data_dir: Path) -> pd.DataFrame:
    path = data_dir / f"{name}.csv"
    if not path.exists():
        raise FileNotFoundError(f"Saknar datafil: {path}")
    df = pd.read_csv(path)
    missing = [c for c in REQUIRED_COLUMNS[name] if c not in df.columns]
    if missing:
        raise ValueError(f"{path} saknar kolumner: {missing}")
    return df


def load_all(data_dir: Path = DATA_DIR) -> dict[str, pd.DataFrame]:
    """Läs alla datafiler, validera och fyll i standardvärden."""
    teams = _read_csv("teams", data_dir)
    fixtures = _read_csv("fixtures", data_dir)
    odds = _read_csv("odds", data_dir)
    players = _read_csv("players", data_dir)
    squad = _read_csv("my_squad", data_dir)

    bad_pos = set(players["position"]) - VALID_POSITIONS
    if bad_pos:
        raise ValueError(f"Ogiltiga positioner i players.csv: {bad_pos}")

    for col, default in PLAYER_DEFAULTS.items():
        if col not in players.columns:
            players[col] = default
        else:
            players[col] = players[col].fillna(default)

    players["pen_taker"] = players["pen_taker"].astype(int)
    players = players.set_index("id", drop=False)

    # Behåll bara id + ev. kapten/vice-flaggor från truppen.
    for col in ("captain", "vice"):
        if col not in squad.columns:
            squad[col] = 0
        squad[col] = squad[col].fillna(0).astype(int)

    return {
        "teams": teams,
        "fixtures": fixtures,
        "odds": odds,
        "players": players,
        "squad": squad,
    }
