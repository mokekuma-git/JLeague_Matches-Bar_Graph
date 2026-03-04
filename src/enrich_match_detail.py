"""Enrich intermediate CSVs with extra-time scores from saved match detail HTML.

Reads saved HTML files (produced by fetch_match_detail.py) and adds
home_score_ex / away_score_ex columns to the intermediate CSV.
Also cross-checks PK data between the CSV's スコア column and parsed HTML.

Usage:
    uv run python src/enrich_match_detail.py --year 1995
"""
import argparse
import logging
import re
import sys
from pathlib import Path

import pandas as pd

from parse_match_detail import parse_match_detail

logger = logging.getLogger(__name__)

CSV_DIR = Path(__file__).parent / '../csv'
HTML_DIR = Path(__file__).parent / '../local_data/match_detail'

PK_PATTERN = re.compile(r'\(PK(\d+)-(\d+)\)')


def enrich_year(year: int) -> None:
    """Enrich the intermediate CSV for a given year with extra-time scores."""
    csv_path = (CSV_DIR / f'{year}.csv').resolve()
    if not csv_path.exists():
        logger.warning('CSV not found: %s', csv_path)
        return

    df = pd.read_csv(csv_path, index_col=0, dtype={'match_card_id': str})
    html_dir = (HTML_DIR / str(year)).resolve()

    if not html_dir.exists():
        logger.warning('HTML dir not found: %s (run fetch_match_detail.py first)', html_dir)
        return

    home_ex_list: list[str] = []
    away_ex_list: list[str] = []
    errors = 0

    for idx, row in df.iterrows():
        card_id = row.get('match_card_id')
        if pd.isna(card_id):
            home_ex_list.append('')
            away_ex_list.append('')
            continue

        html_path = html_dir / f'{card_id}.html'
        if not html_path.exists():
            logger.debug('HTML not found for match_card_id=%s, skipping', card_id)
            home_ex_list.append('')
            away_ex_list.append('')
            continue

        try:
            html = html_path.read_text(encoding='utf-8')
            detail = parse_match_detail(html)
        except Exception:
            logger.exception('Failed to parse match_card_id=%s', card_id)
            home_ex_list.append('')
            away_ex_list.append('')
            errors += 1
            continue

        # Extra-time scores
        if detail.has_extra_time:
            home_ex_list.append(str(detail.home_score_ex))
            away_ex_list.append(str(detail.away_score_ex))
        else:
            home_ex_list.append('')
            away_ex_list.append('')

        # Cross-check PK data with CSV スコア column
        score_str = str(row.get('スコア', ''))
        pk_match = PK_PATTERN.search(score_str)
        if pk_match:
            csv_home_pk = int(pk_match.group(1))
            csv_away_pk = int(pk_match.group(2))
            if detail.home_pk is not None and detail.away_pk is not None:
                if (csv_home_pk, csv_away_pk) != (detail.home_pk, detail.away_pk):
                    logger.warning(
                        'PK mismatch at row %s (card_id=%s): CSV=%d-%d, HTML=%d-%d',
                        idx, card_id, csv_home_pk, csv_away_pk,
                        detail.home_pk, detail.away_pk,
                    )
            elif detail.home_pk is None:
                logger.warning(
                    'CSV has PK %d-%d but HTML has no PK (card_id=%s)',
                    csv_home_pk, csv_away_pk, card_id,
                )
        elif detail.home_pk is not None:
            logger.warning(
                'HTML has PK %d-%d but CSV has no PK (card_id=%s)',
                detail.home_pk, detail.away_pk, card_id,
            )

    df['home_score_ex'] = home_ex_list
    df['away_score_ex'] = away_ex_list
    df.to_csv(csv_path, lineterminator='\n', encoding='utf-8')
    logger.info('Enriched %s: %d rows (%d errors)', csv_path.name, len(df), errors)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Enrich intermediate CSVs with extra-time scores')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--year', type=int, help='Single year to enrich')
    group.add_argument('--range', nargs=2, type=int, metavar=('START', 'END'),
                       help='Range of years (inclusive)')
    return parser.parse_args()


def main() -> None:
    """Entry point."""
    args = parse_args()
    years = [args.year] if args.year else list(range(args.range[0], args.range[1] + 1))

    for year in years:
        enrich_year(year)


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).parent))
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    main()
