"""Orkestrering: räkna xP-tabell, optimal startelva, kapten och transfers."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import odds_model
from .player_model import build_events
from .scoring import expected_points


@dataclass
class Engine:
    data: dict
    scoring: dict
    settings: dict

    # ---- xP per spelare -------------------------------------------------
    def match_context(self, matchday: int) -> dict[str, odds_model.MatchXG]:
        """Mappa lag -> MatchXG för matchdagen."""
        team_points = dict(zip(self.data["teams"]["team"], self.data["teams"]["ranking_points"]))
        matches = odds_model.build_match_xg(
            self.data["odds"], matchday, self.settings["model"], team_points
        )
        ctx: dict[str, odds_model.MatchXG] = {}
        for m in matches:
            ctx[m.home] = m
            ctx[m.away] = m
        return ctx

    def xp_table(self, matchday: int, players: pd.DataFrame | None = None) -> pd.DataFrame:
        """xP per spelare för matchdagen. Spelare utan match får xP=0."""
        if players is None:
            players = self.data["players"]
        ctx = self.match_context(matchday)
        model_cfg = self.settings["model"]

        rows = []
        for _, p in players.iterrows():
            match = ctx.get(p["team"])
            if match is None:
                xp, comps = 0.0, {}
            else:
                ev = build_events(p, match, model_cfg)
                xp = expected_points(ev, self.scoring)
                comps = ev.components
            rows.append(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "team": p["team"],
                    "position": p["position"],
                    "price": p["price"],
                    "ownership": p["ownership"],
                    "xp": round(xp, 2),
                    **{f"c_{k}": round(v, 2) for k, v in comps.items()},
                }
            )
        return pd.DataFrame(rows).sort_values("xp", ascending=False).reset_index(drop=True)

    # ---- Startelva & kapten ---------------------------------------------
    def best_xi(self, matchday: int, squad_ids: list | None = None) -> dict:
        """Välj giltig startelva med högst summa-xP ur truppen."""
        if squad_ids is None:
            squad_ids = list(self.data["squad"]["id"])
        squad_players = self.data["players"].loc[self.data["players"]["id"].isin(squad_ids)]
        table = self.xp_table(matchday, squad_players)

        by_pos = {pos: table[table["position"] == pos].to_dict("records") for pos in ("GK", "DEF", "MID", "FWD")}
        for recs in by_pos.values():
            recs.sort(key=lambda r: r["xp"], reverse=True)

        form = self.settings["formation"]
        best = None
        for d in range(form["DEF"][0], form["DEF"][1] + 1):
            for m in range(form["MID"][0], form["MID"][1] + 1):
                for f in range(form["FWD"][0], form["FWD"][1] + 1):
                    if 1 + d + m + f != form["size"]:
                        continue
                    if len(by_pos["GK"]) < 1 or len(by_pos["DEF"]) < d or len(by_pos["MID"]) < m or len(by_pos["FWD"]) < f:
                        continue
                    xi = by_pos["GK"][:1] + by_pos["DEF"][:d] + by_pos["MID"][:m] + by_pos["FWD"][:f]
                    total = sum(r["xp"] for r in xi)
                    if best is None or total > best["total_xp"]:
                        best = {
                            "formation": f"{d}-{m}-{f}",
                            "total_xp": round(total, 2),
                            "xi": xi,
                            "bench": [r for r in table.to_dict("records") if r not in xi],
                        }
        return best

    def captain_pick(self, matchday: int, squad_ids: list | None = None) -> dict:
        """Kapten = högst xP i startelvan, vice = näst högst."""
        xi = self.best_xi(matchday, squad_ids)["xi"]
        ranked = sorted(xi, key=lambda r: r["xp"], reverse=True)
        mult = self.scoring["captain_multiplier"]
        return {
            "captain": ranked[0],
            "vice": ranked[1] if len(ranked) > 1 else None,
            "captain_bonus_xp": round(ranked[0]["xp"] * (mult - 1), 2),
        }

    def squad_score(self, matchday: int, squad_ids: list) -> float:
        """Total xP för truppen: bästa XI + kaptensbonus."""
        best = self.best_xi(matchday, squad_ids)
        if not best["xi"]:
            return 0.0
        cap_xp = max(r["xp"] for r in best["xi"])
        return best["total_xp"] + cap_xp * (self.scoring["captain_multiplier"] - 1)

    # ---- Transfers -------------------------------------------------------
    def bank(self, squad_ids: list | None = None) -> float:
        if squad_ids is None:
            squad_ids = list(self.data["squad"]["id"])
        owned = self.data["players"].loc[self.data["players"]["id"].isin(squad_ids)]
        return round(self.settings["squad"]["budget"] - owned["price"].sum(), 2)

    def suggest_transfers(self, matchday: int, top_n: int = 5) -> list[dict]:
        """Förslag på enskilda byten (ut->in) rankade på xP-vinst.

        Respekterar positionsregler (samma position), budget och poängavdrag
        för byten utöver gratiskvoten.
        """
        squad_ids = list(self.data["squad"]["id"])
        players = self.data["players"]
        owned = players.loc[players["id"].isin(squad_ids)]
        bank = self.bank(squad_ids)
        base_score = self.squad_score(matchday, squad_ids)
        free = self.settings["transfers"]["free_per_matchday"]
        hit = self.settings["transfers"]["extra_transfer_cost"]
        cost = 0 if free >= 1 else hit  # ett byte är gratis om free>=1

        candidates = players.loc[~players["id"].isin(squad_ids)]
        suggestions = []
        for _, out_p in owned.iterrows():
            pool = candidates[candidates["position"] == out_p["position"]]
            for _, in_p in pool.iterrows():
                if in_p["price"] > out_p["price"] + bank:
                    continue
                new_ids = [i for i in squad_ids if i != out_p["id"]] + [in_p["id"]]
                delta = self.squad_score(matchday, new_ids) - base_score - cost
                suggestions.append(
                    {
                        "out": out_p["name"],
                        "out_id": out_p["id"],
                        "in": in_p["name"],
                        "in_id": in_p["id"],
                        "position": out_p["position"],
                        "price_change": round(in_p["price"] - out_p["price"], 1),
                        "xp_gain": round(delta, 2),
                    }
                )
        suggestions.sort(key=lambda s: s["xp_gain"], reverse=True)
        return suggestions[:top_n]
