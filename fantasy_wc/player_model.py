"""Bygger förväntade händelser per spelare från lag-xG och spelarandelar."""

from __future__ import annotations

from .odds_model import MatchXG, clean_sheet_prob
from .scoring import ExpectedEvents


def build_events(player, match: MatchXG, model_cfg: dict) -> ExpectedEvents:
    """Skapa ExpectedEvents för en spelare i en given match.

    player: rad från players-DataFrame (Series-liknande, indexerbar med kolumnnamn).
    match: MatchXG för spelarens lag denna matchdag.
    """
    team = player["team"]
    team_xg = match.team_xg(team)
    opp_xg = match.opponent_xg(team)
    pos = player["position"]

    start_prob = float(player["start_prob"])
    sub_prob = model_cfg["sub_appearance_prob"]
    p_play_60 = start_prob
    p_play = min(1.0, start_prob + (1.0 - start_prob) * sub_prob)

    goal_share = float(player["goal_share"])
    assist_share = float(player["assist_share"])

    xg = team_xg * goal_share * p_play
    outside_frac = float(player.get("outside_box_frac", model_cfg["outside_box_frac_default"]))
    xg_outside = xg * outside_frac
    xa = team_xg * assist_share * p_play

    p_cs = clean_sheet_prob(opp_xg)

    # Räddningar skalas med motståndarens xG mot ligasnittet.
    saves_p90 = float(player["saves_p90"])
    x_saves = saves_p90 * (opp_xg / model_cfg["avg_team_xg"]) * p_play_60 if saves_p90 else 0.0

    x_yellow = float(player["yellow_p90"]) * p_play

    # POTM-heuristik: proportionell mot offensivt bidrag, kapad.
    p_potm = min(model_cfg["potm_cap"], model_cfg["potm_scale"] * (xg + xa))

    return ExpectedEvents(
        position=pos,
        p_play=p_play,
        p_play_60=p_play_60,
        xg=xg,
        xg_outside=xg_outside,
        xa=xa,
        p_clean_sheet=p_cs,
        x_saves=x_saves,
        x_yellow=x_yellow,
        x_red=0.0,
        x_own_goal=0.0,
        x_conceded=opp_xg,
        p_potm=p_potm,
        ownership=float(player["ownership"]),
    )
