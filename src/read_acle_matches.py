"""Read ACL Elite League Stage match data from スポーツナビ and save as CSV.

URL pattern:
  {base_url}{competition_id}/{section_id}/

The competition_id changes each season and is configured in acle.yaml.
Update urls.competition_id in the config when a new ACL Elite season begins.

Date handling:
  ACL Elite spans two calendar years (e.g. Sep 2025 – Feb 2026).
  Months >= season_start_month belong to start_year; earlier months to
  start_year + 1.  This avoids the ambiguity of single-year season strings.

Status normalisation:
  スポーツナビ shows "試合前" for upcoming matches; this script emits "ＶＳ"
  to match the project standard (status: "試合終了" | "ＶＳ").
"""
import argparse
import logging
import os
import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
import pandas as pd
import requests

from match_utils import mu, get_season_from_date, CSV_COLUMN_SCHEMA

logger = logging.getLogger(__name__)

# スポーツナビ pre-match status text → project standard
_STATUS_MAP = {'試合前': 'ＶＳ'}


def init() -> None:
    """Load config from acle.yaml."""
    mu.init_config(Path(__file__).parent / '../config/acle.yaml')


def _season_start_year(season_str: str) -> int:
    """Return the start calendar year from a 'YY-YY' season string."""
    return 2000 + int(season_str.split('-')[0])


def _match_year(month: int, start_year: int) -> int:
    """Return the correct calendar year for a match month.

    Months >= season_start_month are in start_year; months before it are
    in start_year + 1 (the season crosses the calendar year boundary).
    """
    return start_year if month >= mu.config.season_start_month else start_year + 1


def _parse_date_cell(text: str, start_year: int) -> dict[str, str]:
    """Parse the date/time cell text into match_date and start_time.

    Expected format: "MM/DD（曜日）\\nHH:MM"
    Example: "11/25（火）\\n16:45" → match_date="2025/11/25", start_time="16:45:00"
    """
    parts = text.split()
    date_part = parts[0] if parts else ''
    time_part = parts[1] if len(parts) > 1 else '00:00'

    paren_idx = date_part.find('（')
    md_str = date_part[:paren_idx] if paren_idx != -1 else date_part
    try:
        month = int(md_str.split('/')[0])
    except (ValueError, IndexError):
        month = 1
    year = _match_year(month, start_year)

    try:
        match_date = pd.to_datetime(f"{year}/{md_str}").date()
    except Exception:
        match_date = ''
    try:
        start_time = pd.to_datetime(time_part).time()
    except (ValueError, pd.errors.ParserError):
        start_time = pd.to_datetime('00:00').time()

    return {'match_date': match_date, 'start_time': str(start_time)}


def _parse_score_cell(text: str) -> dict[str, str]:
    """Parse the score/status cell text.

    Finished:  "2\\n- 0\\n試合終了" → home=2, away=0, status=試合終了
    Upcoming:  "- 試合前"          → home='', away='', status=ＶＳ
    """
    text = text.replace('-', ' - ')
    parts = text.split()
    if len(parts) <= 3:
        status_raw = parts[1] if len(parts) > 1 else '試合前'
        return {
            'home_goal': '',
            'away_goal': '',
            'status': _STATUS_MAP.get(status_raw, status_raw),
        }
    status_raw = parts[3]
    return {
        'home_goal': parts[0],
        'away_goal': parts[2],
        'status': _STATUS_MAP.get(status_raw, status_raw),
    }


def _parse_page(soup: BeautifulSoup, start_year: int) -> list[dict[str, Any]]:
    """Parse all match groups (EAST / WEST) from the section page."""
    results: list[dict[str, Any]] = []
    groups = soup.find_all('section', class_='sc-modCommon01')
    for section in groups:
        header = section.find('header')
        group = header.text.strip().replace('グループ', '') if header else ''
        tbody = section.find('tbody')
        if not tbody:
            continue

        match_index = 0
        for tr in tbody.find_all('tr'):
            tds = tr.find_all('td')
            if len(tds) != 6:
                # Skip colspan notice rows (e.g. "※ 試合終了後に結果を掲載します")
                continue

            record: dict[str, Any] = {'group': group}
            record.update(_parse_date_cell(tds[0].text.strip(), start_year))
            m = re.search(r'\d+', tds[1].text)
            record['section_no'] = m.group(0) if m else ''
            record['home_team'] = tds[2].text.strip()
            record.update(_parse_score_cell(tds[3].text))
            record['away_team'] = tds[4].text.strip()
            record['stadium'] = tds[5].text.strip()
            record['match_index_in_section'] = match_index
            results.append(record)
            match_index += 1

    logger.info("Parsed %d matches from %d group(s)", len(results), len(groups))
    return results


def read_section(section_id: str, start_year: int) -> list[dict[str, Any]]:
    """Fetch and parse one matchday from スポーツナビ."""
    url = (
        f"{mu.config.urls.base_url}"
        f"{mu.config.urls.competition_id}/{section_id}/"
    )
    logger.info("GET %s", url)
    soup = BeautifulSoup(
        requests.get(url, timeout=mu.config.http_timeout).text, 'lxml'
    )
    return _parse_page(soup, start_year)


def make_args() -> argparse.Namespace:
    """Argument parser."""
    parser = argparse.ArgumentParser(
        description='Read ACL Elite League Stage match data and save as CSV'
    )
    parser.add_argument(
        '-s', '--season',
        help='Season string e.g. "25-26". Defaults to current season.',
    )
    parser.add_argument('-d', '--debug', action='store_true',
                        help='Enable debug output')
    return parser.parse_args()


if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    init()

    _args = make_args()
    logging.basicConfig(
        level=logging.DEBUG if _args.debug else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )

    _season = _args.season or get_season_from_date(
        season_start_month=mu.config.season_start_month
    )
    _start_year = _season_start_year(_season)
    logger.info(
        "Processing season %s (competition_id=%s)",
        _season, mu.config.urls.competition_id,
    )

    all_matches: list[dict] = []
    for _sec_id in mu.config.section_ids:
        all_matches.extend(read_section(_sec_id, _start_year))

    _df = pd.DataFrame(all_matches)
    _ordered = [c for c in CSV_COLUMN_SCHEMA if c in _df.columns]
    _extras = [c for c in _df.columns if c not in CSV_COLUMN_SCHEMA]
    _df = _df[_ordered + _extras]
    _df = _df.sort_values(['section_no', 'match_index_in_section']).reset_index(drop=True)
    logger.info("Total %d matches across %d section(s)", len(_df), len(mu.config.section_ids))

    _csv_path = mu.config.get_format_str('paths.csv_format', season=_season)
    mu.update_if_diff(_df, _csv_path)
