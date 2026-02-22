#!/usr/bin/env python3
"""Convert aclgl_points.json to standard CSV format.

The ACL JSON stores match data per-team (each match appears twice: once
for the home team, once for the away team).  This script extracts only
``is_home=True`` records to produce one row per match, then writes them
as a standard CSV with the project's common column order.

Usage:
    python scripts/convert_acl_json_to_csv.py [--year YEAR] [INPUT] [OUTPUT]

If INPUT is omitted, defaults to ``docs/json/aclgl_points.json``.
If OUTPUT is omitted, writes to stdout.
"""
import argparse
import csv
import json
import sys
from pathlib import Path


# Standard CSV column order (matches docs/csv/*.csv)
CSV_COLUMNS = [
    "match_date",
    "section_no",
    "match_index_in_section",
    "start_time",
    "stadium",
    "home_team",
    "home_goal",
    "away_goal",
    "away_team",
    "status",
    "group",
]


def convert_acl_json(data: dict, year: int) -> list[dict]:
    """Convert ACL JSON data to a list of CSV-row dicts.

    Args:
        data: Parsed aclgl_points.json content (group → team → {df: [...]}).
        year: Year to prepend to MM/DD dates.

    Returns:
        List of dicts with keys matching CSV_COLUMNS, sorted by
        (match_date, group, section_no).
    """
    rows: list[dict] = []

    for group_name, teams in data.items():
        for team_name, team_data in teams.items():
            for match in team_data.get("df", []):
                if not match.get("is_home"):
                    continue

                # Convert MM/DD → YYYY/MM/DD
                raw_date = match.get("match_date", "")
                if "/" in raw_date and len(raw_date) <= 5:
                    match_date = f"{year}/{raw_date}"
                else:
                    match_date = raw_date

                # Map match_status → status (ACL JSON uses match_status)
                status = match.get("match_status", "")

                rows.append({
                    "match_date": match_date,
                    "section_no": match.get("section_no", ""),
                    "match_index_in_section": "",
                    "start_time": match.get("start_time", ""),
                    "stadium": match.get("stadium", ""),
                    "home_team": team_name,
                    "home_goal": match.get("goal_get", ""),
                    "away_goal": match.get("goal_lose", ""),
                    "away_team": match.get("opponent", ""),
                    "status": status,
                    "group": group_name,
                })

    # Sort by date, then group, then section_no (numeric)
    def sort_key(row):
        try:
            sec = int(row["section_no"])
        except (ValueError, TypeError):
            sec = 0
        return (row["match_date"], row["group"], sec)

    rows.sort(key=sort_key)
    return rows


def write_csv(rows: list[dict], output_path: str | None = None) -> None:
    """Write rows to CSV file or stdout.

    Args:
        rows: List of dicts with keys matching CSV_COLUMNS.
        output_path: File path to write to.  None → stdout.
    """
    if output_path:
        fh = open(output_path, "w", newline="", encoding="utf-8")
    else:
        fh = sys.stdout

    try:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    finally:
        if output_path:
            fh.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert aclgl_points.json to standard CSV format."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="docs/json/aclgl_points.json",
        help="Input JSON file path (default: docs/json/aclgl_points.json)",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=None,
        help="Output CSV file path (default: stdout)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=2021,
        help="Year to prepend to MM/DD dates (default: 2021)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    rows = convert_acl_json(data, args.year)
    write_csv(rows, args.output)

    if args.output:
        print(
            f"Converted {len(rows)} matches to {args.output}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
