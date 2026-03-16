"""Migrate tournament CSV section_no semantics to bracket-depth numbering."""

from __future__ import annotations

import logging
import re
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / 'src'))
sys.path.insert(0, str(_REPO_ROOT / 'scripts'))

import pandas as pd

from fetch_match_detail import FILTER_ALIASES
from match_utils import assign_bracket_section_no

logger = logging.getLogger(__name__)

CSV_DIR = _REPO_ROOT / 'docs' / 'csv'
SOURCE_CSV_DIR = _REPO_ROOT / 'csv'
JLEAGUECUP_PATTERN = FILTER_ALIASES['JLeagueCup']


def iter_target_files() -> list[Path]:
    files = sorted(CSV_DIR.glob('*_allmatch_result-JLeagueCup.csv'))
    files.extend([
        CSV_DIR / '2025_allmatch_result-EmperorsCup.csv',
        CSV_DIR / '22-23_allmatch_result-WE_Cup_KO.csv',
        CSV_DIR / '23-24_allmatch_result-WE_Cup_KO.csv',
        CSV_DIR / '24-25_allmatch_result-WE_Cup_KO.csv',
    ])
    return files


def _source_match_date(year: int, raw_date: str) -> str:
    date_text = re.sub(r'\(.+\)', '', str(raw_date))
    parts = date_text.split('/')
    if len(parts) == 3 and len(parts[0]) == 2:
        century = (year // 100) * 100
        return f'{century + int(parts[0]):04d}/{parts[1]}/{parts[2]}'
    if len(parts) == 3:
        return date_text
    return f'{year}/{date_text}'


def build_jleaguecup_match_number_lookup(year: int) -> dict[tuple[str, str, str], str]:
    source_path = SOURCE_CSV_DIR / f'{year}.csv'
    source_df = pd.read_csv(source_path, dtype=str).fillna('')
    source_df = source_df[source_df['大会'].str.contains(JLEAGUECUP_PATTERN, na=False)].copy()
    source_df['match_date'] = source_df['試合日'].map(lambda value: _source_match_date(year, value))

    lookup: dict[tuple[str, str, str], str] = {}
    for row in source_df.itertuples(index=False):
        key = (row.match_date, row.ホーム, row.アウェイ)
        lookup[key] = row.match_card_id
    return lookup


def add_match_number(df: pd.DataFrame, year: int) -> tuple[pd.DataFrame, int]:
    lookup = build_jleaguecup_match_number_lookup(year)
    result = df.copy()
    matched = 0
    match_numbers: list[str] = []
    for row in result.itertuples(index=False):
        key = (row.match_date, row.home_team, row.away_team)
        value = lookup.get(key, '')
        if value:
            matched += 1
        else:
            logger.warning('match_number lookup miss: %s %s vs %s', *key)
        match_numbers.append(value)
    result['match_number'] = match_numbers
    return result, matched


def validate_migration(before_df: pd.DataFrame, after_df: pd.DataFrame, path: Path) -> None:
    before_key = before_df[['match_date', 'home_team', 'away_team']].fillna('').astype(str)
    after_key = after_df[['match_date', 'home_team', 'away_team']].fillna('').astype(str)
    if not before_key.equals(after_key):
        raise ValueError(f'{path.name}: row identity changed during migration')

    if (after_df['section_no'].astype(int) == 0).any():
        raise ValueError(f'{path.name}: section_no=0 remained after migration')

    dedup_leg = (
        after_df['leg'].fillna('').astype(str)
        if 'leg' in after_df.columns
        else pd.Series([''] * len(after_df), index=after_df.index)
    )
    dedup_key = pd.DataFrame({
        'section_no': after_df['section_no'].astype(int),
        'match_index_in_section': after_df['match_index_in_section'].astype(int),
        'leg': dedup_leg,
    })
    if dedup_key.duplicated().any():
        raise ValueError(f'{path.name}: duplicate (section_no, match_index_in_section, leg) detected')


def migrate_file(path: Path) -> tuple[int, int]:
    logger.info('Migrating %s', path.name)
    before_df = pd.read_csv(path, index_col=0, dtype=str).fillna('')
    after_df = assign_bracket_section_no(before_df)
    matched = 0

    if path.name.endswith('_allmatch_result-JLeagueCup.csv'):
        year = int(path.name.split('_', 1)[0])
        after_df, matched = add_match_number(after_df, year)

    validate_migration(before_df, after_df, path)
    after_df.to_csv(path, lineterminator='\n')
    return len(after_df), matched


def main() -> None:
    total_rows = 0
    total_matched = 0
    total_jleaguecup_rows = 0

    for path in iter_target_files():
        row_count, matched = migrate_file(path)
        total_rows += row_count
        if path.name.endswith('_allmatch_result-JLeagueCup.csv'):
            total_jleaguecup_rows += row_count
            total_matched += matched

    logger.info('Migrated %d files, %d rows total', len(iter_target_files()), total_rows)
    logger.info(
        'JLeagueCup match_number coverage: %d/%d',
        total_matched,
        total_jleaguecup_rows,
    )


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    main()
