"""Read WE League match data and save as CSV.

Scraping strategy:
  1. For each month in the season, fetch the monthly page to get match-day numbers
     from the Swiper slider div IDs (div_day_N).
  2. For each match day, fetch the AJAX endpoint (?mode=ajax&d=N) which returns
     an HTML fragment of <li class="matchContainer"> elements.
  3. Parse competition info, scores, and status from each match element.
  4. Separate WEリーグ matches from クラシエカップ matches and save to distinct CSVs.

URL pattern:
  Monthly page: {base_url}?s={season_start_year}&y={year}&m={month}
  AJAX day:     {base_url}?s={season_start_year}&y={year}&m={month}&d={day}&mode=ajax

Status detection:
  <div class="teams _game"> -> 試合終了 (completed)
  <div class="teams">       -> ＶＳ (not yet played; site shows "VS" but output uses full-width to match project standard)
"""
import argparse
from datetime import date
import logging
import os
from pathlib import Path
import re
from typing import Any

import bs4
import pandas as pd
import requests

from match_utils import mu, get_season_from_date, CSV_COLUMN_SCHEMA

logger = logging.getLogger(__name__)

# Competition detection
_CUP_KEYWORD = 'カップ'

# Section/round parsing
_SECTION_RE = re.compile(r'第(\d+)節')
_GROUP_RE = re.compile(r'グループ([A-Z])')
_ROUND_SECTION: dict[str, int] = {'準々決勝': 97, '準決勝': 98, '決勝': 99}

# Date extraction from match URL e.g. /matches/2026022820/
_MATCH_DATE_RE = re.compile(r'/matches/(\d{4})(\d{2})(\d{2})\d+/')


def init() -> None:
    """Load config."""
    mu.init_config(Path(__file__).parent / '../config/we_league.yaml')


def _get(url: str) -> bs4.BeautifulSoup:
    """Fetch URL and return parsed BeautifulSoup."""
    logger.debug("GET %s", url)
    resp = requests.get(url, timeout=mu.config.http_timeout)
    resp.raise_for_status()
    return bs4.BeautifulSoup(resp.text, 'lxml')


def _get_match_days(season_start_year: int, year: int, month: int) -> list[int]:
    """Return sorted list of match-day numbers in the given month.

    Fetches the monthly page and extracts day numbers from Swiper slider
    div IDs of the form 'div_day_{N}'.
    """
    url = f"{mu.config.urls.base_url}?s={season_start_year}&y={year}&m={month}"
    soup = _get(url)
    days = []
    for tag in soup.find_all('div', class_='div_day'):
        m = re.search(r'div_day_(\d+)', tag.get('id', ''))
        if m:
            days.append(int(m.group(1)))
    logger.info("%d/%02d: %d match day(s) found", year, month, len(days))
    return sorted(days)


def _parse_section(p_text: str) -> tuple[int | None, str | None, bool]:
    """Parse competition <p> tag text into (section_no, group, is_cup).

    Examples:
      "2025/26 SOMPO WEリーグ 第17節"
        -> (17, None, False)
      "2025/26 WEリーグ クラシエカップ グループステージ グループB 第3節"
        -> (3, "B", True)
      "2025/26 WEリーグ クラシエカップ 準決勝"
        -> (98, None, True)
    """
    is_cup = _CUP_KEYWORD in p_text

    m = _SECTION_RE.search(p_text)
    if m:
        section_no: int | None = int(m.group(1))
    else:
        section_no = next(
            (n for label, n in _ROUND_SECTION.items() if label in p_text), None
        )

    m = _GROUP_RE.search(p_text)
    group = m.group(1) if m else None

    return section_no, group, is_cup


def _parse_score(point_div: bs4.element.Tag) -> dict[str, str]:
    """Parse score/PK score from the .point div.

    Site HTML patterns:
      Normal:   <span>1</span>－<span>0</span>
      PK:       <span>1</span>3PK2<span>1</span>
      Unplayed: VS
    """
    result: dict[str, str] = {
        'home_goal': '', 'away_goal': '',
        'home_pk_score': '', 'away_pk_score': '',
    }
    if point_div.get_text().strip() == 'VS':
        return result

    spans = point_div.find_all('span')
    if len(spans) >= 2:
        result['home_goal'] = spans[0].text.strip()
        result['away_goal'] = spans[1].text.strip()

    # PK scores are in the direct text nodes between the <span> tags,
    # e.g. <span>1</span>3PK2<span>1</span> -> direct text "3PK2"
    between_text = ''.join(
        str(c) for c in point_div.children
        if isinstance(c, bs4.element.NavigableString)
    )
    pk_m = re.search(r'(\d+)PK(\d+)', between_text)
    if pk_m:
        result['home_pk_score'] = pk_m.group(1)
        result['away_pk_score'] = pk_m.group(2)

    return result


def _read_day(
    season_start_year: int, year: int, month: int, day: int,
) -> list[tuple[bool, dict[str, Any]]]:
    """Fetch and parse one day's matches from the AJAX endpoint.

    Returns:
        List of (is_cup, match_dict) tuples.
        match_dict does not yet contain match_index_in_section.
    """
    url = (
        f"{mu.config.urls.base_url}"
        f"?s={season_start_year}&y={year}&m={month}&d={day}&mode=ajax"
    )
    soup = _get(url)
    results: list[tuple[bool, dict[str, Any]]] = []

    for li in soup.find_all('li', class_='matchContainer'):
        inner = li.find('div', class_='match-inner')
        if not inner:
            continue

        # Competition / section info
        date_div = inner.find('div', class_='date')
        p_tag = date_div.find('p') if date_div else None
        p_text = p_tag.text.strip() if p_tag else ''
        section_no, group, is_cup = _parse_section(p_text)

        # Start time and stadium
        stadium_span = date_div.find('span', class_='stadium') if date_div else None
        time_span = stadium_span.find('span', class_='time') if stadium_span else None
        start_time = time_span.text.strip() if time_span else ''
        if stadium_span:
            stadium = stadium_span.get_text().replace(start_time, '').strip()
        else:
            stadium = ''

        teams_div = inner.find('div', class_='teams')
        if not teams_div:
            continue

        # Match date from URL (e.g. /matches/2026022820/)
        link = teams_div.find('a')
        href = link.get('href', '') if link else ''
        date_m = _MATCH_DATE_RE.search(href)
        if date_m:
            match_date = f"{date_m.group(1)}/{date_m.group(2)}/{date_m.group(3)}"
        else:
            match_date = f"{year}/{month:02d}/{day:02d}"

        # Team names
        team_divs = teams_div.find_all('div', class_='team')
        if len(team_divs) < 2:
            logger.warning("Skipping match: fewer than 2 team divs in %s", href)
            continue
        home_team = team_divs[0].find('span', class_='name').text.strip()
        away_team = team_divs[1].find('span', class_='name').text.strip()

        # Score and status: "VS" in point div means unplayed.
        # _game class is NOT a reliable indicator — future matches also carry it.
        point_div = teams_div.find('div', class_='point')
        scores = _parse_score(point_div) if point_div else {}
        point_text = point_div.get_text().strip() if point_div else ''
        status = 'ＶＳ' if point_text == 'VS' else '試合終了'

        record: dict[str, Any] = {
            'match_date': match_date,
            'section_no': section_no,
            'start_time': start_time,
            'stadium': stadium,
            'home_team': home_team,
            'home_goal': scores.get('home_goal', ''),
            'away_goal': scores.get('away_goal', ''),
            'away_team': away_team,
            'status': status,
        }
        if group:
            record['group'] = group
        if scores.get('home_pk_score'):
            record['home_pk_score'] = scores['home_pk_score']
            record['away_pk_score'] = scores['away_pk_score']

        results.append((is_cup, record))

    return results


def read_season(season_str: str) -> tuple[list[dict], list[dict]]:
    """Fetch all matches for the given season.

    Iterates through all 12 months starting from season_start_month,
    fetching each month's match days and their AJAX match data.

    Args:
        season_str: Season string in "YY-YY" format (e.g. "25-26").

    Returns:
        (we_matches, cup_matches): Two lists of match dicts, each
        containing match_index_in_section counted within its own series.
    """
    start_yy = int(season_str.split('-')[0])
    season_start_year = 2000 + start_yy
    start_month = mu.config.season_start_month

    we_matches: list[dict] = []
    cup_matches: list[dict] = []
    # Track match_index_in_section per section, separately for each competition
    we_section_idx: dict[int | None, int] = {}
    cup_section_idx: dict[int | None, int] = {}

    for offset in range(12):
        total = start_month + offset - 1
        year = season_start_year + total // 12
        month = total % 12 + 1

        days = _get_match_days(season_start_year, year, month)
        for day in days:
            for is_cup, record in _read_day(season_start_year, year, month, day):
                section_idx = cup_section_idx if is_cup else we_section_idx
                key = record['section_no']
                section_idx[key] = section_idx.get(key, 0) + 1
                record['match_index_in_section'] = section_idx[key]
                if is_cup:
                    cup_matches.append(record)
                else:
                    we_matches.append(record)

    logger.info(
        "Season %s: %d WEリーグ matches, %d cup matches",
        season_str, len(we_matches), len(cup_matches),
    )
    return we_matches, cup_matches


def _to_df(matches: list[dict]) -> pd.DataFrame:
    """Build a DataFrame from match dicts, ordered by CSV_COLUMN_SCHEMA."""
    df = pd.DataFrame(matches)
    ordered = [c for c in CSV_COLUMN_SCHEMA if c in df.columns]
    extras = [c for c in df.columns if c not in CSV_COLUMN_SCHEMA]
    return df[ordered + extras]


def make_args() -> argparse.Namespace:
    """Argument parser."""
    parser = argparse.ArgumentParser(
        description='Read WE League match data and save as CSV'
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
    logger.info("Processing season %s", _season)

    _we, _cup = read_season(_season)

    _we_csv = mu.config.get_format_str('paths.csv_format', season=_season)
    mu.update_if_diff(_to_df(_we), _we_csv)

    if _cup:
        _cup_df = _to_df(_cup)
        _cup_gs_df = _cup_df[_cup_df['section_no'] < 97].reset_index(drop=True)
        _cup_ko_df = _cup_df[_cup_df['section_no'] >= 97].reset_index(drop=True)

        _cup_csv = mu.config.get_format_str('paths.cup_csv_format', season=_season)
        mu.update_if_diff(_cup_gs_df, _cup_csv)

        if not _cup_ko_df.empty:
            _cup_ko_csv = mu.config.get_format_str('paths.cup_ko_csv_format', season=_season)
            mu.update_if_diff(_cup_ko_df, _cup_ko_csv)
