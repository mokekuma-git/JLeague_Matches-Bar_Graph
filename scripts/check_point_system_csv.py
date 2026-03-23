"""Validate point_system settings against CSV data.

Cross-checks season_map.json point_system configuration with CSV files
in docs/csv/ to catch mismatches that cause runtime errors (e.g. a CSV
with PK match data paired with a point_system where pk_win = 0).

Exit code 0 = all checks pass (warnings are OK), 1 = error(s) found.

Usage:
    uv run python scripts/check_point_system_csv.py
"""
import csv
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SEASON_MAP_PATH = PROJECT_ROOT / 'docs' / 'json' / 'season_map.json'
CSV_DIR = PROJECT_ROOT / 'docs' / 'csv'
CONFIG_TS = PROJECT_ROOT / 'frontend' / 'src' / 'types' / 'config.ts'

# CSV column names that indicate PK data (old alias + current name)
PK_COLUMNS = {'home_pk_score', 'home_pk'}


def parse_point_maps_pk(config_path: Path) -> dict[str, int]:
    """Parse POINT_MAPS from config.ts and extract pk_win values.

    Returns:
        dict mapping point_system name -> pk_win value.
    """
    content = config_path.read_text(encoding='utf-8')
    match = re.search(
        r'export const POINT_MAPS\s*=\s*\{(.*?)\}\s*satisfies',
        content,
        re.DOTALL,
    )
    if not match:
        raise ValueError("POINT_MAPS not found in config.ts")

    result: dict[str, int] = {}
    for entry_match in re.finditer(
        r"'([^']+)'\s*:\s*\{([^}]+)\}", match.group(1)
    ):
        system_name = entry_match.group(1)
        body = entry_match.group(2)
        pk_match = re.search(r'pk_win:\s*(\d+)', body)
        if pk_match:
            result[system_name] = int(pk_match.group(1))
        else:
            raise ValueError(
                f"pk_win not found in POINT_MAPS entry '{system_name}'")
    return result


def resolve_point_system(
    comp_data: dict, season_entry: dict,
) -> str:
    """Resolve point_system with cascade: season entry -> competition -> default."""
    ps = season_entry.get('point_system')
    if ps:
        return ps
    # Competition level
    ps = comp_data.get('point_system')
    if ps:
        return ps
    return 'standard'


def resolve_view_types(
    group_data: dict, comp_data: dict, season_entry: dict,
) -> set[str]:
    """Resolve view_type with array union cascade: group -> competition -> season."""
    vt: set[str] = set()
    for level in (group_data, comp_data, season_entry):
        for v in level.get('view_type', []):
            vt.add(v)
    return vt if vt else {'league'}


def check_csv_pk_data(csv_path: Path) -> bool:
    """Check if a CSV contains actual PK match data (non-empty values).

    Returns True only if the CSV has a PK column AND at least one row
    with a non-empty PK value.  Columns without data are ignored so that
    CSVs with a unified column schema (PK columns always present) do not
    trigger false positives.
    """
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            return False
        pk_col = next(
            (c for c in reader.fieldnames if c.strip() in PK_COLUMNS), None,
        )
        if pk_col is None:
            return False
        # Scan rows for actual PK data (stop at first hit)
        return any(row.get(pk_col, '').strip() for row in reader)


def check_all() -> list[str]:
    """Run all point_system × CSV consistency checks.

    Returns:
        List of error messages (empty = all OK).
    """
    errors: list[str] = []

    # 1. Parse POINT_MAPS pk_win values from config.ts
    try:
        pk_win_map = parse_point_maps_pk(CONFIG_TS)
    except Exception as e:
        return [f"Failed to parse POINT_MAPS from config.ts: {e}"]

    # 2. Load season_map.json
    try:
        with open(SEASON_MAP_PATH, 'r', encoding='utf-8') as f:
            season_map = json.load(f)
    except Exception as e:
        return [f"Failed to load season_map.json: {e}"]

    # 3. Iterate all groups -> competitions -> seasons
    for group_key, group_data in season_map.items():
        competitions = group_data.get('competitions', {})
        for comp_key, comp_data in competitions.items():
            seasons = comp_data.get('seasons', {})
            for season_key, season_entry in seasons.items():
                # Skip bracket-only seasons (no league view = no point calculation)
                view_types = resolve_view_types(
                    group_data, comp_data, season_entry)
                if 'league' not in view_types:
                    continue

                point_system = resolve_point_system(comp_data, season_entry)

                # Validate point_system is known
                if point_system not in pk_win_map:
                    errors.append(
                        f"{comp_key}/{season_key}: unknown point_system "
                        f"'{point_system}'")
                    continue

                pk_win = pk_win_map[point_system]

                # Find corresponding CSV
                csv_name = f"{season_key}_allmatch_result-{comp_key}.csv"
                csv_path = CSV_DIR / csv_name
                if not csv_path.exists():
                    continue  # CSV not yet available; skip

                has_pk_data = check_csv_pk_data(csv_path)

                # Check: CSV has PK data but pk_win == 0 → ERROR
                # This is the exact bug pattern from hotfix 3aacd23.
                if has_pk_data and pk_win == 0:
                    errors.append(
                        f"{comp_key}/{season_key}: CSV '{csv_name}' has PK "
                        f"match data but point_system '{point_system}' maps "
                        f"pk_win to 0 (will cause runtime error)")

    return errors


def main() -> int:
    errors = check_all()

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        print(f"\n{len(errors)} point_system × CSV error(s) found.")
        return 1

    print("All point_system × CSV checks passed.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
