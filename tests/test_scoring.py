import math

import pytest

from fantasy_wc.scoring import ExpectedEvents, expected_points

SCORING = {
    "appearance": {"played": 1, "played_60": 2},
    "goals": {"GK": 6, "DEF": 6, "MID": 5, "FWD": 4},
    "outside_box_bonus": 1,
    "assist": 3,
    "clean_sheet": {"GK": 4, "DEF": 4, "MID": 1, "FWD": 0},
    "saves_per_point": 3,
    "penalty_save": 5,
    "penalty_miss": -2,
    "yellow_card": -1,
    "red_card": -3,
    "own_goal": -2,
    "goals_conceded": {"per_goals": 2, "points": -1, "positions": ["GK", "DEF"]},
    "potm": 3,
    "captain_multiplier": 2,
    "scouting_bonus": {"ownership_threshold": 0.05, "points_threshold": 4, "bonus": 2, "steepness": 1.0},
}


def test_midfielder_known_line():
    ev = ExpectedEvents(
        position="MID", p_play=1.0, p_play_60=1.0, xg=0.5, xa=0.4,
        p_clean_sheet=0.5, x_yellow=0.2, x_conceded=1.0, p_potm=0.1, ownership=0.5,
    )
    xp = expected_points(ev, SCORING)
    # 2.0 + 2.5 + 1.2 + 0.5 - 0.2 + 0.3 = 6.3
    assert math.isclose(xp, 6.3, rel_tol=1e-9)
    assert ev.components["scouting"] == 0.0
    assert ev.components["conceded"] == 0.0  # MID drabbas inte


def test_defender_conceded_penalty():
    ev = ExpectedEvents(position="DEF", p_play=1.0, p_play_60=1.0, x_conceded=2.0, ownership=0.5)
    expected_points(ev, SCORING)
    # 2.0/2 * -1 * p_play_60(1.0) = -1.0
    assert math.isclose(ev.components["conceded"], -1.0, rel_tol=1e-9)


def test_goalkeeper_saves():
    ev = ExpectedEvents(position="GK", p_play=1.0, p_play_60=1.0, x_saves=3.0, ownership=0.5)
    expected_points(ev, SCORING)
    assert math.isclose(ev.components["saves"], 1.0, rel_tol=1e-9)


def test_scouting_bonus_for_low_ownership():
    high = ExpectedEvents(position="FWD", p_play=1.0, p_play_60=1.0, xg=1.2, ownership=0.02)
    low = ExpectedEvents(position="FWD", p_play=1.0, p_play_60=1.0, xg=1.2, ownership=0.50)
    xp_high = expected_points(high, SCORING)
    xp_low = expected_points(low, SCORING)
    assert high.components["scouting"] > 0
    assert low.components["scouting"] == 0
    assert xp_high > xp_low


def test_captain_multiplier_present():
    assert SCORING["captain_multiplier"] == 2
