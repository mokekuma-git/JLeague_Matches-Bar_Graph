"""Read match information of J-League and save as CSV"""
import argparse
from datetime import date
from datetime import datetime
from datetime import timedelta
import json
import os
from pathlib import Path
import re
from typing import Any
import warnings

from bs4 import BeautifulSoup
import pandas as pd
import pytz
import requests

from set_config import load_config

config = load_config(Path(__file__).parent / '../config/jleague.yaml')

# Type conversion of config values
config.timezone = pytz.timezone(config.timezone)


def load_season_map() -> dict:
    """Load season_map.json.

    Returns:
        dict: Season map data keyed by category string ('1', '2', '3')
    """
    season_map_path = config.get_path('paths.season_map_file')
    with open(season_map_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_sub_seasons(category: int) -> list[dict] | None:
    """Get sub-seasons for the given category from season_map.json.

    For years with multiple sub-seasons (e.g. 2026East/2026West),
    returns a list of sub-season info dicts. For single-season years,
    returns an empty list. If no season entry exists for this category,
    returns None (caller should skip this category entirely).

    Args:
        category (int): Category of J-League (1, 2, 3)

    Returns:
        list[dict] | None:
            None       — no season entry for config.season → skip
            []         — single season → use update_all_matches
            [dict,...] — multi-group season → use update_sub_season_matches
    """
    season_map = load_season_map()
    cat_str = str(category)
    if cat_str not in season_map:
        return None

    season_str = str(config.season)
    cat_map = season_map[cat_str]
    sub_keys = sorted(k for k in cat_map if k.startswith(season_str) and k != season_str)

    # No entry at all for this season (neither bare key nor sub-keys)
    if not sub_keys and season_str not in cat_map:
        return None

    if len(sub_keys) <= 1:
        return []

    result = []
    for k in sub_keys:
        entry = cat_map[k]
        info = {
            'name': k,
            'teams': entry[3],
            'team_count': entry[0],
            'group': k[len(season_str):],
        }
        # Read season-specific overrides from index 5
        if len(entry) > 5 and isinstance(entry[5], dict):
            if 'group_display' in entry[5]:
                info['group_display'] = entry[5]['group_display']
            if 'url_category' in entry[5]:
                info['url_category'] = entry[5]['url_category']
        result.append(info)
    return result


def get_csv_path(category: str, season: str = None) -> str:
    """Get the path of CSV file from config file.

    Args:
        category (str): Category of J-League (1, 2, 3)
        season (str, optional): Season name (e.g. '2026East'). Defaults to config.season.

    Returns:
        str: Path of CSV file

    Raises:
        KeyError: If the key 'paths.csv_format' is not found in the config file
    """
    if season is None:
        season = config.season
    # CSV file path is also the key of Timestamp file, so handle it as a string
    return config.get_format_str('paths.csv_format', season=season, category=category)


def get_season_from_date(reference_date: date = None) -> str:
    """Return the season string for the given date.

    Season naming rules:
    - Up to 2025: "YYYY" (4-digit year, calendar-year seasons)
    - 2026 Jan-Jun: "2026" (special transition season before autumn-spring schedule)
    - 2026 Jul onwards: two-digit years format "YY-YY"
    - The boundary month is July (seasons end in May, start in August;
      June and earlier belong to the season that started in the previous calendar year,
      July and later belong to the season starting this year)

    Args:
        reference_date: Date to use as reference. Defaults to today.

    Returns:
        str: Season string (e.g. "2025", "2026", "26-27", "27-28")
    """
    if reference_date is None:
        reference_date = date.today()
    year = reference_date.year
    month = reference_date.month

    if year <= 2025:
        return str(year)

    # 2026 special transition season (Jan-Jun)
    if year == 2026 and month <= 6:
        return "2026"

    # two‑digit year season (2026 Jul+ or 2027+)
    start_year = year if month >= 7 else year - 1
    return f"{start_year % 100:02d}-{(start_year + 1) % 100:02d}"


def read_teams(category: int) -> list[str]:
    """Get the list of teams from the web.

    Args:
        category (int): Category of J-League (1, 2, 3)

    Returns:
        list[str]: List of team names

    Raises:
        KeyError: If the key 'urls.standing_url_format' is not found in the config file
    """
    _url = config.get_format_str('urls.standing_url_format', category)
    print(f'access {_url}...')
    soup = BeautifulSoup(requests.get(_url, timeout=config.http_timeout).text, 'lxml')
    return read_teams_from_web(soup, category)


def read_teams_from_web(soup: BeautifulSoup, category: int) -> list[str]:
    """Get the list of teams from the web data.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data
        category (int): Category of J-League (1, 2, 3)

    Returns:
        list[str]: List of team names

    Raises:
        KeyError: If the key 'urls.standing_url_format' is not found in the config file
    """
    standings = soup.find('table', class_=f'J{category}table')
    if not standings:
        print(f'Can\'t find J{category} teams...')
        return []
    td_teams = standings.find_all('td', class_='tdTeam')
    return [list(_td.stripped_strings)[1] for _td in td_teams]


def read_match(category: int, sec: int, url_category: str = None) -> pd.DataFrame:
    """Read match data for a specified category and section from the web.

    Args:
        category (int): Category of J-League (1, 2, 3)
        sec (int): Section number
        url_category (str, optional): Override category value for URL construction.
            The source_url_format 'j{}/{}/' normally uses the category number,
            e.g. 'j1/1/'. When url_category='2j3', it becomes 'j2j3/1/' instead of 'j2/1/'.

    Returns:
        pd.DataFrame: DataFrame containing match data

    Raises:
        KeyError: If the key 'urls.source_url_format' is not found in the config file
    """
    cat_for_url = url_category if url_category else category
    _url = config.get_format_str('urls.source_url_format', cat_for_url, sec)
    print(f'access {_url}...')
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
            print(f'Warning: No match data in section "{section_no_text}", skipping')
            continue
        section_no = section_no_match[1]
        # print((match_date, section_no))
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
            # str_match_date = (match_date.strftime("%Y/%m/%d") if match_date else '未定')

            _status = _tr.find('td', class_='status')
            match_dict['status'] = \
                _status.text.strip().replace('\n', '') if _status is not None else '不明'

            if config.debug:
                print(match_dict)
            result_list.append(match_dict)
            _index += 1
    print(f'  Read {len(result_list)} matches in section {section_no}')
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


def read_all_matches(category: int, url_category: str = None) -> pd.DataFrame:
    """Read all match data for specified category via web.

    Args:
        category (int): Category of J-League (1, 2, 3)
        url_category (str, optional): Override category value for URL construction.

    Returns:
        pd.DataFrame: DataFrame containing all match data
    """
    return read_matches_range(category, url_category=url_category)


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


def read_matches_range(category: int, _range: list[int] = None,
                       url_category: str = None) -> pd.DataFrame:
    """Read match data for specified category and section list from the web.

    Args:
        category (int): Category of J-League (1, 2, 3)
        _range (list[int], optional): List of section numbers. Defaults to None.
        url_category (str, optional): Override category value for URL construction.

    Returns:
        pd.DataFrame: DataFrame containing match data
    """
    _matches = pd.DataFrame()
    if not _range:
        teams_count = len(read_teams(category))
        _range = _team_count_to_section_range(teams_count)

    for _i in _range:
        result_list = read_match(category, _i, url_category=url_category)
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
                print(f'add "{_sec}" (for match at {_start}-{_end}) between {lastupdate} - {current_time}')
                target_sec.add(_sec)
    target_sec = list(target_sec)
    target_sec.sort()
    return target_sec


def read_latest_allmatches_csv(category: int) -> pd.DataFrame:
    """Read the latest CSV file for the specified category and return it as a DataFrame.

    If no matching file exists, return an empty DataFrame.

    Args:
        category (int): Category of J-League (1, 2, 3)

    Returns:
        pd.DataFrame: DataFrame containing match data, or an empty DataFrame if no file exists

    Raises:
        KeyError: If the key 'paths.csv_format' is not found in the config file
    """
    filename = get_csv_path(category)  # Treat as a string since it is also the key of Timestamp file
    if Path(filename).exists():
        return read_allmatches_csv(filename)
    return pd.DataFrame()


def read_allmatches_csv(matches_file: str) -> pd.DataFrame:
    """Reconstruct the DataFrame structure by reading the CSV file output by read_jleague_matches.py.

    Args:
        matches_file: The name of the file to read

    Returns:
        pd.DataFrame: DataFrame containing match data

    Raises:
        FileNotFoundError: If the specified file does not exist
        ValueError: If the date format is not recognized
        TypeError: If the date format is not recognized
        KeyError: If the DataFrame does not contain 'match_date' or 'section_no' columns
    """
    print(f'match file {matches_file} reading.')
    all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
    if 'index' in all_matches.columns:
        all_matches = all_matches.drop(columns=['index'])
    all_matches['match_date'] = all_matches['match_date'].map(to_datetime_aspossible)
    all_matches['home_goal'] = all_matches['home_goal'].fillna('')
    all_matches['away_goal'] = all_matches['away_goal'].fillna('')
    all_matches['section_no'] = all_matches['section_no'].astype('int')
    all_matches['match_index_in_section'] = all_matches['match_index_in_section'].astype('int')
    # Convert NaN to output as null in JSON
    all_matches = all_matches.where(pd.notnull(all_matches), None)
    return all_matches


def to_datetime_aspossible(val: str) -> str:
    """Convert to Timestamp format as much as possible and output in config.standard_date_format.

    Return the original string if conversion is not possible.

    Args:
        val (str): Date string to be converted

    Returns:
        str: Converted date string in standard format or original string if conversion fails
    """
    try:
        return pd.to_datetime(val).date().strftime(config.standard_date_format)
    except (ValueError, TypeError):
        return val


def update_timestamp(filename: str) -> None:
    """Read the timestamp record file and update the timestamp of the given filename to the current time.

    Args:
        filename (str): Name of the file to update the timestamp for

    Raises:
        ValueError:
        TypeError:
    """
    timestamp_file = config.get_path('paths.timestamp_file')
    if timestamp_file.exists():
        timestamp = pd.read_csv(timestamp_file, index_col=0, parse_dates=[1])
        timestamp['date'] = timestamp['date'].apply(
            lambda x: x.tz_localize(config.timezone) if x.tz is None else x.tz_convert(config.timezone))
        # If the timezone is not set, localize it to config.timezone
        # The timezon from '+09:00' is pytz.FixedOffset(540),
        # which is different from <DstTzInfo 'Asia/Tokyo' JST+9:00:00 STD>
        # obtained from pytz.timezone('Asia/Tokyo'), so tz_convert must be used to convert it.
        # Otherwise, pandas will issue a warning.
        # https://pandas.pydata.org/pandas-docs/stable/user_guide/timeseries.html#timezones

    else:
        timestamp = pd.DataFrame(columns=['date'])
        timestamp.index.name = 'file'
    timestamp.loc[filename] = datetime.now().astimezone(config.timezone)
    if timestamp.index.duplicated().any():  # Check duplicate indexes, keep only the latest value
        print("Notice: Duplicates in timestamp file were consolidated (keeping most recent values)")
        timestamp = drop_duplicated_indexes(timestamp)
    timestamp.to_csv(timestamp_file, lineterminator='\n')


def drop_duplicated_indexes(df: pd.DataFrame) -> pd.DataFrame:
    """For rows in the DataFrame with duplicate 'file' indexes, keep only the latest one based on 'date'.

    Args:
        df (pd.DataFrame): DataFrame with duplicate indexes

    Returns:
        pd.DataFrame: DataFrame with duplicate indexes removed, keeping only the latest one
    """
    # Reset the index to make 'file' a regular column
    if df.index.name != 'file':
        raise ValueError("DataFrame index must be named 'file'")
    df = df.reset_index()
    df = df.sort_values(['file', 'date'], ascending=[True, False])
    df = df.drop_duplicates(subset=['file'], keep='first')

    # Set 'file' back as the index
    df = df.set_index('file')
    return df


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
    lastupdate = get_timestamp_from_csv(csv_path)
    print(f'  Check matches finished since {lastupdate}')
    return get_sections_to_update(current, lastupdate, now)


def _get_sections_for_sub_group(subs: list[dict]) -> set[int] | None:
    """Determine which sections need fetching for a group of sub-seasons sharing a url_category.

    Returns:
        None  — at least one CSV is missing → fetch all sections
        set() — all CSVs are up-to-date → skip
        {5,6} — union of sections that need updating across all sub-seasons
    """
    _now = datetime.now().astimezone(config.timezone)
    sections_needed: set[int] = set()
    for sub in subs:
        csv_path = get_csv_path(sub['category'], sub['name'])
        if not Path(csv_path).exists():
            return None  # Missing CSV → need full fetch
        current = read_allmatches_csv(csv_path)
        sections_needed |= _get_sections_since(csv_path, current, _now)
    return sections_needed


def update_sub_season_matches(category: int, sub_seasons: list[dict],
                              force_update: bool = False,
                              need_update: set[int] = None) -> None:
    """Fetch and distribute match data for a multi-group season.

    Sub-seasons that share the same url_category are fetched together in one
    request per section; the result is then filtered by group_display and
    written to separate CSVs.

    Args:
        category (int): Category of J-League (1, 2, 3)
        sub_seasons (list[dict]): Sub-season info from get_sub_seasons().
        force_update (bool): If True, re-fetch all sections regardless of timestamps.
        need_update (set[int]): If given, fetch only these sections (differential update).
    """
    # Attach category to each sub for _get_sections_for_sub_group
    for sub in sub_seasons:
        sub['category'] = category

    # Group sub-seasons by url_category
    url_cat_groups: dict[str, list[dict]] = {}
    for sub in sub_seasons:
        url_cat = sub.get('url_category', str(category))
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
                print(f'  No updates needed for url_category={url_cat}')
                continue
            else:
                fetch_range = sections
                do_merge = True

        print(f'  Fetching sections {list(fetch_range)} for url_category={url_cat}...')
        fetched = read_matches_range(category, fetch_range, url_category=url_cat)

        # Distribute fetched data to each sub-season CSV
        for sub in subs:
            group_display = sub.get('group_display')
            if group_display:
                sub_data = fetched[fetched['group'] == group_display].copy()
            else:
                sub_data = fetched.copy()

            # Drop 'group' column — sub-season is identified by filename
            if 'group' in sub_data.columns:
                sub_data = sub_data.drop(columns=['group'])

            # Recalculate match_index_in_section within each sub-season
            sub_data = sub_data.sort_values(['section_no', 'match_date', 'home_team'])
            sub_data['match_index_in_section'] = sub_data.groupby('section_no').cumcount() + 1
            sub_data = sub_data.reset_index(drop=True)

            csv_path = get_csv_path(category, sub['name'])
            if do_merge and Path(csv_path).exists():
                current = read_allmatches_csv(csv_path)
                old = current[current['section_no'].isin(fetch_range)]
                if not matches_differ(sub_data, old):
                    print(f'  No changes detected for {sub["name"]}')
                    continue
                merged = pd.concat([current[~current['section_no'].isin(fetch_range)], sub_data]) \
                           .sort_values(['section_no', 'match_index_in_section']) \
                           .reset_index(drop=True)
                update_if_diff(merged, csv_path)
            else:
                update_if_diff(sub_data, csv_path)


def update_all_matches(category: int, force_update: bool = False,
                       need_update: set[int] = None,
                       url_category: str = None) -> pd.DataFrame:
    """
    Fetch incremental match data from the web and apply it to the existing dataset.

    - If no CSV exists yet, download and save all matches.
    - If `need_update` is provided, update only those sections.
    - Otherwise, update sections that have started since the last file timestamp.
    - When changes are detected, save a new timestamped CSV.

    Args:
        category (int): Category of J-League (1, 2, 3)
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
    latest_file = get_csv_path(category)

    # If the file does not exist, read all matches and save them
    if (not Path(latest_file).exists()) or force_update:
        all_matches = read_all_matches(category, url_category=url_category)
        update_if_diff(all_matches, latest_file)
        return all_matches

    current = read_allmatches_csv(latest_file)
    if not need_update:  # If no specific sections to update are provided, check automatically
        _now = datetime.now().astimezone(config.timezone)
        # undecided = get_undecided_section(current)
        need_update = _get_sections_since(latest_file, current, _now)

        # If no sections need to be updated, return the current DataFrame
        if not need_update:
            return current

    diff_matches = read_matches_range(category, need_update, url_category=url_category)
    old_matches = current[current['section_no'].isin(need_update)]
    if matches_differ(diff_matches, old_matches):
        new_matches = pd.concat([current[~current['section_no'].isin(need_update)], diff_matches]) \
                        .sort_values(['section_no', 'match_index_in_section']) \
                        .reset_index(drop=True)
        update_if_diff(new_matches, latest_file)
        return new_matches
    return None


def matches_differ(foo_df: pd.DataFrame, bar_df: pd.DataFrame) -> bool:
    """Return True if two match DataFrames differ (ignoring 'match_index_in_section' and NaNs)."""
    _foo = foo_df.drop(columns=['match_index_in_section']).fillna('')
    _bar = bar_df.drop(columns=['match_index_in_section']).fillna('')
    _foo = _foo.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)
    _bar = _bar.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)

    if not _foo.equals(_bar):
        if config.debug:
            df_comp = _foo.compare(_bar)
            for col_name in df_comp.columns.droplevel(1).unique():
                print(col_name, df_comp[col_name].dropna())
        return True
    return False


def update_if_diff(match_df: pd.DataFrame, filename: str) -> bool:
    """
    Receive a match DataFrame and filename; overwrite the file if contents differ.

    Args:
        match_df (pd.DataFrame): DataFrame containing match data
        filename (str): Name of the file to be updated

    Returns:
        bool: True if the file was created or updated, False if no changes were found.

    Raises:
        ValueError: If no filename is provided.
    """
    # Raise error if filename is missing
    if not filename:
        raise ValueError("Filename is mandatory")

    # If the old file doesn't exist, write new CSV and exit
    if not Path(filename).exists():
        update_csv(match_df, filename)
        return True

    old_df = read_allmatches_csv(filename)
    # Overwrite if there are differences
    if matches_differ(match_df, old_df):
        update_csv(match_df, filename)
        return True

    # No changes found; do nothing
    print(f'No changes found in {filename}')
    return False


def update_csv(match_df: pd.DataFrame, filename: str) -> None:
    """Receive a match DataFrame and filename, and create or update the CSV file.

    Args:
        match_df (pd.DataFrame): DataFrame containing match data
        filename (str): Name of the file to be updated

    Raises:
        ValueError: If no filename is provided
        TypeError: If the timestamp already has a timezone
    """
    print(f'Update {filename}')
    # When the match_date contains only date, it is converted and keeps the original format (date only),
    # but when a string is also included, it seems to output both date and time,
    # so convert the content of match_date to a string before outputting.
    match_df['match_date'] = match_df['match_date'].map(lambda x: str(x) if isinstance(x, date) else x)
    match_df.to_csv(filename, lineterminator='\n')
    update_timestamp(filename)


def get_timestamp_from_csv(filename: str) -> datetime:
    """Read the acquisition time from the match data update timestamp CSV.

    If the file does not exist, return the last modified time of the file.
    If the timestamp is not found, return the last modified time of the file.

    Args:
        filename (str): Name of the file to read the timestamp from

    Returns:
        datetime: Timestamp of the file in local time

    Raises:
        ValueError: If the filename is not found in the timestamp file
        TypeError: If the timestamp already has a timezone
    """
    timestamp_file = config.get_path('paths.timestamp_file')
    if timestamp_file.exists():
        timestamp = pd.read_csv(timestamp_file, index_col=0, parse_dates=[1])
        timestamp = timestamp[~timestamp.index.duplicated(keep="first")]
        if filename in timestamp.index:
            return timestamp.loc[filename]['date']
    # If the TIMESTAMP_FILE file does not exist, or the filename is not found in the file,
    # return the last modified time of the file
    return datetime.fromtimestamp(Path(filename).stat().st_mtime).astimezone(config.timezone)


def parse_range_args(args: str) -> set[int]:
    """Parse a comma-separated list of numeric arguments.

    Accepts a list of numbers and ranges in the format "number-number" and creates a union of all elements.
    '1-3,5,7-10' -> [1, 2, 3, 5, 7, 8, 9, 10]

    Args:
        args (str): Comma-separated list of arguments

    Returns:
        set[int]: Set of integers representing the parsed arguments

    Raises:
        ValueError: If the argument is not a valid integer or range
        TypeError: If the argument is not a valid integer or range
    """
    return parse_range_list(args.split(','))


def parse_range_list(args: str) -> set[int]:
    """Parse a list of arguments.

    Accepts a list of numbers and ranges in the format "number-number" and creates a union of all elements.
    ['1-3', '5', '7-10'] -> [1, 2, 3, 5, 7, 8, 9, 10]

    Args:
        args (str): List of arguments to be parsed

    Returns:
        set[int]: Set of integers representing the parsed arguments

    Raises:
        ValueError: If the argument is not a valid integer or range
        TypeError: If the argument is not a valid integer or range
    """
    result = set()
    for arg in args:
        result |= set(parse_range(arg))
    return sorted(result)


def parse_range(arg: str) -> list[int]:
    """Parse an argument.

    Accepts a number or a range in the format "number-number" and converts it to a list of numbers.
    1-3 -> [1, 2, 3]

    Args:
        arg (str): Argument to be parsed

    Returns:
        list[int]: List of integers representing the parsed argument

    Raises:
        ValueError: If the argument is not a valid integer or range
        TypeError: If the argument is not a valid integer or range
    """
    match = re.match(r'(\d+)\-(\d+)', arg)
    try:
        if match:
            start = int(match[1])
            end = int(match[2])
            return list(range(start, end + 1))

        return [int(arg)]
    except (ValueError, TypeError) as exc:
        print(f"Invalid integer format: {arg}. Must be an integer or a range like '1-3'.")
        raise exc


def make_args() -> argparse.Namespace:
    """Argument parser"""
    parser = argparse.ArgumentParser(
        description='read_jleague_matches.py\n'
                    'Read J-League match information for each category and convert to CSV')

    parser.add_argument('category', default=['1-3'], nargs='*',
                        help='League category (numeric, multiple categories can be specified with - [default: 1-3])')
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
    if _args.debug:
        config.debug = True

    _expected = get_season_from_date()
    if str(config.season) != _expected:
        warnings.warn(
            f'config.season={config.season!r} does not match expected season {_expected!r}',
            stacklevel=1
        )

    for _category in parse_range_list(_args.category):
        print(f'Start read J{_category} matches...')
        _sub_seasons = get_sub_seasons(_category)
        if _sub_seasons is None:
            print(f'  No {config.season} season entry for J{_category} in season_map, skipping.')
        elif _sub_seasons:
            update_sub_season_matches(_category, _sub_seasons,
                                      force_update=_args.force_update_all,
                                      need_update=_args.sections)
        else:
            update_all_matches(_category, force_update=_args.force_update_all,
                               need_update=_args.sections)
