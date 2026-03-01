"""Shared utilities for match CSV processing across all competitions.

Provides CSV I/O, timestamp management, DataFrame comparison, date parsing,
season-map loading, and CLI argument parsing utilities.  Competition-specific
logic lives in dedicated scripts (e.g. read_jleague_matches.py,
read_jfamatch.py).

Usage::

    from match_utils import mu, get_season_from_date

    config = mu.init_config('config/jleague.yaml')
    mu.update_if_diff(match_df, csv_path)
"""
from datetime import date
from datetime import datetime
import json
import logging
from os import PathLike
from pathlib import Path
import re
from typing import Any

import pandas as pd

from set_config import Config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CSV column schema (module-level constant)
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
    'home_pk_score': 'nullable_int',  # PK shootout (column may be absent)
    'away_pk_score': 'nullable_int',  # PK shootout (column may be absent)
}


# Valid point_system values.  Must match PointSystem type / POINT_MAPS keys
# on the TypeScript side (frontend/src/types/config.ts).
# Verified by scripts/check_type_sync.py in CI.
POINT_SYSTEM_VALUES: set[str] = {'standard', 'old-two-points', 'victory-count'}


# ---------------------------------------------------------------------------
# SeasonEntry: typed representation of a season_map.json entry
# ---------------------------------------------------------------------------
class SeasonEntry:
    """Parsed season entry from season_map.json.

    Corresponds to the raw JSON array:
        [team_count, promotion_count, relegation_count, teams, options?]
    """

    KNOWN_OPTION_KEYS: set[str] = {
        'rank_properties', 'group_display', 'url_category',
        'league_display', 'point_system', 'css_files',
        'team_rename_map', 'tiebreak_order', 'season_start_month',
        'shown_groups',
    }

    def __init__(self, season_key: str, raw: list):
        """Parse and validate a raw season entry array.

        Args:
            season_key: Season name (for error messages, e.g. '2026East').
            raw: Raw JSON array from season_map.json.

        Raises:
            ValueError: If required elements are missing.
            TypeError: If element types are wrong.
        """
        if len(raw) < 4:
            raise ValueError(
                f"Season '{season_key}': expected at least 4 elements, got {len(raw)}")

        for i, label in enumerate(['team_count', 'promotion_count', 'relegation_count']):
            if not isinstance(raw[i], int):
                raise TypeError(
                    f"Season '{season_key}': {label} (index {i}) must be int, "
                    f"got {type(raw[i]).__name__}")

        if not isinstance(raw[3], list):
            raise TypeError(
                f"Season '{season_key}': teams (index 3) must be list, "
                f"got {type(raw[3]).__name__}")

        self.team_count: int = raw[0]
        self.promotion_count: int = raw[1]
        self.relegation_count: int = raw[2]
        self.teams: list[str] = raw[3]
        self.options: dict[str, Any] = {}

        if len(raw) > 4:
            if not isinstance(raw[4], dict):
                raise TypeError(
                    f"Season '{season_key}': options (index 4) must be dict, "
                    f"got {type(raw[4]).__name__}")
            self.options = raw[4]
            unknown = set(self.options.keys()) - self.KNOWN_OPTION_KEYS
            if unknown:
                logger.warning("Season '%s': unknown option keys: %s", season_key, unknown)
            ps = self.options.get('point_system')
            if ps is not None and ps not in POINT_SYSTEM_VALUES:
                logger.warning("Season '%s': unknown point_system: '%s'", season_key, ps)


class MatchUtils:
    """Stateful utilities for match CSV processing.

    Holds a loaded Config instance and provides methods that depend on it.
    Use the module-level singleton ``mu`` and call ``mu.init_config(path)``
    before using any other methods.
    """

    def __init__(self):
        self.config: Config | None = None

    def init_config(self, config_path: str | PathLike) -> Config:
        """Load a YAML config file and set it as the config.

        Args:
            config_path: Path to the YAML config file.

        Returns:
            Config: The loaded config object (also stored as self.config).
        """
        self.config = Config(config_path)
        return self.config

    # -------------------------------------------------------------------
    # Season-map loading
    # -------------------------------------------------------------------
    def load_season_map_raw(self) -> dict:
        """Load season_map.json and return the full JSON dict.

        Returns:
            dict: The entire season_map.json content.
        """
        season_map_path = self.config.get_path('paths.season_map_file')
        with open(season_map_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def load_season_map(self, group_key: str = None) -> dict[str, dict[str, SeasonEntry]]:
        """Load season_map.json and extract competitions for the given group.

        The 4-tier JSON has the structure:
            { group_key: { "competitions": { "J1": { "seasons": {...} }, ... } } }

        This function flattens and parses it to:
            { "J1": { "2026East": SeasonEntry(...), ... }, "J2": {...}, ... }

        Args:
            group_key: Top-level group key in season_map.json.
                       Defaults to the first group in the JSON.

        Returns:
            dict: Competition key -> {season_name: SeasonEntry}
        """
        raw = self.load_season_map_raw()
        if group_key is None:
            group_key = next(iter(raw))
        group = raw.get(group_key, {}).get('competitions', {})
        return {
            comp_key: {
                sk: SeasonEntry(sk, entry)
                for sk, entry in comp.get('seasons', {}).items()
            }
            for comp_key, comp in group.items()
        }

    def get_sub_seasons(self, competition: str, group_key: str = None) -> list[dict] | None:
        """Get sub-seasons for the given competition from season_map.json.

        For years with multiple sub-seasons (e.g. 2026East/2026West),
        returns a list of sub-season info dicts. For single-season years,
        returns an empty list. If no season entry exists for this competition,
        returns None (caller should skip this competition entirely).

        Args:
            competition: Competition key (e.g. 'J1', 'J2', 'J3')
            group_key: Top-level group key in season_map.json.
                       Defaults to the first group in the JSON.

        Returns:
            list[dict] | None:
                None       -- no season entry for config.season -> skip
                []         -- single season -> use standard update
                [dict,...] -- multi-group season -> use sub-season update
        """
        cfg = self.config
        season_map = self.load_season_map(group_key)
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
                'teams': entry.teams,
                'team_count': entry.team_count,
                'group': k[len(season_str):],
            }
            opts = entry.options
            if 'group_display' in opts:
                info['group_display'] = opts['group_display']
            if 'url_category' in opts:
                info['url_category'] = opts['url_category']
            result.append(info)
        return result

    def get_csv_path(self, competition: str, season: str = None) -> str:
        """Get the path of CSV file from config file.

        Args:
            competition: Competition key (e.g. 'J1', 'J2', 'J3')
            season: Season name (e.g. '2026East'). Defaults to config.season.

        Returns:
            str: Path of CSV file

        Raises:
            KeyError: If the key 'paths.csv_format' is not found in the config file
        """
        cfg = self.config
        if season is None:
            season = cfg.season
        # CSV file path is also the key of Timestamp file, so handle it as a string
        return cfg.get_format_str('paths.csv_format', season=season, competition=competition)

    def resolve_season_start_month(self, group_key: str = None) -> int:
        """Resolve season_start_month for config.season via cascade.

        Looks up the matching season entry in season_map.json and resolves
        the season_start_month by cascading Group -> Competition -> SeasonEntry.
        Code default is 7 (autumn-spring, world standard).

        Args:
            group_key: Top-level group key in season_map.json.
                       Defaults to the first group in the JSON.

        Returns:
            int: The effective season_start_month for the current config.season.
        """
        raw = self.load_season_map_raw()
        if group_key is None:
            group_key = next(iter(raw))
        group = raw.get(group_key, {})
        group_val = group.get('season_start_month', 7)  # code default

        season_str = str(self.config.season)
        for comp in group.get('competitions', {}).values():
            comp_val = comp.get('season_start_month', group_val)
            for sk, raw_entry in comp.get('seasons', {}).items():
                if sk.startswith(season_str):
                    entry = SeasonEntry(sk, raw_entry)
                    return entry.options.get('season_start_month', comp_val)
        return group_val

    # -------------------------------------------------------------------
    # Date utilities
    # -------------------------------------------------------------------
    def to_datetime_aspossible(self, val: str) -> str:
        """Convert to Timestamp format as much as possible and output in config.standard_date_format.

        Return the original string if conversion is not possible.

        Args:
            val (str): Date string to be converted

        Returns:
            str: Converted date string in standard format or original string if conversion fails
        """
        cfg = self.config
        try:
            return pd.to_datetime(val).date().strftime(cfg.standard_date_format)
        except (ValueError, TypeError):
            return val

    # -------------------------------------------------------------------
    # CSV I/O
    # -------------------------------------------------------------------
    def read_allmatches_csv(self, matches_file: str) -> pd.DataFrame:
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
        logger.info("Reading match file %s", matches_file)
        all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
        if 'index' in all_matches.columns:
            all_matches = all_matches.drop(columns=['index'])
        all_matches['match_date'] = all_matches['match_date'].map(self.to_datetime_aspossible)
        all_matches['home_goal'] = all_matches['home_goal'].fillna('')
        all_matches['away_goal'] = all_matches['away_goal'].fillna('')
        all_matches['section_no'] = all_matches['section_no'].astype('int')
        all_matches['match_index_in_section'] = all_matches['match_index_in_section'].astype('int')
        # Convert NaN to output as null in JSON
        all_matches = all_matches.where(pd.notnull(all_matches), None)
        return all_matches

    def update_csv(self, match_df: pd.DataFrame, filename: str) -> None:
        """Receive a match DataFrame and filename, and create or update the CSV file.

        Args:
            match_df (pd.DataFrame): DataFrame containing match data
            filename (str): Name of the file to be updated

        Raises:
            ValueError: If no filename is provided
            TypeError: If the timestamp already has a timezone
        """
        logger.info("Update %s", filename)
        # Normalize column types (e.g. convert float-format goal strings to int strings).
        match_df = _normalize_df_for_csv(match_df)
        # When the match_date contains only date, it is converted and keeps the original format
        # (date only), but when a string is also included, it seems to output both date and time,
        # so convert the content of match_date to a string before outputting.
        match_df['match_date'] = match_df['match_date'].map(lambda x: str(x) if isinstance(x, date) else x)
        match_df.to_csv(filename, lineterminator='\n')
        self.update_timestamp(filename)

    # -------------------------------------------------------------------
    # DataFrame comparison
    # -------------------------------------------------------------------
    def matches_differ(self, foo_df: pd.DataFrame, bar_df: pd.DataFrame) -> bool:
        """Return True if two match DataFrames differ (ignoring 'match_index_in_section' and NaNs)."""
        _foo = foo_df.drop(columns=['match_index_in_section']).fillna('')
        _bar = bar_df.drop(columns=['match_index_in_section']).fillna('')
        _foo = _foo.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)
        _bar = _bar.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)

        if not _foo.equals(_bar):
            if logger.isEnabledFor(logging.DEBUG):
                df_comp = _foo.compare(_bar)
                for col_name in df_comp.columns.droplevel(1).unique():
                    logger.debug("%s\n%s", col_name, df_comp[col_name].dropna())
            return True
        return False

    def update_if_diff(self, match_df: pd.DataFrame, filename: str) -> bool:
        """Receive a match DataFrame and filename; overwrite the file if contents differ.

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
            self.update_csv(match_df, filename)
            return True

        old_df = self.read_allmatches_csv(filename)
        # Overwrite if there are differences
        if self.matches_differ(match_df, old_df):
            self.update_csv(match_df, filename)
            return True

        # No changes found; do nothing
        logger.info("No changes found in %s", filename)
        return False

    # -------------------------------------------------------------------
    # Timestamp management
    # -------------------------------------------------------------------
    def update_timestamp(self, filename: str) -> None:
        """Read the timestamp record file and update the timestamp of the given filename to the current time.

        Args:
            filename (str): Name of the file to update the timestamp for

        Raises:
            ValueError:
            TypeError:
        """
        cfg = self.config
        timestamp_file = cfg.get_path('paths.timestamp_file')
        if timestamp_file.exists():
            timestamp = pd.read_csv(timestamp_file, index_col=0, parse_dates=[1])
            timestamp['date'] = timestamp['date'].apply(
                lambda x: x.tz_localize(cfg.timezone) if x.tz is None else x.tz_convert(cfg.timezone))
        else:
            timestamp = pd.DataFrame(columns=['date'])
            timestamp.index.name = 'file'
        timestamp.loc[filename] = datetime.now().astimezone(cfg.timezone)
        if timestamp.index.duplicated().any():
            logger.warning("Duplicates in timestamp file were consolidated (keeping most recent values)")
            timestamp = drop_duplicated_indexes(timestamp)
        timestamp.to_csv(timestamp_file, lineterminator='\n')

    def get_timestamp_from_csv(self, filename: str) -> datetime:
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
        cfg = self.config
        timestamp_file = cfg.get_path('paths.timestamp_file')
        if timestamp_file.exists():
            timestamp = pd.read_csv(timestamp_file, index_col=0, parse_dates=[1])
            timestamp = timestamp[~timestamp.index.duplicated(keep="first")]
            if filename in timestamp.index:
                return timestamp.loc[filename]['date']
        logger.info("Timestamp fallback to file mtime for %s", filename)
        return datetime.fromtimestamp(Path(filename).stat().st_mtime).astimezone(cfg.timezone)


# Singleton instance
mu = MatchUtils()


# ---------------------------------------------------------------------------
# Standalone functions (no config dependency)
# ---------------------------------------------------------------------------
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


def drop_duplicated_indexes(df: pd.DataFrame) -> pd.DataFrame:
    """For rows in the DataFrame with duplicate 'file' indexes, keep only the latest one based on 'date'.

    Args:
        df (pd.DataFrame): DataFrame with duplicate indexes

    Returns:
        pd.DataFrame: DataFrame with duplicate indexes removed, keeping only the latest one
    """
    if df.index.name != 'file':
        raise ValueError("DataFrame index must be named 'file'")
    df = df.reset_index()
    df = df.sort_values(['file', 'date'], ascending=[True, False])
    df = df.drop_duplicates(subset=['file'], keep='first')
    df = df.set_index('file')
    return df


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
        logger.error("Invalid integer format: %s. Must be an integer or a range like '1-3'.", arg)
        raise exc
