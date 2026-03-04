"""Fetch match detail HTML pages from data.j-league.or.jp and save locally.

Reads match_card_id from intermediate CSVs and downloads each match's
detail page (SFMS02), saving the raw HTML for offline parsing.
Already-downloaded files are skipped (incremental fetch).

Usage:
    uv run python src/fetch_match_detail.py --year 1995 [--delay 3] [--dry-run]
"""
import argparse
import logging
import time
from pathlib import Path

import pandas as pd
import requests

logger = logging.getLogger(__name__)

DETAIL_URL = 'https://data.j-league.or.jp/SFMS02/?match_card_id={match_card_id}'
CSV_DIR = Path(__file__).parent / '../csv'
OUTPUT_DIR = Path(__file__).parent / '../local_data/match_detail'


def load_match_card_ids(year: int) -> list[str]:
    """Read match_card_id values from the intermediate CSV for a given year."""
    csv_path = (CSV_DIR / f'{year}.csv').resolve()
    if not csv_path.exists():
        logger.warning('CSV not found: %s', csv_path)
        return []
    df = pd.read_csv(csv_path, dtype={'match_card_id': str})
    ids = df['match_card_id'].dropna().tolist()
    logger.info('Year %d: %d match_card_ids found in %s', year, len(ids), csv_path.name)
    return ids


def fetch_and_save(year: int, match_card_id: str, *, delay: float, dry_run: bool) -> bool:
    """Fetch a single match detail page and save it locally.

    Returns True if a new file was downloaded, False if skipped.
    """
    out_dir = (OUTPUT_DIR / str(year)).resolve()
    out_path = out_dir / f'{match_card_id}.html'

    if out_path.exists():
        logger.debug('Skip (exists): %s', out_path)
        return False

    url = DETAIL_URL.format(match_card_id=match_card_id)
    if dry_run:
        logger.info('[DRY-RUN] Would fetch: %s -> %s', url, out_path)
        return False

    out_dir.mkdir(parents=True, exist_ok=True)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    out_path.write_text(resp.text, encoding='utf-8')
    logger.info('Saved: %s (%d bytes)', out_path, len(resp.text))

    time.sleep(delay)
    return True


def fetch_year(year: int, *, delay: float, dry_run: bool) -> None:
    """Fetch all match detail pages for a given year."""
    ids = load_match_card_ids(year)
    if not ids:
        return

    fetched = 0
    skipped = 0
    for card_id in ids:
        if fetch_and_save(year, card_id, delay=delay, dry_run=dry_run):
            fetched += 1
        else:
            skipped += 1

    logger.info('Year %d complete: %d fetched, %d skipped', year, fetched, skipped)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Fetch match detail HTML pages from data.j-league.or.jp')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--year', type=int, help='Single year to fetch')
    group.add_argument('--range', nargs=2, type=int, metavar=('START', 'END'),
                       help='Range of years (inclusive)')
    parser.add_argument('--delay', type=float, default=3.0,
                        help='Delay in seconds between requests (default: 3)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Log actions without making HTTP requests')
    return parser.parse_args()


def main() -> None:
    """Entry point."""
    args = parse_args()
    years = [args.year] if args.year else list(range(args.range[0], args.range[1] + 1))

    for year in years:
        fetch_year(year, delay=args.delay, dry_run=args.dry_run)


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    main()
