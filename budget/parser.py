"""Inläsning av kontoutdrag i olika format (CSV/Excel, olika banker)."""

from __future__ import annotations

import io
from pathlib import Path

import pandas as pd

# Kandidatnamn (delsträng, gemener) för att automatiskt hitta rätt kolumner
# oavsett vilken bank utdraget kommer ifrån.
DATE_CANDIDATES = ["bokföringsdag", "bokforingsdag", "transaktionsdag", "valutadag", "datum", "date"]
DESC_CANDIDATES = [
    "beskrivning", "text", "meddelande", "specifikation", "transaktion",
    "rubrik", "avsändare", "avsandare", "mottagare", "description",
]
AMOUNT_CANDIDATES = ["belopp", "amount", "summa"]


def read_statement(file) -> pd.DataFrame:
    """Läs en uppladdad fil (CSV eller Excel) till en rå DataFrame."""
    name = getattr(file, "name", str(file))
    suffix = Path(name).suffix.lower()
    raw = file.read() if hasattr(file, "read") else Path(file).read_bytes()

    if suffix in (".xlsx", ".xls"):
        return pd.read_excel(io.BytesIO(raw))
    return _read_csv_flex(raw)


def _read_csv_flex(raw: bytes) -> pd.DataFrame:
    text = None
    for encoding in ("utf-8-sig", "cp1252", "latin1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode("utf-8", errors="replace")

    best = None
    for sep in (";", ",", "\t"):
        try:
            df = pd.read_csv(io.StringIO(text), sep=sep)
        except Exception:
            continue
        if best is None or df.shape[1] > best.shape[1]:
            best = df
    if best is None:
        raise ValueError("Kunde inte tolka filen som CSV.")
    return best


def guess_column(columns, candidates: list[str]) -> str | None:
    lowered = {col: str(col).lower().strip() for col in columns}
    for cand in candidates:
        for col, low in lowered.items():
            if cand in low:
                return col
    return None


def normalize(
    df: pd.DataFrame,
    date_col: str | None = None,
    desc_col: str | None = None,
    amount_col: str | None = None,
) -> pd.DataFrame:
    """Standardisera ett kontoutdrag till kolumnerna date/description/amount.

    Kolumner kan anges explicit (om auto-detektering gissar fel) eller gissas
    automatiskt utifrån vanliga svenska/engelska kolumnnamn.
    """
    date_col = date_col or guess_column(df.columns, DATE_CANDIDATES)
    desc_col = desc_col or guess_column(df.columns, DESC_CANDIDATES)
    amount_col = amount_col or guess_column(df.columns, AMOUNT_CANDIDATES)

    missing = [
        label for label, col in [("datum", date_col), ("beskrivning", desc_col), ("belopp", amount_col)]
        if not col
    ]
    if missing:
        raise ValueError(
            f"Kunde inte identifiera kolumn(er) för: {', '.join(missing)}. "
            "Välj rätt kolumner manuellt."
        )

    out = pd.DataFrame(
        {
            "date": pd.to_datetime(df[date_col], errors="coerce"),
            "description": df[desc_col].astype(str).str.strip(),
            "amount": _parse_amount(df[amount_col]),
        }
    )
    out = out.dropna(subset=["date", "amount"]).reset_index(drop=True)
    return out


def _parse_amount(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    cleaned = (
        series.astype(str)
        .str.replace("\xa0", "", regex=False)
        .str.replace(" ", "", regex=False)
        .str.replace(",", ".", regex=False)
    )
    return pd.to_numeric(cleaned, errors="coerce")
