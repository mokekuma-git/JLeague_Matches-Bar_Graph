"""Cross-language type drift detector.

Compares Python canonical type definitions (CSV_COLUMN_SCHEMA,
SeasonEntry.KNOWN_OPTION_KEYS, POINT_SYSTEM_VALUES) against their
TypeScript counterparts (RawMatchRow, SeasonEntryOptions, POINT_MAPS).

Exit code 0 = all checks pass, 1 = drift detected.

Usage:
    uv run python scripts/check_type_sync.py
"""
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve project root (one level up from scripts/)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / 'src'))

from match_utils import CSV_COLUMN_SCHEMA, POINT_SYSTEM_VALUES, SeasonEntry  # noqa: E402

# ---------------------------------------------------------------------------
# TS source paths
# ---------------------------------------------------------------------------
TS_TYPES_DIR = PROJECT_ROOT / 'frontend' / 'src' / 'types'
MATCH_TS = TS_TYPES_DIR / 'match.ts'
SEASON_TS = TS_TYPES_DIR / 'season.ts'
CONFIG_TS = TS_TYPES_DIR / 'config.ts'

# ---------------------------------------------------------------------------
# TS-only CSV fields that Python does not produce (yet).
# These are expected to exist in RawMatchRow but NOT in CSV_COLUMN_SCHEMA.
# ---------------------------------------------------------------------------
TS_ONLY_CSV_FIELDS: set[str] = {
    'home_score_ex', 'away_score_ex',   # Tier 4 preparation (no Python producer)
    'match_status', 'home_pk', 'away_pk',  # Backward-compat aliases for old CSVs
}


def _parse_interface_fields(content: str, interface_name: str) -> dict[str, str]:
    """Extract field names and optionality from a TS interface.

    Returns:
        dict mapping field_name -> 'required' | 'optional'.
    """
    pattern = rf'export (?:interface|type) {interface_name}\s*(?:extends\s+\w+\s*)?\{{(.*?)\}}'
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        raise ValueError(f"Interface '{interface_name}' not found in TS source")
    body = match.group(1)

    fields: dict[str, str] = {}
    for line in body.split('\n'):
        m = re.match(r'\s+(\w+)(\?)?\s*:', line)
        if m:
            fields[m.group(1)] = 'optional' if m.group(2) else 'required'
    return fields


def _parse_point_maps_keys(content: str) -> set[str]:
    """Extract POINT_MAPS top-level keys from config.ts."""
    match = re.search(
        r'export const POINT_MAPS\s*=\s*\{(.*?)\}\s*satisfies',
        content,
        re.DOTALL,
    )
    if not match:
        raise ValueError("POINT_MAPS not found in config.ts")
    return set(re.findall(r"'([^']+)'\s*:", match.group(1)))


def check_csv_columns() -> list[str]:
    """Check CSV_COLUMN_SCHEMA keys against RawMatchRow fields."""
    errors: list[str] = []
    ts_content = MATCH_TS.read_text(encoding='utf-8')
    ts_fields = _parse_interface_fields(ts_content, 'RawMatchRow')

    py_keys = set(CSV_COLUMN_SCHEMA.keys())
    ts_keys = set(ts_fields.keys())

    # Every Python column must exist in TS
    missing_in_ts = py_keys - ts_keys
    if missing_in_ts:
        errors.append(
            f"CSV columns in Python but missing in TS RawMatchRow: {sorted(missing_in_ts)}")

    # TS-only fields must be in the allow-list
    ts_extra = ts_keys - py_keys
    unexpected = ts_extra - TS_ONLY_CSV_FIELDS
    if unexpected:
        errors.append(
            f"TS RawMatchRow has fields not in Python CSV_COLUMN_SCHEMA "
            f"or TS_ONLY_CSV_FIELDS allow-list: {sorted(unexpected)}")

    return errors


def check_season_entry_options() -> list[str]:
    """Check KNOWN_OPTION_KEYS against SeasonEntryOptions fields."""
    errors: list[str] = []
    ts_content = SEASON_TS.read_text(encoding='utf-8')
    ts_fields = _parse_interface_fields(ts_content, 'SeasonEntryOptions')

    py_keys = SeasonEntry.KNOWN_OPTION_KEYS
    ts_keys = set(ts_fields.keys())

    only_py = py_keys - ts_keys
    only_ts = ts_keys - py_keys
    if only_py:
        errors.append(
            f"SeasonEntry option keys in Python but missing in TS SeasonEntryOptions: "
            f"{sorted(only_py)}")
    if only_ts:
        errors.append(
            f"SeasonEntryOptions fields in TS but missing in Python KNOWN_OPTION_KEYS: "
            f"{sorted(only_ts)}")

    return errors


def check_point_system_values() -> list[str]:
    """Check POINT_SYSTEM_VALUES against POINT_MAPS keys."""
    errors: list[str] = []
    ts_content = CONFIG_TS.read_text(encoding='utf-8')
    ts_keys = _parse_point_maps_keys(ts_content)

    only_py = POINT_SYSTEM_VALUES - ts_keys
    only_ts = ts_keys - POINT_SYSTEM_VALUES
    if only_py:
        errors.append(
            f"PointSystem values in Python but missing in TS POINT_MAPS: {sorted(only_py)}")
    if only_ts:
        errors.append(
            f"POINT_MAPS keys in TS but missing in Python POINT_SYSTEM_VALUES: {sorted(only_ts)}")

    return errors


def main() -> int:
    all_errors: list[str] = []

    checks = [
        ('CSV columns', check_csv_columns),
        ('SeasonEntryOptions', check_season_entry_options),
        ('PointSystem values', check_point_system_values),
    ]

    for label, check_fn in checks:
        try:
            errors = check_fn()
        except Exception as e:
            errors = [f"Error running {label} check: {e}"]
        if errors:
            print(f"FAIL: {label}")
            for err in errors:
                print(f"  - {err}")
            all_errors.extend(errors)
        else:
            print(f"OK:   {label}")

    if all_errors:
        print(f"\n{len(all_errors)} type sync error(s) found.")
        return 1

    print("\nAll type sync checks passed.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
