"""Shared utilities for match CSV processing across all competitions.

Provides CSV I/O, timestamp management, DataFrame comparison, date parsing,
season-map loading, and CLI argument parsing utilities.  Competition-specific
logic lives in dedicated scripts (e.g. read_jleague_matches.py,
read_jfamatch.py).

Callers must set ``match_utils.config`` to a loaded Config instance before
calling functions that depend on it (marked in docstrings).
"""
from datetime import date
from datetime import datetime
import json
from pathlib import Path
import re

import pandas as pd

from set_config import Config


# Module-level config -- set by the importing script (e.g. read_jleague_matches.py)
config: Config | None = None


# ---------------------------------------------------------------------------
# Season-map loading
# ---------------------------------------------------------------------------
def load_season_map(group_key: str = 'jleague') -> dict:
    """Load season_map.json and extract competitions for the given group.

    The 4-tier JSON has the structure:
        { group_key: { "competitions": { "J1": { "seasons": {...} }, ... } } }

    This function flattens it to:
        { "J1": { "2026East": [...], ... }, "J2": {...}, ... }

    Requires: config set.

    Args:
        group_key: Top-level group key in season_map.json (default: 'jleague')

    Returns:
        dict: Competition key -> {season_name: RawSeasonEntry}
    """
    cfg = config
    season_map_path = cfg.get_path('paths.season_map_file')
    with open(season_map_path, 'r', encoding='utf-8') as f:
        raw = json.load(f)
    group = raw.get(group_key, {}).get('competitions', {})
    return {comp_key: comp.get('seasons', {})
            for comp_key, comp in group.items()}


def get_sub_seasons(competition: str, group_key: str = 'jleague') -> list[dict] | None:
    """Get sub-seasons for the given competition from season_map.json.

    For years with multiple sub-seasons (e.g. 2026East/2026West),
    returns a list of sub-season info dicts. For single-season years,
    returns an empty list. If no season entry exists for this competition,
    returns None (caller should skip this competition entirely).

    Requires: config set.

    Args:
        competition: Competition key (e.g. 'J1', 'J2', 'J3')
        group_key: Top-level group key in season_map.json (default: 'jleague')

    Returns:
        list[dict] | None:
            None       -- no season entry for config.season -> skip
            []         -- single season -> use standard update
            [dict,...] -- multi-group season -> use sub-season update
    """
    cfg = config
    season_map = load_season_map(group_key)
    if competition not in season_map:
        return None

    season_str = str(cfg.season)
    comp_seasons = season_map[competition]
    sub_keys = sorted(k for k in comp_seasons if k.startswith(season_str) and k != season_str)

    # No entry at all for this season (neither bare key nor sub-keys)
    if not sub_keys and season_str not in comp_seasons:
        return None

    if len(sub_keys) <= 1:
        return []

    result = []
    for k in sub_keys:
        entry = comp_seasons[k]
        info = {
            'name': k,
            'teams': entry[3],
            'team_count': entry[0],
            'group': k[len(season_str):],
        }
        # Read season-specific overrides from index 4 (merged optional dict)
        if len(entry) > 4 and isinstance(entry[4], dict):
            opts = entry[4]
            if 'group_display' in opts:
                info['group_display'] = opts['group_display']
            if 'url_category' in opts:
                info['url_category'] = opts['url_category']
        result.append(info)
    return result


def get_csv_path(competition: str, season: str = None) -> str:
    """Get the path of CSV file from config file.

    Requires: config set.

    Args:
        competition: Competition key (e.g. 'J1', 'J2', 'J3')
        season: Season name (e.g. '2026East'). Defaults to config.season.

    Returns:
        str: Path of CSV file

    Raises:
        KeyError: If the key 'paths.csv_format' is not found in the config file
    """
    cfg = config
    if season is None:
        season = cfg.season
    # CSV file path is also the key of Timestamp file, so handle it as a string
    return cfg.get_format_str('paths.csv_format', season=season, competition=competition)


def get_season_from_date(reference_date: date = None, season_start_month: int = 7) -> str:
    """Return the season string for the given date.

    Season naming rules:
    - season_start_month == 1 (calendar-year): "YYYY" (e.g. "2025", "2026")
    - season_start_month != 1 (cross-year): "YY-YY" (e.g. "26-27", "27-28")
      Months before start_month belong to the previous season.

    Args:
        reference_date: Date to use as reference. Defaults to today.
        season_start_month: Month when the season starts (1-12). Default 7.

    Returns:
        str: Season string (e.g. "2025", "2026", "26-27", "27-28")
    """
    if reference_date is None:
        reference_date = date.today()
    year = reference_date.year
    month = reference_date.month

    if season_start_month == 1:
        return str(year)

    start_year = year if month >= season_start_month else year - 1
    return f"{start_year % 100:02d}-{(start_year + 1) % 100:02d}"


def resolve_season_start_month(group_key: str = 'jleague') -> int:
    """Resolve season_start_month for config.season via cascade.

    Looks up the matching season entry in season_map.json and resolves
    the season_start_month by cascading Group → Competition → SeasonEntry.
    Code default is 7 (autumn-spring, world standard).

    Requires: config set.

    Args:
        group_key: Top-level group key in season_map.json (default: 'jleague')

    Returns:
        int: The effective season_start_month for the current config.season.
    """
    cfg = config
    season_map_path = cfg.get_path('paths.season_map_file')
    with open(season_map_path, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    group = raw.get(group_key, {})
    group_val = group.get('season_start_month', 7)  # code default

    season_str = str(cfg.season)
    for comp in group.get('competitions', {}).values():
        comp_val = comp.get('season_start_month', group_val)
        for sk, entry in comp.get('seasons', {}).items():
            if sk.startswith(season_str):
                if len(entry) > 4 and isinstance(entry[4], dict):
                    return entry[4].get('season_start_month', comp_val)
                return comp_val
    return group_val


# ---------------------------------------------------------------------------
# CSV column schema
# ---------------------------------------------------------------------------
# Schema for CSV output columns: column_name -> type string.
#   'int'          : always an integer (section_no, match_index_in_section, etc.)
#   'nullable_int' : integer when the match has been played, empty string otherwise
#                    (home_goal, away_goal, etc.)
#   'str'          : plain string
# Extend this dict whenever a new column is added to the CSV.
CSV_COLUMN_SCHEMA: dict[str, str] = {
    'match_date': 'str',
    'section_no': 'int',
    'match_index_in_section': 'int',
    'start_time': 'str',
    'stadium': 'str',
    'home_team': 'str',
    'home_goal': 'nullable_int',
    'away_goal': 'nullable_int',
    'away_team': 'str',
    'status': 'str',
    'group': 'str',
}


# ---------------------------------------------------------------------------
# DataFrame normalisation
# ---------------------------------------------------------------------------
def _normalize_df_for_csv(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize DataFrame columns to their declared types before CSV output.

    Converts 'nullable_int' columns from float-format strings (e.g. '2.0')
    to plain integer strings ('2'), leaving empty strings unchanged.
    Only columns present in the DataFrame and listed in CSV_COLUMN_SCHEMA
    are processed.

    Args:
        df (pd.DataFrame): Match DataFrame to normalize.

    Returns:
        pd.DataFrame: Normalized copy of the DataFrame.
    """
    df = df.copy()
    for col, dtype in CSV_COLUMN_SCHEMA.items():
        if col not in df.columns:
            continue
        if dtype == 'nullable_int':
            df[col] = df[col].fillna('').apply(
                lambda x: str(int(float(x))) if x != '' else x
            )
    return df


# ---------------------------------------------------------------------------
# Date utilities
# ---------------------------------------------------------------------------
def to_datetime_aspossible(val: str) -> str:
    """Convert to Timestamp format as much as possible and output in config.standard_date_format.

    Return the original string if conversion is not possible.

    Requires: init() called.

    Args:
        val (str): Date string to be converted

    Returns:
        str: Converted date string in standard format or original string if conversion fails
    """
    cfg = config
    try:
        return pd.to_datetime(val).date().strftime(cfg.standard_date_format)
    except (ValueError, TypeError):
        return val


# ---------------------------------------------------------------------------
# CSV I/O
# ---------------------------------------------------------------------------
def read_allmatches_csv(matches_file: str) -> pd.DataFrame:
    """Reconstruct the DataFrame structure by reading a match CSV file.

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


def update_csv(match_df: pd.DataFrame, filename: str) -> None:
    """Receive a match DataFrame and filename, and create or update the CSV file.

    Requires: init() called.

    Args:
        match_df (pd.DataFrame): DataFrame containing match data
        filename (str): Name of the file to be updated

    Raises:
        ValueError: If no filename is provided
        TypeError: If the timestamp already has a timezone
    """
    print(f'Update {filename}')
    # Normalize column types (e.g. convert float-format goal strings to int strings).
    match_df = _normalize_df_for_csv(match_df)
    # When the match_date contains only date, it is converted and keeps the original format (date only),
    # but when a string is also included, it seems to output both date and time,
    # so convert the content of match_date to a string before outputting.
    match_df['match_date'] = match_df['match_date'].map(lambda x: str(x) if isinstance(x, date) else x)
    match_df.to_csv(filename, lineterminator='\n')
    update_timestamp(filename)


# ---------------------------------------------------------------------------
# DataFrame comparison
# ---------------------------------------------------------------------------
def matches_differ(foo_df: pd.DataFrame, bar_df: pd.DataFrame) -> bool:
    """Return True if two match DataFrames differ (ignoring 'match_index_in_section' and NaNs).

    Requires: init() called (for debug output).
    """
    cfg = config
    _foo = foo_df.drop(columns=['match_index_in_section']).fillna('')
    _bar = bar_df.drop(columns=['match_index_in_section']).fillna('')
    _foo = _foo.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)
    _bar = _bar.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)

    if not _foo.equals(_bar):
        if cfg.debug:
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


# ---------------------------------------------------------------------------
# Timestamp management
# ---------------------------------------------------------------------------
def update_timestamp(filename: str) -> None:
    """Read the timestamp record file and update the timestamp of the given filename to the current time.

    Requires: init() called.

    Args:
        filename (str): Name of the file to update the timestamp for

    Raises:
        ValueError:
        TypeError:
    """
    cfg = config
    timestamp_file = cfg.get_path('paths.timestamp_file')
    if timestamp_file.exists():
        timestamp = pd.read_csv(timestamp_file, index_col=0, parse_dates=[1])
        timestamp['date'] = timestamp['date'].apply(
            lambda x: x.tz_localize(cfg.timezone) if x.tz is None else x.tz_convert(cfg.timezone))
        # If the timezone is not set, localize it to config.timezone
        # The timezon from '+09:00' is pytz.FixedOffset(540),
        # which is different from <DstTzInfo 'Asia/Tokyo' JST+9:00:00 STD>
        # obtained from pytz.timezone('Asia/Tokyo'), so tz_convert must be used to convert it.
        # Otherwise, pandas will issue a warning.
        # https://pandas.pydata.org/pandas-docs/stable/user_guide/timeseries.html#timezones

    else:
        timestamp = pd.DataFrame(columns=['date'])
        timestamp.index.name = 'file'
    timestamp.loc[filename] = datetime.now().astimezone(cfg.timezone)
    if timestamp.index.duplicated().any():  # Check duplicate indexes, keep only the latest value
        print("Notice: Duplicates in timestamp file were consolidated (keeping most recent values)")
        timestamp = drop_duplicated_indexes(timestamp)
    timestamp.to_csv(timestamp_file, lineterminator='\n')


def get_timestamp_from_csv(filename: str) -> datetime:
    """Read the acquisition time from the match data update timestamp CSV.

    If the file does not exist, return the last modified time of the file.
    If the timestamp is not found, return the last modified time of the file.

    Requires: init() called.

    Args:
        filename (str): Name of the file to read the timestamp from

    Returns:
        datetime: Timestamp of the file in local time

    Raises:
        ValueError: If the filename is not found in the timestamp file
        TypeError: If the timestamp already has a timezone
    """
    cfg = config
    timestamp_file = cfg.get_path('paths.timestamp_file')
    if timestamp_file.exists():
        timestamp = pd.read_csv(timestamp_file, index_col=0, parse_dates=[1])
        timestamp = timestamp[~timestamp.index.duplicated(keep="first")]
        if filename in timestamp.index:
            return timestamp.loc[filename]['date']
    # If the TIMESTAMP_FILE file does not exist, or the filename is not found in the file,
    # return the last modified time of the file
    return datetime.fromtimestamp(Path(filename).stat().st_mtime).astimezone(cfg.timezone)


# ---------------------------------------------------------------------------
# DataFrame utilities
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# CLI argument parsing
# ---------------------------------------------------------------------------
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
