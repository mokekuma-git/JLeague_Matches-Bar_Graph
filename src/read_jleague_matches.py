"""Read match information of J-League and save as CSV"""
import argparse
from datetime import date
from datetime import datetime
from datetime import timedelta
import os
from pathlib import Path
import re
from typing import Any

from bs4 import BeautifulSoup
import pandas as pd
import pytz
import requests

from set_config import load_config

config = load_config(Path(__file__).parent / '../config/jleague.yaml')

# Type conversion of config values
config.timezone = pytz.timezone(config.timezone)


def get_csv_path(category: str) -> str:
    """Get the path of CSV file from config file.

    Args:
        category (str): Category of J-League (1, 2, 3)

    Returns:
        str: Path of CSV file

    Raises:
        KeyError: If the key 'paths.csv_format' is not found in the config file
    """
    # CSV file path is also the key of Timestamp file, so handle it as a string
    return config.get_format_str('paths.csv_format', season=config.season, category=category)


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


def read_match(category: int, sec: int) -> pd.DataFrame:
    """Read match data for a specified category and section from the web.

    Args:
        category (int): Category of J-League (1, 2, 3)
        sec (int): Section number

    Returns:
        pd.DataFrame: DataFrame containing match data

    Raises:
        KeyError: If the key 'urls.source_url_format' is not found in the config file
    """
    _url = config.get_format_str('urls.source_url_format', category, sec)
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
        section_no = _section.find('div', class_='leagAccTit').find('h5').text.strip()
        section_no = re.search('第(.+)節', section_no)[1]
        # print((match_date, section_no))
        for _tr in _section.find_all('tr'):
            match_dict = {}
            match_dict['match_date'] = match_date
            match_dict['section_no'] = int(section_no)
            match_dict['match_index_in_section'] = _index
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


def read_all_matches(category: int) -> pd.DataFrame:
    """Read all match data for specified category via web.

    Args:
        category (int): Category of J-League (1, 2, 3)

    Returns:
        pd.DataFrame: DataFrame containing all match data
    """
    return read_matches_range(category)


def read_matches_range(category: int, _range: list[int] = None) -> pd.DataFrame:
    """Read match data for specified category and section list from the web.

    Args:
        category (int): Category of J-League (1, 2, 3)
        _range (list[int], optional): List of section numbers. Defaults to None.

    Returns:
        pd.DataFrame: DataFrame containing match data
    """
    _matches = pd.DataFrame()
    if not _range:
        teams_count = len(read_teams(category))
        if teams_count % 2 > 0:
            _range = range(1, teams_count * 2 + 1)
        else:
            _range = range(1, (teams_count - 1) * 2 + 1)

    for _i in _range:
        result_list = read_match(category, _i)
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


def update_all_matches(category: int, force_update: bool = False,
                       need_update: set[int] = None) -> pd.DataFrame:
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
        all_matches = read_all_matches(category)
        update_if_diff(all_matches, latest_file)
        return all_matches

    current = read_allmatches_csv(latest_file)
    if not need_update:  # If no specific sections to update are provided, check automatically
        _lastupdate = get_timestamp_from_csv(latest_file)
        _now = datetime.now().astimezone(config.timezone)
        print(f'  Check matches finished since {_lastupdate}')
        # undecided = get_undecided_section(current)
        need_update = get_sections_to_update(current, _lastupdate, _now)

        # If no sections need to be updated, return the current DataFrame
        if not need_update:
            return current

    diff_matches = read_matches_range(category, need_update)
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

    for _category in parse_range_list(_args.category):
        print(f'Start read J{_category} matches...')

        update_all_matches(_category, force_update=_args.force_update_all, need_update=_args.sections)
