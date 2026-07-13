"""Budget & utgiftsanalys – ladda upp kontoutdrag, kategorisera och följ upp budget.

Kör med:  streamlit run budget_app.py
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from budget.analytics import (
    budget_vs_actual,
    find_deviations,
    month_over_month_change,
    monthly_category_summary,
    trend,
)
from budget.categories import DEFAULT_CATEGORIES, UNCATEGORIZED
from budget.categorizer import categorize_transactions, merge_rules
from budget.parser import guess_column, normalize, read_statement
from budget.storage import (
    load_budgets,
    load_custom_rules,
    load_overrides,
    load_transactions,
    merge_new_transactions,
    save_budgets,
    save_custom_rules,
    save_overrides,
    save_transactions,
)

st.set_page_config(page_title="Budget & utgiftsanalys", page_icon="💰", layout="wide")


def get_rules() -> dict[str, list[str]]:
    return merge_rules(st.session_state.get("custom_rules") or load_custom_rules())


def init_state() -> None:
    if "transactions" not in st.session_state:
        st.session_state.transactions = load_transactions()
    if "budgets" not in st.session_state:
        st.session_state.budgets = load_budgets()
    if "overrides" not in st.session_state:
        st.session_state.overrides = load_overrides()
    if "custom_rules" not in st.session_state:
        st.session_state.custom_rules = load_custom_rules()


def upload_tab() -> None:
    st.subheader("1. Ladda upp kontoutdrag")
    st.caption(
        "CSV eller Excel från din bank. Kolumner för datum, beskrivning och belopp "
        "identifieras automatiskt – annars väljer du dem manuellt nedan."
    )
    uploaded = st.file_uploader("Kontoutdrag", type=["csv", "xlsx", "xls"])
    if not uploaded:
        return

    try:
        raw = read_statement(uploaded)
    except Exception as exc:
        st.error(f"Kunde inte läsa filen: {exc}")
        return

    with st.expander("Kolumnmappning (justera om något ser fel ut)"):
        cols = list(raw.columns)
        date_guess = guess_column(cols, ["bokföringsdag", "transaktionsdag", "datum", "date"])
        desc_guess = guess_column(cols, ["beskrivning", "text", "meddelande", "description"])
        amount_guess = guess_column(cols, ["belopp", "amount", "summa"])
        c1, c2, c3 = st.columns(3)
        date_col = c1.selectbox("Datumkolumn", cols, index=cols.index(date_guess) if date_guess in cols else 0)
        desc_col = c2.selectbox("Beskrivningskolumn", cols, index=cols.index(desc_guess) if desc_guess in cols else 0)
        amount_col = c3.selectbox("Beloppskolumn", cols, index=cols.index(amount_guess) if amount_guess in cols else 0)

    try:
        parsed = normalize(raw, date_col=date_col, desc_col=desc_col, amount_col=amount_col)
    except Exception as exc:
        st.error(f"Kunde inte tolka filen: {exc}")
        return

    if parsed.empty:
        st.warning("Hittade inga giltiga transaktionsrader i filen.")
        return

    categorized = categorize_transactions(parsed, get_rules(), st.session_state.overrides)
    st.success(f"Läste in {len(categorized)} transaktioner. Kontrollera kategoriseringen nedan innan du sparar.")

    st.subheader("2. Kontrollera & rätta kategorier")
    edited = st.data_editor(
        categorized,
        column_config={
            "category": st.column_config.SelectboxColumn("category", options=DEFAULT_CATEGORIES),
            "amount": st.column_config.NumberColumn("amount", format="%.2f"),
        },
        hide_index=True,
        width="stretch",
        key="editor",
    )

    if st.button("💾 Spara till historik", type="primary"):
        new_overrides = dict(st.session_state.overrides)
        for _, row in edited.iterrows():
            new_overrides[row["description"]] = row["category"]
        st.session_state.overrides = new_overrides
        save_overrides(new_overrides)

        combined = merge_new_transactions(st.session_state.transactions, edited)
        st.session_state.transactions = combined
        save_transactions(combined)
        st.success(f"Sparat! Historiken innehåller nu {len(combined)} transaktioner totalt.")


def budget_tab() -> None:
    st.subheader("Sätt din budget, månad för månad")
    transactions = st.session_state.transactions
    months_with_data = (
        sorted(pd.to_datetime(transactions["date"]).dt.to_period("M").astype(str).unique())
        if not transactions.empty
        else []
    )
    default_month = pd.Timestamp.today().to_period("M").strftime("%Y-%m")
    all_months = sorted(set(months_with_data) | set(st.session_state.budgets) | {default_month})
    month = st.selectbox("Månad", all_months, index=all_months.index(default_month))

    prev_months = [m for m in all_months if m < month]
    copy_from = prev_months[-1] if prev_months else None

    if copy_from and st.button(f"Kopiera budget från {copy_from}"):
        st.session_state.budgets[month] = dict(st.session_state.budgets.get(copy_from, {}))

    current = st.session_state.budgets.get(month, {})
    st.caption("Ange en månadsbudget (kr) per kategori. 0 = ingen budget satt.")

    cols = st.columns(3)
    new_budget = {}
    for i, category in enumerate([c for c in DEFAULT_CATEGORIES if c != UNCATEGORIZED]):
        with cols[i % 3]:
            new_budget[category] = st.number_input(
                category, min_value=0.0, step=100.0, value=float(current.get(category, 0.0)), key=f"budget_{month}_{category}"
            )

    if st.button("💾 Spara budget", type="primary"):
        st.session_state.budgets[month] = new_budget
        save_budgets(st.session_state.budgets)
        st.success(f"Budget för {month} sparad.")


def followup_tab() -> None:
    st.subheader("Utfall, trender och avvikelser")
    transactions = st.session_state.transactions
    if transactions.empty:
        st.info("Ladda upp minst ett kontoutdrag för att se uppföljning.")
        return

    summary = monthly_category_summary(transactions)
    months = sorted(summary["month"].unique()) if not summary.empty else []
    if not months:
        st.info("Inga utgifter (negativa belopp) hittades i de sparade transaktionerna.")
        return

    month = st.selectbox("Visa utfall för månad", months, index=len(months) - 1)

    bva = budget_vs_actual(summary, st.session_state.budgets, month)
    st.markdown("### Budget vs. utfall")
    if bva.empty:
        st.info("Inga utgifter eller budgetar för den här månaden.")
    else:
        total_budget = bva["budget"].sum()
        total_actual = bva["actual"].sum()
        c1, c2, c3 = st.columns(3)
        c1.metric("Total budget", f"{total_budget:,.0f} kr".replace(",", " "))
        c2.metric("Totalt utfall", f"{total_actual:,.0f} kr".replace(",", " "), delta=f"{total_actual - total_budget:,.0f} kr")
        c3.metric("Andel förbrukad", f"{(total_actual / total_budget * 100) if total_budget else 0:.0f} %")

        st.bar_chart(bva.set_index("category")[["budget", "actual"]])
        st.dataframe(
            bva.style.format({"budget": "{:.0f}", "actual": "{:.0f}", "diff": "{:+.0f}", "pct_used": "{:.0f}%"}),
            hide_index=True,
            width="stretch",
        )

    st.markdown("### Avvikelser (>= 15% från budget)")
    deviations = find_deviations(bva, threshold_pct=15.0)
    if deviations.empty:
        st.success("Inga kategorier avviker markant från budgeten denna månad.")
    else:
        for _, row in deviations.iterrows():
            direction = "över" if row["diff"] > 0 else "under"
            st.warning(
                f"**{row['category']}**: {row['actual']:.0f} kr mot budget {row['budget']:.0f} kr "
                f"({abs(row['pct_diff']):.0f}% {direction} budget)"
            )

    st.markdown("### Trender över tid")
    trend_table = trend(summary)
    if not trend_table.empty:
        st.line_chart(trend_table)
        st.caption("Totalt per månad, per kategori.")

    change = month_over_month_change(summary)
    if not change.empty:
        st.markdown("### Störst förändring mot föregående månad")
        st.dataframe(
            change.rename("förändring (kr)").reset_index().rename(columns={"index": "category"}),
            hide_index=True,
            width="stretch",
        )


def rules_tab() -> None:
    st.subheader("Egna sökordsregler")
    st.caption(
        "Lägg till egna nyckelord för att förbättra den automatiska kategoriseringen. "
        "Ett nyckelord matchas som substräng (skiftlägesokänsligt) mot transaktionsbeskrivningen."
    )
    category = st.selectbox("Kategori", [c for c in DEFAULT_CATEGORIES if c != UNCATEGORIZED])
    keyword = st.text_input("Nyckelord att lägga till (t.ex. ett företagsnamn)")
    if st.button("Lägg till nyckelord") and keyword.strip():
        rules = dict(st.session_state.custom_rules)
        rules.setdefault(category, [])
        if keyword.strip() not in rules[category]:
            rules[category].append(keyword.strip())
        st.session_state.custom_rules = rules
        save_custom_rules(rules)
        st.success(f"Lade till '{keyword.strip()}' under {category}.")

    if st.session_state.custom_rules:
        st.markdown("**Dina egna regler:**")
        for cat, kws in st.session_state.custom_rules.items():
            st.write(f"- **{cat}**: {', '.join(kws)}")


def main() -> None:
    init_state()
    st.title("💰 Budget & utgiftsanalys")
    st.caption(
        "Ladda upp kontoutdrag, låt verktyget kategorisera utgifterna, sätt din egen budget "
        "per kategori och månad, och följ upp utfall, trender och avvikelser."
    )

    tab_upload, tab_budget, tab_followup, tab_rules = st.tabs(
        ["📤 Ladda upp & kategorisera", "🎯 Budget", "📊 Uppföljning", "⚙️ Regler"]
    )
    with tab_upload:
        upload_tab()
    with tab_budget:
        budget_tab()
    with tab_followup:
        followup_tab()
    with tab_rules:
        rules_tab()


if __name__ == "__main__":
    main()
