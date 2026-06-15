"""Laddning av YAML-konfiguration och sökvägar."""

from __future__ import annotations

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = REPO_ROOT / "config"
DATA_DIR = REPO_ROOT / "data"


def load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def load_scoring(config_dir: Path = CONFIG_DIR) -> dict:
    return load_yaml(config_dir / "scoring.yaml")


def load_settings(config_dir: Path = CONFIG_DIR) -> dict:
    return load_yaml(config_dir / "settings.yaml")
