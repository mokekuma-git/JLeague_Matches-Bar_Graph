#!/usr/bin/env python3
"""One-shot migration: flatten season_map.json season entries from array to object.

Before:
    "2026East": [10, 1, 0,
      ["鹿島", "柏", ...],
      {"group_display": "EAST", "point_system": "pk-win2-loss1"}]

After:
    "2026East": {
      "team_count": 10,
      "promotion_count": 1,
      "relegation_count": 0,
      "teams": ["鹿島", "柏", ...],
      "group_display": "EAST",
      "point_system": "pk-win2-loss1"
    }

This script is disposable — intended for one-time use during Issue #229.
"""
import json
import sys
from pathlib import Path


def migrate_entry(raw: list) -> dict:
    """Convert a season entry array to an object."""
    result = {
        "team_count": raw[0],
        "promotion_count": raw[1],
        "relegation_count": raw[2],
        "teams": raw[3],
    }
    if len(raw) > 4 and isinstance(raw[4], dict):
        result.update(raw[4])
    return result


def migrate_season_map(data: dict) -> dict:
    """Walk the 4-tier structure and convert all season entries."""
    for group_key, group in data.items():
        competitions = group.get("competitions", {})
        for comp_key, comp in competitions.items():
            seasons = comp.get("seasons", {})
            for season_key, entry in seasons.items():
                if isinstance(entry, list):
                    seasons[season_key] = migrate_entry(entry)
                else:
                    print(f"  SKIP {group_key}/{comp_key}/{season_key}: already an object")
    return data


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        path = Path(__file__).resolve().parent.parent / "docs" / "json" / "season_map.json"

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    migrated = migrate_season_map(data)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(migrated, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Migrated {path}")
    print("Run `python scripts/format_season_map.py` to apply custom formatting.")


if __name__ == "__main__":
    main()
