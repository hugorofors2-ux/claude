"""Lokal lagring av transaktioner, budgetar, kategoriregler och rättningar.

Allt sparas som filer under `budget/data/` (gitignorat, förutom `.gitkeep`)
så att dina bankdata stannar lokalt och aldrig checkas in i repot.
"""

from __future__ import annotations

import hashlib
import json

import pandas as pd

from .config import BUDGET_DATA_DIR

TRANSACTIONS_FILE = BUDGET_DATA_DIR / "transactions.csv"
BUDGETS_FILE = BUDGET_DATA_DIR / "budgets.json"
OVERRIDES_FILE = BUDGET_DATA_DIR / "category_overrides.json"
CUSTOM_RULES_FILE = BUDGET_DATA_DIR / "custom_rules.json"

TRANSACTION_COLUMNS = ["date", "description", "amount", "category", "tx_id"]


def _ensure_dir() -> None:
    BUDGET_DATA_DIR.mkdir(parents=True, exist_ok=True)


def make_tx_id(row) -> str:
    key = f"{pd.Timestamp(row['date']).date()}|{row['description']}|{row['amount']}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def load_transactions() -> pd.DataFrame:
    _ensure_dir()
    if not TRANSACTIONS_FILE.exists():
        return pd.DataFrame(columns=TRANSACTION_COLUMNS)
    return pd.read_csv(TRANSACTIONS_FILE, parse_dates=["date"])


def save_transactions(df: pd.DataFrame) -> None:
    _ensure_dir()
    df.to_csv(TRANSACTIONS_FILE, index=False)


def merge_new_transactions(existing: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    """Slå ihop nyinlästa transaktioner med tidigare sparade, utan dubbletter.

    Transaktioner identifieras via en hash av datum+beskrivning+belopp, så att
    du kan ladda upp överlappande kontoutdrag utan att räkna samma post två gånger.
    """
    new = new.copy()
    new["tx_id"] = new.apply(make_tx_id, axis=1)
    if existing.empty:
        combined = new
    else:
        existing_ids = set(existing["tx_id"])
        additions = new[~new["tx_id"].isin(existing_ids)]
        combined = pd.concat([existing, additions], ignore_index=True)
    return combined.sort_values("date").reset_index(drop=True)


def load_budgets() -> dict:
    _ensure_dir()
    if not BUDGETS_FILE.exists():
        return {}
    return json.loads(BUDGETS_FILE.read_text(encoding="utf-8"))


def save_budgets(budgets: dict) -> None:
    _ensure_dir()
    BUDGETS_FILE.write_text(json.dumps(budgets, ensure_ascii=False, indent=2), encoding="utf-8")


def load_overrides() -> dict:
    _ensure_dir()
    if not OVERRIDES_FILE.exists():
        return {}
    return json.loads(OVERRIDES_FILE.read_text(encoding="utf-8"))


def save_overrides(overrides: dict) -> None:
    _ensure_dir()
    OVERRIDES_FILE.write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding="utf-8")


def load_custom_rules() -> dict:
    _ensure_dir()
    if not CUSTOM_RULES_FILE.exists():
        return {}
    return json.loads(CUSTOM_RULES_FILE.read_text(encoding="utf-8"))


def save_custom_rules(rules: dict) -> None:
    _ensure_dir()
    CUSTOM_RULES_FILE.write_text(json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")
