"""Sökvägar för budgetverktygets lagring."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BUDGET_DATA_DIR = REPO_ROOT / "budget" / "data"
