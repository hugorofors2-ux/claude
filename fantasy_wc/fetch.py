"""Valfri auto-hämtning av odds (blandad strategi).

Försöker hämta VM-odds via The Odds API om miljövariabeln ODDS_API_KEY är satt och
nätverket tillåter det. Vid fel faller vi tillbaka på manuell CSV-inmatning och
skriver ut tydliga instruktioner. Allt skrivs till samma format som data/odds.csv.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import requests

from .config import DATA_DIR

ODDS_API_URL = "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds"


def fetch_odds(data_dir: Path = DATA_DIR, timeout: int = 15) -> bool:
    """Försök hämta odds. Returnerar True om något skrevs, annars False."""
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        _manual_hint(data_dir)
        return False

    try:
        resp = requests.get(
            ODDS_API_URL,
            params={
                "apiKey": api_key,
                "regions": "eu",
                "markets": "h2h,totals",
                "oddsFormat": "decimal",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        events = resp.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"Kunde inte hämta odds ({exc}). Faller tillbaka på manuell inmatning.")
        _manual_hint(data_dir)
        return False

    rows = [r for r in (_parse_event(e) for e in events) if r is not None]
    if not rows:
        print("Inga matcher returnerades från odds-API:t.")
        _manual_hint(data_dir)
        return False

    out = data_dir / "odds_fetched.csv"
    pd.DataFrame(rows).to_csv(out, index=False)
    print(f"Skrev {len(rows)} matcher till {out}.")
    print("Granska, fyll i 'matchday' och kopiera in i data/odds.csv.")
    return True


def _parse_event(event: dict) -> dict | None:
    home, away = event.get("home_team"), event.get("away_team")
    if not home or not away:
        return None
    h = d = a = total = None
    for bm in event.get("bookmakers", []):
        for market in bm.get("markets", []):
            if market["key"] == "h2h":
                for o in market["outcomes"]:
                    if o["name"] == home:
                        h = o["price"]
                    elif o["name"] == away:
                        a = o["price"]
                    else:
                        d = o["price"]
            elif market["key"] == "totals":
                outs = market["outcomes"]
                if outs:
                    total = outs[0].get("point")
        if h and d and a:
            break
    return {
        "matchday": "",
        "home": home,
        "away": away,
        "home_odds": h,
        "draw_odds": d,
        "away_odds": a,
        "total_line": total,
        "home_xg": "",
        "away_xg": "",
    }


def _manual_hint(data_dir: Path) -> None:
    print(
        "Manuell inmatning: fyll i odds i "
        f"{data_dir / 'odds.csv'} (kolumner: matchday,home,away,home_odds,"
        "draw_odds,away_odds,total_line,home_xg,away_xg).\n"
        "Tips: lämna home_xg/away_xg tomma så härleds de från odds. "
        "Sätt ODDS_API_KEY för auto-hämtning."
    )
