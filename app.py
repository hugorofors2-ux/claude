"""Interaktiv webb-dashboard för Fantasy FIFA VM 2026.

Kör med:  streamlit run app.py
Bygg ditt lag i gränssnittet och få xP, optimal startelva, kaptenstips och
transferförslag baserat på motstånd, matchdatum och förväntade poäng.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from fantasy_wc.config import load_scoring, load_settings
from fantasy_wc.engine import Engine
from fantasy_wc.io import load_all

st.set_page_config(page_title="Fantasy FIFA VM 2026", page_icon="⚽", layout="wide")


@st.cache_data
def get_bundle():
    return load_all(), load_scoring(), load_settings()


def make_engine() -> Engine:
    data, scoring, settings = get_bundle()
    return Engine(data=data, scoring=scoring, settings=settings)


def player_label(players: pd.DataFrame, pid) -> str:
    row = players.loc[pid]
    return f"{row['name']} · {row['team']} · {row['price']}m"


def main():
    eng = make_engine()
    players = eng.data["players"]
    rules = eng.settings["squad"]

    st.title("⚽ Fantasy FIFA VM 2026 – Expected Points")
    st.caption("Bygg ditt lag, välj matchdag och få byten, kapten och optimal elva baserat på xP.")

    # ---- Sidofält: matchdag --------------------------------------------
    matchdays = eng.available_matchdays()
    matchday = st.sidebar.selectbox("Matchdag", matchdays, index=0)

    fixtures_md = eng.data["fixtures"][eng.data["fixtures"]["matchday"] == matchday]
    st.sidebar.markdown("**Matcher denna dag**")
    st.sidebar.dataframe(
        fixtures_md[["date", "home", "away"]].reset_index(drop=True),
        hide_index=True,
        width="stretch",
    )

    # ---- Lagbygge -------------------------------------------------------
    st.subheader("1. Bygg ditt lag")
    st.write(
        f"Välj {rules['positions']['GK']} MV, {rules['positions']['DEF']} FÖR, "
        f"{rules['positions']['MID']} MF och {rules['positions']['FWD']} ANF "
        f"(budget {rules['budget']}m)."
    )

    default_squad = list(eng.data["squad"]["id"])
    pos_labels = {"GK": "Målvakter", "DEF": "Försvarare", "MID": "Mittfältare", "FWD": "Anfallare"}
    selected: list = []
    cols = st.columns(4)
    for col, (pos, label) in zip(cols, pos_labels.items()):
        with col:
            pool = players[players["position"] == pos]
            options = list(pool["id"])
            defaults = [pid for pid in default_squad if pid in options]
            picked = st.multiselect(
                f"{label} ({rules['positions'][pos]})",
                options=options,
                default=defaults,
                max_selections=rules["positions"][pos],
                format_func=lambda pid: player_label(players, pid),
                key=f"sel_{pos}",
            )
            selected += picked

    check = eng.validate_squad(selected)
    c1, c2 = st.columns(2)
    c1.metric("Spenderat", f"{check['spent']}m")
    c2.metric("Bank", f"{check['bank']}m")

    if not check["ok"]:
        for err in check["errors"]:
            st.warning(err)
        st.info("Komplettera laget enligt reglerna ovan för att se analysen.")
        return

    squad_ids = selected
    st.success("Giltigt lag! Nedan visas analysen för vald matchdag.")

    # ---- Analys ---------------------------------------------------------
    st.subheader(f"2. Analys – matchdag {matchday}")
    tab_xp, tab_xi, tab_tr = st.tabs(["📊 Expected points", "🧮 Startelva & kapten", "🔁 Transfers"])

    squad_players = players.loc[players["id"].isin(squad_ids)]
    table = eng.xp_table(matchday, squad_players)
    show_cols = ["name", "team", "position", "opponent", "venue", "date", "price", "ownership", "xp"]

    with tab_xp:
        detail = st.checkbox("Visa poängkomponenter")
        cols_to_show = show_cols + ([c for c in table.columns if c.startswith("c_")] if detail else [])
        st.dataframe(table[cols_to_show], hide_index=True, width="stretch")

    with tab_xi:
        best = eng.best_xi(matchday, squad_ids)
        pick = eng.captain_pick(matchday, squad_ids)
        total_with_cap = eng.squad_score(matchday, squad_ids)
        m1, m2, m3 = st.columns(3)
        m1.metric("Formation", best["formation"])
        m2.metric("xP startelva", best["total_xp"])
        m3.metric("xP med kapten", round(total_with_cap, 2))

        cap, vice = pick["captain"], pick["vice"]
        st.markdown(
            f"**Kapten:** {cap['name']} ({cap['team']}) – xP {cap['xp']} → med x2: "
            f"**{round(cap['xp'] * eng.scoring['captain_multiplier'], 2)}**  \n"
            + (f"**Vicekapten:** {vice['name']} ({vice['team']}) – xP {vice['xp']}" if vice else "")
        )

        xi_df = pd.DataFrame(best["xi"])[["name", "team", "position", "opponent", "xp"]]
        st.markdown("**Startelva**")
        st.dataframe(xi_df, hide_index=True, width="stretch")
        if best["bench"]:
            st.markdown("**Bänk**")
            st.dataframe(
                pd.DataFrame(best["bench"])[["name", "team", "position", "xp"]],
                hide_index=True,
                width="stretch",
            )

    with tab_tr:
        top_n = st.slider("Antal förslag", 3, 15, 5)
        sugg = eng.suggest_transfers(matchday, top_n=top_n, squad_ids=squad_ids)
        if not sugg:
            st.info("Inga lönsamma byten hittades inom budget.")
        else:
            df = pd.DataFrame(sugg)[["out", "in", "position", "price_change", "xp_gain"]]
            st.dataframe(df, hide_index=True, width="stretch")
            st.caption(
                "xp_gain = förändring i truppens totala xP (inkl. kaptensbonus) för matchdagen, "
                "med hänsyn till budget och positionsregler."
            )

    # ---- Spara laget ----------------------------------------------------
    squad_csv = players.loc[squad_ids, ["id", "name"]].reset_index(drop=True)
    squad_csv["captain"] = (squad_csv["id"] == pick["captain"]["id"]).astype(int)
    squad_csv["vice"] = (squad_csv["id"] == (pick["vice"]["id"] if pick["vice"] else -1)).astype(int)
    st.download_button(
        "💾 Ladda ner laget som my_squad.csv",
        squad_csv.to_csv(index=False).encode("utf-8"),
        file_name="my_squad.csv",
        mime="text/csv",
    )


if __name__ == "__main__":
    main()
