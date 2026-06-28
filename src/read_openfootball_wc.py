"""Patch WC2026 scores from openfootball/worldcup.json.

This is a supplementary daily score source. ``read_jfamatch.py`` remains
authoritative for schedule / venue / timezone; this reader only overwrites
``home_goal`` / ``away_goal`` / ``status`` (plus extra-time and penalty columns
for knockout matches) using openfootball, which reflects live scores faster
than the JFA feed.

Matching strategy (see config ``../config/openfootball.yaml``):

- Group stage: openfootball GS matches carry no match number, so rows are
  matched by team name (English -> Japanese via ``team_name_map``) + group.
  Group-stage teams are always real names, so this is safe.
- Knockout: matched by openfootball ``num`` <-> CSV ``match_number``. This is
  robust against placeholder team names in the bracket (e.g. ``3A/B/C/D/F``).

openfootball score schema:

- ``score.ft`` full-time (90 min) goals ``[home, away]``
- ``score.et`` cumulative score after extra time (includes ``ft``)
- ``score.p``  penalty shootout result

Per the project convention the main score is always extra-time inclusive, and
``home_score_ex`` / ``away_score_ex`` hold only the extra-time-period goals
(``et`` minus ``ft``).
"""
import argparse
import json
import logging
import os
from pathlib import Path
from typing import Any

import pandas as pd

from match_utils import mu

logger = logging.getLogger(__name__)

CONFIG_PATH = (Path(__file__).resolve().parent / '../config/openfootball.yaml')
FINISHED_STATUS = '試合終了'


def load_source(source: str, timeout: int = 60) -> dict[str, Any]:
    """Load worldcup.json from a local file path or an HTTP(S) URL.

    Args:
        source: Local path to a worldcup.json file, or a URL to fetch.
        timeout: HTTP timeout in seconds (ignored for local files).

    Returns:
        dict: Parsed worldcup.json content.
    """
    if source and Path(source).exists():
        logger.info("Reading local openfootball source %s", source)
        with open(source, encoding='utf-8') as handle:
            return json.load(handle)
    import requests  # local import so unit tests with a local --source need no network stub
    logger.info("Fetching openfootball source %s", source)
    resp = requests.get(source, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def score_updates(score: dict[str, Any] | None) -> dict[str, str] | None:
    """Map an openfootball score dict to CSV column updates.

    Args:
        score: openfootball ``score`` object, or None/empty for an unplayed match.

    Returns:
        dict mapping CSV column -> string value, or None when no full-time score
        is present (the match has not finished yet).
    """
    full_time = score.get('ft') if score else None
    if not full_time:
        return None
    extra_time = score.get('et')
    penalties = score.get('p')
    # Main score is always extra-time inclusive.
    main = extra_time if extra_time else full_time
    updates = {
        'home_goal': str(main[0]),
        'away_goal': str(main[1]),
        'status': FINISHED_STATUS,
    }
    if extra_time and full_time:
        # Store only the extra-time-period goals (cumulative ET minus full time).
        updates['home_score_ex'] = str(extra_time[0] - full_time[0])
        updates['away_score_ex'] = str(extra_time[1] - full_time[1])
    if penalties:
        updates['home_pk_score'] = str(penalties[0])
        updates['away_pk_score'] = str(penalties[1])
    return updates


def _apply_updates(match_df: pd.DataFrame, idx: Any, updates: dict[str, str]) -> bool:
    """Apply column updates to one row; return True if any value changed.

    Assigns string values so the in-memory DataFrame stays consistent with the
    string dtype produced by ``read_allmatches_csv`` (otherwise ``matches_differ``
    would treat int 2 and str '2' as different and rewrite the file every run).
    A column absent from the CSV (e.g. ``home_score_ex``) is created on demand.
    """
    row_changed = False
    for col, val in updates.items():
        current = match_df.at[idx, col] if col in match_df.columns else None
        current_str = '' if current is None or (isinstance(current, float) and pd.isna(current)) else str(current)
        if current_str != val:
            match_df.at[idx, col] = val
            row_changed = True
    return row_changed


def patch_group_stage(match_df: pd.DataFrame, matches: list[dict], name_map: dict[str, str]) -> int:
    """Patch group-stage rows matched by team name + group. Return changed count."""
    row_index: dict[tuple[str, str, str], Any] = {}
    for idx, row in match_df.iterrows():
        group = '' if row.get('group') is None else str(row.get('group'))
        row_index[(row['home_team'], row['away_team'], group)] = idx

    changed = 0
    for match in matches:
        group = str(match.get('group', ''))
        if not group.startswith('Group'):
            continue
        updates = score_updates(match.get('score'))
        if updates is None:
            continue
        home = name_map.get(match['team1'])
        away = name_map.get(match['team2'])
        if home is None or away is None:
            logger.warning("Unmapped group-stage team: %s / %s", match['team1'], match['team2'])
            continue
        letter = group.split()[-1]
        idx = row_index.get((home, away, letter))
        if idx is None:
            logger.warning("No group-stage CSV row for %s vs %s (group %s)", home, away, letter)
            continue
        if _apply_updates(match_df, idx, updates):
            changed += 1
    return changed


def patch_knockout(match_df: pd.DataFrame, matches: list[dict]) -> int:
    """Patch knockout rows matched by ``num`` <-> ``match_number``. Return changed count."""
    if 'match_number' not in match_df.columns:
        logger.warning("Knockout CSV has no match_number column; skipping knockout patch")
        return 0
    row_index = {str(val): idx for idx, val in match_df['match_number'].items() if val is not None}

    changed = 0
    for match in matches:
        num = match.get('num')
        if num is None:
            continue
        updates = score_updates(match.get('score'))
        if updates is None:
            continue
        idx = row_index.get(str(num))
        if idx is None:
            logger.warning("No knockout CSV row for match_number %s", num)
            continue
        if _apply_updates(match_df, idx, updates):
            changed += 1
    return changed


def patch_csv(csv_path: str, patch_fn, label: str, dry_run: bool) -> int:
    """Read a CSV, apply ``patch_fn``, and write it back if changed (unless dry-run)."""
    if not Path(csv_path).exists():
        logger.warning("%s CSV not found: %s", label, csv_path)
        return 0
    match_df = mu.read_allmatches_csv(csv_path)
    changed = patch_fn(match_df)
    logger.info("openfootball %s: %d row(s) changed", label, changed)
    if changed and not dry_run:
        mu.update_if_diff(match_df, csv_path)
    elif changed:
        logger.info("[dry-run] would update %s", csv_path)
    return changed


def make_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Patch WC2026 CSV scores from openfootball/worldcup.json")
    parser.add_argument('--source', help='Local worldcup.json path or URL override')
    parser.add_argument('--dry-run', action='store_true',
                        help='Log changes without writing the CSV files')
    return parser.parse_args()


def main() -> None:
    """Fetch openfootball data and patch the WC2026 group-stage and knockout CSVs."""
    args = make_args()
    config = mu.init_config(CONFIG_PATH)
    source = args.source or config.source_url
    timeout = getattr(config, 'http_timeout', 60)
    data = load_source(source, timeout)
    matches = data.get('matches', [])
    name_map = config.team_name_map.to_dict()

    patch_csv(config.group_stage_csv,
              lambda df: patch_group_stage(df, matches, name_map),
              'group stage', args.dry_run)
    patch_csv(config.knockout_csv,
              lambda df: patch_knockout(df, matches),
              'knockout', args.dry_run)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    # Resolve config-relative CSV paths (e.g. ../docs/csv/...) and the timestamp
    # file against the src/ directory, matching read_jfamatch.py.
    os.chdir(Path(__file__).resolve().parent)
    main()
