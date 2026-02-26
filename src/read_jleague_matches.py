"""Read match information of J-League and save as CSV"""
import argparse
from datetime import datetime
from datetime import timedelta
import logging
import os
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup
import pandas as pd
import pytz
import requests

from match_utils import mu
from match_utils import get_season_from_date
from match_utils import parse_range_args

logger = logging.getLogger(__name__)

config = mu.init_config(Path(__file__).parent / '../config/jleague.yaml')

# Type conversion of config values
config.timezone = pytz.timezone(config.timezone)


def read_teams(competition: str) -> list[str]:
    """Get the list of teams from the web.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        list[str]: List of team names

    Raises:
        KeyError: If the key 'urls.standing_url_format' is not found in the config file
    """
    _url = config.get_format_str('urls.standing_url_format',
                                 competition.lower())
    logger.info("Access %s", _url)
    soup = BeautifulSoup(requests.get(_url, timeout=config.http_timeout).text, 'lxml')
    teams = read_teams_from_web(soup, competition)
    logger.info("Read %d teams for %s", len(teams), competition)
    return teams


def read_teams_from_web(soup: BeautifulSoup, competition: str) -> list[str]:
    """Get the list of teams from the web data.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        list[str]: List of team names

    Raises:
        KeyError: If the key 'urls.standing_url_format' is not found in the config file
    """
    standings = soup.find('table', class_=f'{competition}table')
    if not standings:
        logger.warning("Can't find %s teams", competition)
        return []
    td_teams = standings.find_all('td', class_='tdTeam')
    return [list(_td.stripped_strings)[1] for _td in td_teams]


def read_match(competition: str, sec: int, url_category: str = None) -> pd.DataFrame:
    """Read match data for a specified competition and section from the web.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        sec (int): Section number
        url_category (str, optional): Override category value for URL construction.
            The source_url_format '{}/{}/' normally uses the lowercased
            competition key, e.g. 'j1/1/'. When url_category='j2j3', it
            becomes 'j2j3/1/' instead.

    Returns:
        pd.DataFrame: DataFrame containing match data

    Raises:
        KeyError: If the key 'urls.source_url_format' is not found in the config file
    """
    cat_for_url = url_category if url_category else competition.lower()
    _url = config.get_format_str('urls.source_url_format', cat_for_url, sec)
    logger.info("Access %s", _url)
    soup = BeautifulSoup(requests.get(_url, timeout=config.http_timeout).text, 'lxml')
    return read_match_from_web(soup)


def read_match_from_web(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Read and return match information from J-League match list.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data

    Returns:
        list[dict[str, Any]]: List of dictionaries containing match information
    """
    result_list = []

    match_sections = soup.find_all('section', class_='matchlistWrap')
    section_no = None
    _index = 1
    for _section in match_sections:
        match_div = _section.find('div', class_='timeStamp')
        if match_div:
            match_date = match_div.find('h4').text.strip()
            match_date = convert_jleague_date(match_date)
        else:
            match_date = None
        section_no_text = _section.find('div', class_='leagAccTit').find('h5').text.strip()
        section_no_match = re.search('第(.+)節', section_no_text)
        if section_no_match is None:
            # Check if there are actual match rows on the page
            if _section.find('td', class_='clubName leftside'):
                raise ValueError(
                    f'Could not parse section_no from "{section_no_text}" '
                    'but match data exists on the page')
            logger.warning("No match data in section \"%s\", skipping", section_no_text)
            continue
        section_no = section_no_match[1]
        group = None  # Track current group from groupHead headers (e.g., EAST, WEST)
        for _tr in _section.find_all('tr'):
            # Track group headers
            group_th = _tr.find('th', class_='groupHead')
            if group_th:
                group = group_th.text.strip()
                continue

            match_dict = {}
            match_dict['match_date'] = match_date
            match_dict['section_no'] = int(section_no)
            match_dict['match_index_in_section'] = _index
            if group:
                match_dict['group'] = group
            stadium_td = _tr.find('td', class_='stadium')
            if not stadium_td:
                continue
            _match = re.search(r'([^\>]+)\<br', str(stadium_td))
            match_dict['start_time'] = _match[1] if _match else ""
            _match = re.search(r'([^\>]+)\<\/a', str(stadium_td))
            match_dict['stadium'] = _match[1] if _match else ""
            match_dict['home_team'] = _tr.find('td', class_='clubName leftside').text.strip()
            match_dict['home_goal'] = _tr.find('td', class_='point leftside').text.strip()
            match_dict['away_goal'] = _tr.find('td', class_='point rightside').text.strip()
            match_dict['away_team'] = _tr.find('td', class_='clubName rightside').text.strip()

            _status = _tr.find('td', class_='status')
            match_dict['status'] = \
                _status.text.strip().replace('\n', '') if _status is not None else '不明'
            pk_match = re.search(r'試合終了\((\d+) PK (\d+)\)', match_dict['status'])
            match_dict['home_pk_score'] = str(int(pk_match[1])) if pk_match else ''
            match_dict['away_pk_score'] = str(int(pk_match[2])) if pk_match else ''

            logger.debug("%s", match_dict)
            result_list.append(match_dict)
            _index += 1
    logger.info("Read %d matches in section %s", len(result_list), section_no)
    return result_list


def convert_jleague_date(match_date: str) -> str:
    """Convert J-League match date to standard format

    Converts J-League date format like "2025年3月1日(土)" to our standard format "2025/03/01"

    Args:
        match_date (str): J-League match date string

    Returns:
        str: Converted date string in standard format

    Raises:
        ValueError: If the date format is not recognized
        TypeError: If the date format is not recognized
    """
    _date = datetime.strptime(match_date[:match_date.index('(')], config.jleague_date_format)
    return _date.strftime(config.standard_date_format)


def read_all_matches(competition: str, url_category: str = None) -> pd.DataFrame:
    """Read all match data for specified competition via web.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        url_category (str, optional): Override category value for URL construction.

    Returns:
        pd.DataFrame: DataFrame containing all match data
    """
    return read_matches_range(competition, url_category=url_category)


def _team_count_to_section_range(team_count: int) -> range:
    """Convert team count to full home-and-away section range (1-based).

    Args:
        team_count (int): Number of teams in the league.

    Returns:
        range: Range of section numbers.
    """
    if team_count % 2 > 0:
        return range(1, team_count * 2 + 1)
    return range(1, (team_count - 1) * 2 + 1)


def read_matches_range(competition: str, _range: list[int] = None,
                       url_category: str = None) -> pd.DataFrame:
    """Read match data for specified competition and section list from the web.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        _range (list[int], optional): List of section numbers. Defaults to None.
        url_category (str, optional): Override category value for URL construction.

    Returns:
        pd.DataFrame: DataFrame containing match data
    """
    _matches = pd.DataFrame()
    if not _range:
        teams_count = len(read_teams(competition))
        _range = _team_count_to_section_range(teams_count)

    for _i in _range:
        result_list = read_match(competition, _i, url_category=url_category)
        _matches = pd.concat([_matches, pd.DataFrame(result_list)])
    # A common mistake is not saving the result of sort or reset_index operations
    _matches = _matches.sort_values(['section_no', 'match_index_in_section']).reset_index(drop=True)
    return _matches


def get_undecided_section(all_matches: pd.DataFrame) -> set[str]:
    """Return sections with undecided match dates.

    Args:
        all_matches (pd.DataFrame): DataFrame containing all match data

    Returns:
        set[str]: Set of section numbers with undecided match dates
    """
    return set(all_matches[all_matches['match_date'].isnull()]['section_no'])


def get_match_dates_of_section(all_matches: pd.DataFrame) -> dict[str, list[pd.Timestamp]]:
    """Get the list of match dates for each section.

    Ignores matches with undecided dates

    Args:
        all_matches (pd.DataFrame): DataFrame containing all match data

    Returns:
        dict: Dictionary with section numbers as keys and lists of match dates as values
        ex) {'1': [2023-03-01, 2023-03-02], '2': [2023-03-03, 2023-03-04]}

    Raises:
        AttributeError: start_time column contains non-string values
        ParserError: the date data is not in the correct format (date, string except for '未定')
        ValueError: the date data is not in the correct format (date, string except for '未定')
        TypeError: The timestamp already has a timezone
        KeyError: DataFrame does not contain 'start_time' or 'match_date' columns
   """
    matches_with_date = all_matches.dropna(subset=['match_date'])
    grouped_by_section = matches_with_date.groupby('section_no')
    kickoff_times = grouped_by_section.apply(make_kickoff_time, include_groups=False)
    return kickoff_times.to_dict()


def make_kickoff_time(_subset: pd.DataFrame) -> list[pd.Timestamp]:
    """Return a list of kickoff times for the given match data.

    Create kickoff times from the given match data and return a list of times 2 hours later (assumed match end time).
    The given match data is assumed to be from the same section.
    If the start_time is '未定', it is replaced with '00:00' (midnight).
    The resulting list is sorted and duplicates are removed.

    Args:
        _subset: DataFrame containing match data for a specific section
    Returns:
        list: List of kickoff times for the given match data

    Raises:
        AttributeError: If the start_time column contains non-string values
        ParserError: If the date data is not in the correct format (date, or strings other than '未定')
        ValueError: If the date data is not in the correct format (date, or strings other than '未定')
        TypeError: If the timestamp already has a timezone
        KeyError: If the DataFrame does not contain 'start_time' or 'match_date' columns
    """
    start_time = _subset['start_time'].str.replace('未定', '00:00')
    result = pd.to_datetime(_subset['match_date'] + ' ' + start_time)
    result = result.dt.tz_localize(config.timezone).sort_values().drop_duplicates()
    return list(result)


def get_sections_to_update(all_matches: pd.DataFrame,
                           lastupdate: pd.Timestamp, current_time: pd.Timestamp) -> set[str]:
    """Return a set of sections where matches started within the target period from start to end.

    Args:
        all_matches: All match data
        lastupdate: Start time for update check
        current_time: End time for update check

    Returns:
        A sorted list of sections where matches started within the target period.

    Raises:
        AttributeError: If the start_time column contains non-string values
        ParserError: If the date data is not in the correct format (date, or strings other than '未定')
        ValueError: If the date data is not in the correct format (date, or strings other than '未定')
        TypeError: If the timestamp already has a timezone
        KeyError: If the DataFrame does not contain 'start_time' or 'match_date' columns
    """
    target_sec = set()
    for (_sec, _dates) in get_match_dates_of_section(all_matches).items():
        for _start in _dates:
            _end = _start + timedelta(hours=2)
            if lastupdate <= _end and _start <= current_time:
                logger.info("Add section \"%s\" (match at %s-%s) between %s - %s",
                            _sec, _start, _end, lastupdate, current_time)
                target_sec.add(_sec)
    target_sec = list(target_sec)
    target_sec.sort()
    return target_sec


def read_latest_allmatches_csv(competition: str) -> pd.DataFrame:
    """Read the latest CSV file for the specified competition and return it as a DataFrame.

    If no matching file exists, return an empty DataFrame.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        pd.DataFrame: DataFrame containing match data, or an empty DataFrame if no file exists

    Raises:
        KeyError: If the key 'paths.csv_format' is not found in the config file
    """
    filename = mu.get_csv_path(competition)  # Treat as a string since it is also the key of Timestamp file
    if Path(filename).exists():
        return mu.read_allmatches_csv(filename)
    return pd.DataFrame()


def _calc_section_range(sub_seasons: list[dict]) -> range:
    """Calculate the full section range from team_count in season_map sub-seasons.

    Args:
        sub_seasons (list[dict]): Sub-season info list from get_sub_seasons().

    Returns:
        range: Range of section numbers (1-based).
    """
    max_team_count = max(s['team_count'] for s in sub_seasons)
    return _team_count_to_section_range(max_team_count)


def _get_sections_since(csv_path: str, current: pd.DataFrame, now: datetime) -> set[int]:
    """Get sections that started since the last CSV update.

    Args:
        csv_path (str): Path to the CSV file (used to look up the timestamp).
        current (pd.DataFrame): Match data already loaded from csv_path.
        now (datetime): Current time (timezone-aware).

    Returns:
        set[int]: Set of section numbers that need updating.
    """
    lastupdate = mu.get_timestamp_from_csv(csv_path)
    logger.info("Check matches finished since %s", lastupdate)
    return get_sections_to_update(current, lastupdate, now)


def _get_sections_for_sub_group(subs: list[dict]) -> set[int] | None:
    """Determine which sections need fetching for a group of sub-seasons sharing a url_category.

    Returns:
        None  -- at least one CSV is missing -> fetch all sections
        set() -- all CSVs are up-to-date -> skip
        {5,6} -- union of sections that need updating across all sub-seasons
    """
    _now = datetime.now().astimezone(config.timezone)
    sections_needed: set[int] = set()
    for sub in subs:
        csv_path = mu.get_csv_path(sub['competition'], sub['name'])
        if not Path(csv_path).exists():
            return None  # Missing CSV -> need full fetch
        current = mu.read_allmatches_csv(csv_path)
        sections_needed |= _get_sections_since(csv_path, current, _now)
    return sections_needed


def update_sub_season_matches(competition: str, sub_seasons: list[dict],
                              force_update: bool = False,
                              need_update: set[int] = None) -> None:
    """Fetch and distribute match data for a multi-group season.

    Sub-seasons that share the same url_category are fetched together in one
    request per section; the result is then filtered by group_display and
    written to separate CSVs.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        sub_seasons (list[dict]): Sub-season info from get_sub_seasons().
        force_update (bool): If True, re-fetch all sections regardless of timestamps.
        need_update (set[int]): If given, fetch only these sections (differential update).
    """
    # Attach competition to each sub for _get_sections_for_sub_group
    for sub in sub_seasons:
        sub['competition'] = competition

    # Group sub-seasons by url_category
    url_cat_groups: dict[str, list[dict]] = {}
    for sub in sub_seasons:
        url_cat = sub.get('url_category', competition.lower())
        url_cat_groups.setdefault(url_cat, []).append(sub)

    for url_cat, subs in url_cat_groups.items():
        # Determine sections to fetch
        if force_update:
            fetch_range = _calc_section_range(subs)
            do_merge = False
        elif need_update is not None:
            fetch_range = need_update
            do_merge = True
        else:
            sections = _get_sections_for_sub_group(subs)
            if sections is None:
                fetch_range = _calc_section_range(subs)
                do_merge = False
            elif not sections:
                logger.info("No updates needed for url_category=%s", url_cat)
                continue
            else:
                fetch_range = sections
                do_merge = True

        logger.info("Fetching sections %s for url_category=%s", list(fetch_range), url_cat)
        fetched = read_matches_range(competition, fetch_range, url_category=url_cat)

        # Distribute fetched data to each sub-season CSV
        for sub in subs:
            group_display = sub.get('group_display')
            if group_display:
                sub_data = fetched[fetched['group'] == group_display].copy()
            else:
                sub_data = fetched.copy()

            # Drop 'group' column -- sub-season is identified by filename
            if 'group' in sub_data.columns:
                sub_data = sub_data.drop(columns=['group'])

            # Recalculate match_index_in_section within each sub-season
            sub_data = sub_data.sort_values(['section_no', 'match_date', 'home_team'])
            sub_data['match_index_in_section'] = sub_data.groupby('section_no').cumcount() + 1
            sub_data = sub_data.reset_index(drop=True)

            csv_path = mu.get_csv_path(competition, sub['name'])
            if do_merge and Path(csv_path).exists():
                current = mu.read_allmatches_csv(csv_path)
                old = current[current['section_no'].isin(fetch_range)]
                if not mu.matches_differ(sub_data, old):
                    logger.info("No changes detected for %s", sub["name"])
                    continue
                merged = pd.concat([current[~current['section_no'].isin(fetch_range)], sub_data]) \
                           .sort_values(['section_no', 'match_index_in_section']) \
                           .reset_index(drop=True)
                mu.update_if_diff(merged, csv_path)
            else:
                mu.update_if_diff(sub_data, csv_path)


def update_all_matches(competition: str, force_update: bool = False,
                       need_update: set[int] = None,
                       url_category: str = None) -> pd.DataFrame:
    """
    Fetch incremental match data from the web and apply it to the existing dataset.

    - If no CSV exists yet, download and save all matches.
    - If `need_update` is provided, update only those sections.
    - Otherwise, update sections that have started since the last file timestamp.
    - When changes are detected, save a new timestamped CSV.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        force_update (bool): Force update all matches regardless of changes
        need_update (set[int]): Sections to be updated
        url_category (str, optional): Override category value for URL construction.

    Returns:
        pd.DataFrame: Updated DataFrame containing match data

    Raises:
        ValueError: If no filename is provided
        TypeError: If the timestamp already has a timezone
        KeyError: DataFrame does not contain 'start_time' or 'match_date' columns
        AttributeError: start_time column contains non-string values
        ParserError: the date data is not in the correct format (date, string except for '未定')
        ValueError: the date data is not in the correct format (date, string except for '未定')
    """
    latest_file = mu.get_csv_path(competition)

    # If the file does not exist, read all matches and save them
    if (not Path(latest_file).exists()) or force_update:
        all_matches = read_all_matches(competition, url_category=url_category)
        mu.update_if_diff(all_matches, latest_file)
        return all_matches

    current = mu.read_allmatches_csv(latest_file)
    if not need_update:  # If no specific sections to update are provided, check automatically
        _now = datetime.now().astimezone(config.timezone)
        # undecided = get_undecided_section(current)
        need_update = _get_sections_since(latest_file, current, _now)

        # If no sections need to be updated, return the current DataFrame
        if not need_update:
            return current

    diff_matches = read_matches_range(competition, need_update, url_category=url_category)
    old_matches = current[current['section_no'].isin(need_update)]
    if mu.matches_differ(diff_matches, old_matches):
        new_matches = pd.concat([current[~current['section_no'].isin(need_update)], diff_matches]) \
                        .sort_values(['section_no', 'match_index_in_section']) \
                        .reset_index(drop=True)
        mu.update_if_diff(new_matches, latest_file)
        return new_matches
    return None


def make_args() -> argparse.Namespace:
    """Argument parser"""
    parser = argparse.ArgumentParser(
        description='read_jleague_matches.py\n'
                    'Read J-League match information for each competition and convert to CSV')

    parser.add_argument('competition', default=['J1', 'J2', 'J3'], nargs='*',
                        help='Competition key (e.g. J1 J2 J3)')
    parser.add_argument('-f', '--force_update_all', action='store_true',
                        help='Force update all matches regardless of changes')
    parser.add_argument('-s', '--sections', type=parse_range_args,
                        help='Update specific sections (comma-separated numbers, range specified with'
                        ' - ex) 1,10-15,20) [default: all sections]')
    parser.add_argument('-d', '--debug', action='store_true',
                        help='Debug mode (print debug information)')

    return parser.parse_args()


if __name__ == '__main__':
    os.chdir(Path(__file__).parent)

    _args = make_args()
    logging.basicConfig(
        level=logging.DEBUG if _args.debug else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )

    _start_month = mu.resolve_season_start_month()
    _expected = get_season_from_date(season_start_month=_start_month)
    if str(config.season) != _expected:
        logger.warning("config.season=%r does not match expected season %r",
                        config.season, _expected)

    for _comp in _args.competition:
        logger.info("Start read %s matches", _comp)
        _sub_seasons = mu.get_sub_seasons(_comp)
        if _sub_seasons is None:
            logger.info("No %s season entry for %s in season_map, skipping",
                        config.season, _comp)
        elif _sub_seasons:
            update_sub_season_matches(_comp, _sub_seasons,
                                      force_update=_args.force_update_all,
                                      need_update=_args.sections)
        else:
            update_all_matches(_comp, force_update=_args.force_update_all,
                               need_update=_args.sections)
