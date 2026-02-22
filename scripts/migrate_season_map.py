#!/usr/bin/env python3
"""One-time migration script: convert season_map.json from flat 2-tier to 4-tier hierarchy.

Input:  docs/json/season_map.json  (flat: category → season → entry)
Output: docs/json/season_map.json  (4-tier: group → competition → seasons → entry)
        docs/json/season_map_legacy.json  (copy of the original flat format)

Entry tuple transformation:
  Old: [teamCount, promotion, relegation, teams, rankClassMap?, extraInfo?]
  New: [teamCount, promotion, relegation, teams, optionalDict?]

  Where optionalDict merges:
    - old index 4 (RankClassMap) → under "rank_properties" key
    - old index 5 (SeasonExtraInfo) → "group_display", "url_category" keys
"""

import json
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SEASON_MAP_PATH = REPO_ROOT / "docs" / "json" / "season_map.json"
LEGACY_PATH = REPO_ROOT / "docs" / "json" / "season_map_legacy.json"

# Map old category keys to new competition keys
CATEGORY_MAP = {"1": "J1", "2": "J2", "3": "J3"}


def migrate_entry(old_entry: list) -> list:
    """Convert a single season entry from old 6-element to new 5-element format."""
    team_count = old_entry[0]
    promotion = old_entry[1]
    relegation = old_entry[2]
    teams = old_entry[3]

    # Build merged optional dict
    opt: dict = {}

    # Old index 4: RankClassMap (e.g., {"3": "promoted_playoff"})
    if len(old_entry) > 4 and old_entry[4]:
        opt["rank_properties"] = old_entry[4]

    # Old index 5: SeasonExtraInfo (e.g., {"group_display": "EAST", "url_category": "2j3"})
    if len(old_entry) > 5 and old_entry[5]:
        for key, value in old_entry[5].items():
            opt[key] = value

    new_entry = [team_count, promotion, relegation, teams]
    if opt:
        new_entry.append(opt)

    return new_entry


def migrate_jleague(old_map: dict) -> dict:
    """Build the jleague group from old category 1/2/3."""
    league_display_map = {
        "J1": "J1リーグ",
        "J2": "J2リーグ",
        "J3": "J3リーグ",
    }

    competitions = {}
    for old_cat, new_comp in CATEGORY_MAP.items():
        if old_cat not in old_map:
            continue
        seasons = {}
        for season_name, entry in old_map[old_cat].items():
            seasons[season_name] = migrate_entry(entry)
        competitions[new_comp] = {
            "league_display": league_display_map[new_comp],
            "seasons": seasons,
        }

    return {
        "display_name": "Jリーグ",
        "css_files": ["team_style.css"],
        "competitions": competitions,
    }


def build_international() -> dict:
    """Build the international group with existing non-J-League competitions."""
    return {
        "display_name": "国際大会",
        "css_files": ["national_team_style.css"],
        "competitions": {
            "WC_GS": {
                "league_display": "FIFAワールドカップ グループステージ",
                "team_rename_map": {
                    "オーストラリア": "豪州",
                    "アメリカ": "米国",
                },
                "seasons": {
                    "2022": [32, 0, 0, []],
                },
            },
            "WC_AFC": {
                "league_display": "W杯アジア最終予選",
                "team_rename_map": {
                    "オーストラリア": "豪州",
                    "サウジアラビア": "サウジ",
                },
                "seasons": {
                    "2026": [6, 0, 0, []],
                    "2022": [12, 0, 0, []],
                },
            },
            "Olympic_GS": {
                "league_display": "オリンピック グループステージ",
                "team_rename_map": {
                    "ホンジュラス": "ホンジュラ",
                    "ニュージーランド": "ニュージー",
                    "オーストラリア": "豪州",
                    "アルゼンチン": "アルゼン",
                    "サウジアラビア": "サウジアラ",
                    "コートジボワール": "コートジボ",
                },
                "seasons": {
                    "2021": [16, 0, 0, []],
                },
            },
        },
    }


def build_youth() -> dict:
    """Build the youth group."""
    return {
        "display_name": "ユース",
        "css_files": ["team_style.css"],
        "competitions": {
            "PrincePremierE": {
                "league_display": "高円宮杯プレミアリーグEAST",
                "seasons": {
                    "2025": [12, 0, 0, []],
                    "2024": [12, 0, 0, []],
                    "2023": [12, 0, 0, []],
                    "2022": [12, 0, 0, []],
                    "2021": [10, 0, 0, []],
                },
            },
            "PrincePremierW": {
                "league_display": "高円宮杯プレミアリーグWEST",
                "seasons": {
                    "2025": [12, 0, 0, []],
                    "2024": [12, 0, 0, []],
                    "2023": [12, 0, 0, []],
                    "2022": [12, 0, 0, []],
                    "2021": [10, 0, 0, []],
                },
            },
            "PrinceKanto": {
                "league_display": "高円宮杯プリンスリーグ関東",
                "seasons": {
                    "2025": [10, 0, 0, []],
                    "2024": [10, 0, 0, []],
                    "2023": [10, 0, 0, []],
                    "2022": [10, 0, 0, []],
                    "2021": [10, 0, 0, []],
                },
            },
        },
    }


def build_other() -> dict:
    """Build the other group (ACL, WE)."""
    return {
        "display_name": "その他",
        "competitions": {
            "ACL_GS": {
                "league_display": "ACL グループステージ",
                "css_files": ["team_style.css"],
                "team_rename_map": {
                    "ユナイテッドシティ": "UCFC",
                    "パトゥムユナイテッド": "パトゥ",
                    "全北現代": "全北",
                    "メルボルンシティ": "メルボ",
                    "シドニーFC": "シドニ",
                    "ホアンアインザライ": "ホアン",
                    "山東泰山": "山東",
                    "セーラーズ": "セーラ",
                    "チェンライU": "チェン",
                    "ラーチャブリー": "ラチャ",
                },
                "seasons": {
                    "2022": [39, 0, 0, []],
                    "2021": [40, 0, 0, []],
                },
            },
            "WE": {
                "league_display": "WEリーグ",
                "css_files": ["team_style.css"],
                "seasons": {
                    "2021-2022": [11, 0, 0, []],
                },
            },
        },
    }


def main():
    # Read original
    with open(SEASON_MAP_PATH, "r", encoding="utf-8") as f:
        old_map = json.load(f)

    # Save legacy copy
    shutil.copy2(SEASON_MAP_PATH, LEGACY_PATH)
    print(f"Legacy copy saved to {LEGACY_PATH}")

    # Build new 4-tier structure
    new_map = {
        "jleague": migrate_jleague(old_map),
        "international": build_international(),
        "youth": build_youth(),
        "other": build_other(),
    }

    # Write new format
    with open(SEASON_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(new_map, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # Verify
    j1_seasons = len(new_map["jleague"]["competitions"]["J1"]["seasons"])
    j2_seasons = len(new_map["jleague"]["competitions"]["J2"]["seasons"])
    j3_seasons = len(new_map["jleague"]["competitions"]["J3"]["seasons"])
    total_competitions = sum(
        len(g["competitions"]) for g in new_map.values()
    )
    print(f"Migration complete:")
    print(f"  J1: {j1_seasons} seasons, J2: {j2_seasons} seasons, J3: {j3_seasons} seasons")
    print(f"  Total competitions: {total_competitions}")
    print(f"  Groups: {list(new_map.keys())}")


if __name__ == "__main__":
    main()
