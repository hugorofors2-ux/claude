import pytest

from fantasy_wc.config import load_scoring, load_settings
from fantasy_wc.engine import Engine
from fantasy_wc.io import load_all


@pytest.fixture
def engine():
    return Engine(data=load_all(), scoring=load_scoring(), settings=load_settings())


def test_xp_table_sorted_and_positive(engine):
    table = engine.xp_table(1)
    assert len(table) == len(engine.data["players"])
    # Sorterad fallande på xP.
    assert list(table["xp"]) == sorted(table["xp"], reverse=True)
    # Spelare med match har positiv xP.
    assert table["xp"].max() > 0


def test_best_xi_is_valid(engine):
    best = engine.best_xi(1)
    xi = best["xi"]
    assert len(xi) == engine.settings["formation"]["size"]
    counts = {pos: sum(1 for r in xi if r["position"] == pos) for pos in ("GK", "DEF", "MID", "FWD")}
    assert counts["GK"] == 1
    form = engine.settings["formation"]
    for pos in ("DEF", "MID", "FWD"):
        assert form[pos][0] <= counts[pos] <= form[pos][1]
    # XI är de högst rankade per vald formation -> totalsumman matchar.
    assert abs(sum(r["xp"] for r in xi) - best["total_xp"]) < 1e-6


def test_captain_is_highest_xp_in_xi(engine):
    pick = engine.captain_pick(1)
    xi = engine.best_xi(1)["xi"]
    assert pick["captain"]["xp"] == max(r["xp"] for r in xi)


def test_transfers_sorted_and_within_budget(engine):
    sugg = engine.suggest_transfers(1, top_n=5)
    gains = [s["xp_gain"] for s in sugg]
    assert gains == sorted(gains, reverse=True)
    bank = engine.bank()
    owned = engine.data["players"].set_index("id")
    for s in sugg:
        # In-pris får inte överstiga ut-pris + bank.
        assert owned.loc[s["in_id"], "price"] <= owned.loc[s["out_id"], "price"] + bank + 1e-9
        assert s["position"] == owned.loc[s["in_id"], "position"]


def test_bank_non_negative(engine):
    assert engine.bank() >= 0
