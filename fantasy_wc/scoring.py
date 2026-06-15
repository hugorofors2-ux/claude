"""Omvandlar en spelares förväntade händelser till förväntade poäng (xP).

Allt räknas som väntevärden – analogt med xG men för fantasypoäng.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class ExpectedEvents:
    position: str
    p_play: float = 0.0       # P(spelar alls)
    p_play_60: float = 0.0    # P(spelar 60+ min)
    xg: float = 0.0           # förväntade mål
    xg_outside: float = 0.0   # förväntade mål utanför straffområdet
    xa: float = 0.0           # förväntade assist
    p_clean_sheet: float = 0.0  # P(clean sheet | 60+ min)
    x_saves: float = 0.0      # förväntade räddningar (MV)
    x_yellow: float = 0.0     # förväntade gula kort
    x_red: float = 0.0        # förväntade röda kort
    x_own_goal: float = 0.0
    x_conceded: float = 0.0   # förväntade insläppta mål (lag)
    p_potm: float = 0.0       # P(player of the match)
    ownership: float = 0.10
    components: dict = field(default_factory=dict)


def expected_points(ev: ExpectedEvents, scoring: dict) -> float:
    """Beräkna xP för en spelare (exklusive kaptensmultiplikator)."""
    pos = ev.position
    c: dict[str, float] = {}

    # Speltid: P(1-59 min) ger "played", P(60+) ger "played_60".
    p_short = max(ev.p_play - ev.p_play_60, 0.0)
    c["appearance"] = p_short * scoring["appearance"]["played"] + ev.p_play_60 * scoring["appearance"]["played_60"]

    c["goals"] = ev.xg * scoring["goals"][pos]
    c["outside_box"] = ev.xg_outside * scoring["outside_box_bonus"]
    c["assist"] = ev.xa * scoring["assist"]

    c["clean_sheet"] = ev.p_play_60 * ev.p_clean_sheet * scoring["clean_sheet"][pos]

    saves_per_point = scoring["saves_per_point"]
    c["saves"] = (ev.x_saves / saves_per_point) if saves_per_point else 0.0

    c["cards"] = ev.x_yellow * scoring["yellow_card"] + ev.x_red * scoring["red_card"]
    c["own_goal"] = ev.x_own_goal * scoring["own_goal"]

    gc = scoring["goals_conceded"]
    if pos in gc["positions"]:
        c["conceded"] = ev.p_play_60 * (ev.x_conceded / gc["per_goals"]) * gc["points"]
    else:
        c["conceded"] = 0.0

    c["potm"] = ev.p_potm * scoring["potm"]

    base = sum(c.values())
    c["scouting"] = _scouting_bonus(base, ev.ownership, scoring["scouting_bonus"])

    ev.components = c
    return base + c["scouting"]


def _scouting_bonus(base_xp: float, ownership: float, cfg: dict) -> float:
    """Väntevärde av scouting-bonusen för lågägda spelare.

    Bonusen utlöses om en spelare ägd av < tröskel returnerar >= points_threshold poäng.
    P(träff) approximeras med en logistisk funktion runt tröskeln (heuristik).
    """
    if ownership >= cfg["ownership_threshold"]:
        return 0.0
    k = cfg.get("steepness", 1.0)
    p_hit = 1.0 / (1.0 + math.exp(-k * (base_xp - cfg["points_threshold"])))
    return p_hit * cfg["bonus"]
