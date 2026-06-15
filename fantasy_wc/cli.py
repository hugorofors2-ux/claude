"""Terminalgränssnitt för Fantasy FIFA VM-modellen."""

from __future__ import annotations

import argparse

import pandas as pd

from . import fetch
from .config import load_scoring, load_settings
from .engine import Engine
from .io import load_all

pd.set_option("display.width", 120)
pd.set_option("display.max_columns", 20)


def _engine() -> Engine:
    return Engine(data=load_all(), scoring=load_scoring(), settings=load_settings())


def cmd_xp(args):
    eng = _engine()
    table = eng.xp_table(args.matchday)
    cols = ["name", "team", "position", "price", "ownership", "xp"]
    if args.detail:
        cols += [c for c in table.columns if c.startswith("c_")]
    print(f"\nExpected points – matchdag {args.matchday}\n")
    print(table[cols].head(args.top).to_string(index=False))


def cmd_lineup(args):
    eng = _engine()
    best = eng.best_xi(args.matchday)
    print(f"\nOptimal startelva – matchdag {args.matchday}  (formation {best['formation']})")
    print(f"Summa xP (utan kapten): {best['total_xp']}\n")
    print(pd.DataFrame(best["xi"])[["name", "team", "position", "xp"]].to_string(index=False))
    print("\nBänk:")
    bench = pd.DataFrame(best["bench"])
    if not bench.empty:
        print(bench[["name", "team", "position", "xp"]].to_string(index=False))


def cmd_captain(args):
    eng = _engine()
    pick = eng.captain_pick(args.matchday)
    cap, vice = pick["captain"], pick["vice"]
    print(f"\nKaptenstips – matchdag {args.matchday}")
    print(f"  Kapten:      {cap['name']} ({cap['team']})  xP {cap['xp']}  -> med x2: {round(cap['xp'] * 2, 2)}")
    if vice:
        print(f"  Vicekapten:  {vice['name']} ({vice['team']})  xP {vice['xp']}")
    print(f"  Extra xP från kaptensvalet: +{pick['captain_bonus_xp']}")


def cmd_transfers(args):
    eng = _engine()
    print(f"\nBank: {eng.bank()}m   Trupp-xP (med kapten) matchdag {args.matchday}: "
          f"{round(eng.squad_score(args.matchday, list(eng.data['squad']['id'])), 2)}")
    sugg = eng.suggest_transfers(args.matchday, top_n=args.top)
    if not sugg:
        print("Inga lönsamma byten hittades inom budget.")
        return
    print(f"\nTopp {len(sugg)} transferförslag (matchdag {args.matchday}):\n")
    df = pd.DataFrame(sugg)[["out", "in", "position", "price_change", "xp_gain"]]
    print(df.to_string(index=False))
    if eng.settings["transfers"]["free_per_matchday"] < 1:
        print(f"\n(Inkluderar -{eng.settings['transfers']['extra_transfer_cost']}p avdrag per byte.)")


def cmd_fetch(args):
    fetch.fetch_odds()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="fantasy_wc", description="Fantasy FIFA VM 2026 – expected points")
    sub = p.add_subparsers(dest="command", required=True)

    def add_md(sp):
        sp.add_argument("--matchday", type=int, required=True, help="Matchdagens nummer")

    sp = sub.add_parser("xp", help="Expected points per spelare")
    add_md(sp)
    sp.add_argument("--top", type=int, default=20)
    sp.add_argument("--detail", action="store_true", help="Visa poängkomponenter")
    sp.set_defaults(func=cmd_xp)

    sp = sub.add_parser("lineup", help="Optimal startelva ur truppen")
    add_md(sp)
    sp.set_defaults(func=cmd_lineup)

    sp = sub.add_parser("captain", help="Kaptenstips")
    add_md(sp)
    sp.set_defaults(func=cmd_captain)

    sp = sub.add_parser("transfers", help="Transferförslag")
    add_md(sp)
    sp.add_argument("--top", type=int, default=5)
    sp.set_defaults(func=cmd_transfers)

    sp = sub.add_parser("fetch", help="Försök hämta odds (annars manuell inmatning)")
    sp.set_defaults(func=cmd_fetch)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
