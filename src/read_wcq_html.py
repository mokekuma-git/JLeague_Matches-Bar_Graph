"""Scrape WCQ Asian Final Qualifying match results from JFA HTML page.

The JFA schedule.json API only provides Group C data.
This script scrapes Groups A and B from the static HTML result page
and merges them with the existing Group C CSV data.

Usage:
    uv run python src/read_wcq_html.py [-d] [-g A,B]
"""
import argparse
import logging
import os
import re
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

from match_utils import mu

logger = logging.getLogger(__name__)

URL = 'https://www.jfa.jp/samuraiblue/worldcup_2026/final_q_2026/result/'
CSV_PATH = '../docs/csv/2026_allmatch_result-WC_AFC.csv'


def fetch_html(url: str) -> BeautifulSoup:
    """Fetch the HTML page and return a BeautifulSoup object."""
    logger.info("Fetching %s", url)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    resp.encoding = 'utf-8'  # requests misdetects as ISO-8859-1
    return BeautifulSoup(resp.text, 'html.parser')


def parse_group(tab_div) -> tuple[str, list[dict]]:
    """Parse a single group tab div and extract match data.

    Args:
        tab_div: BeautifulSoup element for one tab-contents div.

    Returns:
        Tuple of (group_letter, list of match dicts).
    """
    # Extract group letter from h3 like "Group A"
    h3 = tab_div.find('h3', class_='result-block__ttl')
    group_match = re.search(r'Group\s+([A-Z])', h3.get_text())
    group = group_match.group(1)
    logger.info("Parsing Group %s", group)

    schedule_table = tab_div.find('table', class_='result-block__schedule')
    if schedule_table is None:
        logger.warning("No schedule table found for Group %s", group)
        return group, []

    matches = []
    current_section = 0
    match_index = 0

    for tr in schedule_table.find('tbody').find_all('tr'):
        tds = tr.find_all('td')
        if not tds:
            continue

        # Check if this row starts a new matchday (has MD cell)
        md_td = tr.find('td', class_='md')
        if md_td:
            md_match = re.search(r'MD(\d+)', md_td.get_text())
            if md_match:
                current_section = int(md_match.group(1))
                match_index = 0

        # Find the score cell (contains tdWrap1 with team/score info)
        wrap1 = tr.find('div', class_='tdWrap1')
        if wrap1 is None:
            continue

        match_index += 1

        # Extract team names and score from <ul><li> structure
        li_items = wrap1.find('ul').find_all('li')
        home_team = li_items[0].get_text(strip=True)
        score_text = li_items[1].get_text(strip=True)
        away_team = li_items[2].get_text(strip=True)

        # Parse score
        home_goal = ''
        away_goal = ''
        status = 'ＶＳ'
        score_match = re.match(r'(\d+)-(\d+)', score_text)
        if score_match:
            home_goal = score_match.group(1)
            away_goal = score_match.group(2)
            status = '試合終了'

        # Extract stadium from tdWrap2
        wrap2 = tr.find('div', class_='tdWrap2')
        stadium = wrap2.get_text(strip=True) if wrap2 else ''

        # Extract date - find the td with date pattern YYYY.MM.DD
        # The date td may contain HOME/AWAY icon spans before the date
        date_str = ''
        match_number = ''
        for td in tds:
            if td.get('class') and 'md' in td.get('class', []):
                continue
            td_text = td.get_text(strip=True)
            # Remove HOME/AWAY prefix
            td_text_clean = re.sub(r'^(HOME|AWAY)', '', td_text)
            date_m = re.search(r'(\d{4})\.(\d{2})\.(\d{2})', td_text_clean)
            if date_m:
                date_str = f"{date_m.group(1)}/{date_m.group(2)}/{date_m.group(3)}"
            elif re.match(r'^\d+$', td_text):
                match_number = td_text

        matches.append({
            'match_date': date_str,
            'section_no': current_section,
            'start_time': '',
            'stadium': stadium,
            'home_team': home_team,
            'away_team': away_team,
            'status': status,
            'matchNumber': match_number,
            'home_goal': home_goal,
            'away_goal': away_goal,
            'extraTime': 'False',
            'match_index_in_section': match_index,
            'group': group,
        })

    logger.info("Group %s: parsed %d matches", group, len(matches))
    return group, matches


def scrape_groups(url: str, target_groups: list[str]) -> pd.DataFrame:
    """Scrape match data for the specified groups from the HTML page.

    Args:
        url: URL of the result page.
        target_groups: List of group letters to scrape (e.g. ['A', 'B']).

    Returns:
        DataFrame with scraped match data.
    """
    soup = fetch_html(url)
    tab_divs = soup.find_all('div', class_='tab-contents')

    all_matches = []
    for tab_div in tab_divs:
        group, matches = parse_group(tab_div)
        if group in target_groups:
            all_matches.extend(matches)
            logger.info("Included Group %s (%d matches)", group, len(matches))
        else:
            logger.info("Skipped Group %s (not in target: %s)", group, target_groups)

    return pd.DataFrame(all_matches)


def merge_with_existing(new_df: pd.DataFrame, csv_path: str) -> pd.DataFrame:
    """Merge new group data with existing CSV, replacing groups present in new_df.

    Args:
        new_df: DataFrame with newly scraped data.
        csv_path: Path to the existing CSV file.

    Returns:
        Merged DataFrame sorted by group, section_no, match_index_in_section.
    """
    new_groups = set(new_df['group'].unique())

    if Path(csv_path).exists():
        existing_df = mu.read_allmatches_csv(csv_path)
        # Keep only groups NOT in the new data
        keep_df = existing_df[~existing_df['group'].isin(new_groups)]
        logger.info("Keeping %d existing rows (groups: %s)",
                     len(keep_df),
                     sorted(keep_df['group'].unique()) if len(keep_df) > 0 else 'none')
        merged = pd.concat([keep_df, new_df], ignore_index=True)
    else:
        merged = new_df

    merged = merged.sort_values(
        ['group', 'section_no', 'match_index_in_section']
    ).reset_index(drop=True)

    return merged


def main():
    parser = argparse.ArgumentParser(
        description='Scrape WCQ Asian Final Qualifying results from JFA HTML')
    parser.add_argument('-d', '--debug', action='store_true',
                        help='Enable debug logging')
    parser.add_argument('-g', '--groups', type=str, default='A,B',
                        help='Comma-separated group letters to scrape (default: A,B)')
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )

    target_groups = [g.strip().upper() for g in args.groups.split(',')]

    new_df = scrape_groups(URL, target_groups)
    if new_df.empty:
        logger.warning("No matches scraped. Exiting.")
        return

    merged_df = merge_with_existing(new_df, CSV_PATH)
    logger.info("Total matches after merge: %d", len(merged_df))

    mu.update_if_diff(merged_df, CSV_PATH)


if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    mu.init_config(Path(__file__).parent / '../config/jfamatch.yaml')
    main()
