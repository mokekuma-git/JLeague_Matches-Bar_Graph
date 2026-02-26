"""Read ACL group stage match data and save as CSV/JSON"""
import argparse
import datetime
import logging
import os
import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
import pandas as pd
import requests

from match_utils import mu

logger = logging.getLogger(__name__)

def init() -> None:
    """Load config and compute runtime values (season, csv path, etc.)."""
    mu.init_config(Path(__file__).parent / '../config/aclgl.yaml')

    mu.config.season = str(datetime.datetime.now().year)
    mu.config.csv_filename = mu.config.get_format_str('paths.csv_format', season=mu.config.season)


def read_match(section_id: str) -> list[dict[str, Any]]:
    """Read match list for each group of the given section from スポーツナビ.

    Sections 1-6 correspond to mu.config.section_ids respectively.
    """
    _url = mu.config.get_format_str('urls.source_url_format', section_id)
    logger.info("Access %s", _url)
    soup = BeautifulSoup(requests.get(_url, timeout=mu.config.http_timeout).text, 'lxml')
    return read_match_from_web(soup)


def parse_match_date_data(text: str) -> dict[str, str]:
    r"""Parse "date\ntime" text (e.g. 4/16（金）\n4:00) into date and time parts.

    Returns a dict with 'match_date' and 'start_time' keys.
    Values are converted via datetime for validation, then returned as strings.
    """
    (match_date, start_time) = text.split()
    match_date = pd.to_datetime(mu.config.season + '/' + match_date[:match_date.index('（')]).date()
    try:
        start_time = pd.to_datetime(start_time).time()
    except (ValueError, pd.errors.ParserError):
        start_time = pd.to_datetime('00:00').time()
    return {'match_date': match_date, 'start_time': str(start_time)}


def parse_match_result_data(text: str) -> dict[str, str]:
    r"""Parse match result text (e.g. "3 - 1\n試合終了" or "- 試合前") into goals and status.

    Returns a dict with 'home_goal', 'away_goal', and 'status' keys.
    """
    # Normalize spaceless format like "3-1" by inserting spaces around '-'
    text = text.replace('-', ' - ')
    result_list = text.split()
    if len(result_list) <= 3:  # "- 試合前" style (pre-match)
        home_goal = ''
        away_goal = ''
        # result_list[0] is '-'
        match_status = result_list[1]
    else:  # "3 - 1\n試合終了" style (finished)
        home_goal = result_list[0]
        # result_list[2] is '-'
        away_goal = result_list[2]
        match_status = result_list[3]

    return {'home_goal': home_goal, 'away_goal': away_goal, 'status': match_status}


def read_match_from_web(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Parse match list for all groups from the HTML content."""
    result_list = []

    match_groups = soup.find_all('section', class_='sc-modCommon01')
    _index = 1
    for _section in match_groups:
        group = _section.find('header').text.strip()
        group = group.replace('グループ', '')

        match_table = _section.find('tbody')
        _index = 0
        for _match in match_table.find_all('tr'):
            match_dict = {'group': group}
            # Each <tr> represents one match
            td_list = _match.find_all('td')
            # Date & time (e.g. 4/16（金）\n4:00)
            match_dict.update(parse_match_date_data(td_list[0].text))
            # Section (e.g. 第3節)
            match_dict['section_no'] = re.search(r'\d+', td_list[1].text)[0]
            # Home team (e.g. アルヒラル)
            match_dict['home_team'] = td_list[2].text.strip()
            # Match result (e.g. 2 - 2\n試合終了)
            match_dict.update(parse_match_result_data(td_list[3].text))
            # Away team (e.g. イスティクロル)
            match_dict['away_team'] = td_list[4].text.strip()
            # Stadium (e.g. プリンスファイサルビンファハド)
            match_dict['stadium'] = td_list[5].text.strip()
            match_dict['match_index_in_section'] = _index

            result_list.append(match_dict)
            _index += 1
    logger.info("Read %d matches from %d groups", len(result_list), len(match_groups))
    return result_list


def make_args() -> argparse.Namespace:
    """Argument parser."""
    parser = argparse.ArgumentParser(
        description='read_aclgl_matches.py\n'
                    'Read ACL group stage match data and save as CSV/JSON')
    parser.add_argument('-d', '--debug', action='store_true',
                        help='Enable debug output')
    return parser.parse_args()


if __name__ == '__main__':
    os.chdir(Path(__file__).parent.parent)
    init()

    _args = make_args()
    logging.basicConfig(
        level=logging.DEBUG if _args.debug else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )

    match_df = pd.DataFrame()
    for section in mu.config.section_ids:
        match_df = pd.concat([match_df, pd.DataFrame(read_match(section))])

    match_df = match_df.sort_values(['section_no', 'match_index_in_section']) \
        .reset_index(drop=True)
    logger.info("Total %d matches across %d sections", len(match_df), len(mu.config.section_ids))
    mu.update_if_diff(match_df, mu.config.csv_filename)
