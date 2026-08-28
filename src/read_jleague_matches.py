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
    # The per-competition modifier ("o-table o-table--standing o-table--j1") sits on
    # a wrapper element, not on <table> itself.  The page also renders a loading
    # skeleton carrying the same modifier, so pick the first wrapper that actually
    # holds club links.
    for wrapper in soup.find_all(class_=f'o-table--{competition.lower()}'):
        links = wrapper.find_all('a', class_='o-table__club-link')
        if links:
            return [_a.get_text(strip=True) for _a in links]
    logger.warning("Can't find %s teams", competition)
    return []


# Column order of the SFMS01 search result table.
DATASITE_COLUMNS = ['season', 'competition', 'section', 'match_date', 'start_time',
                    'home_team', 'score', 'away_team', 'stadium', 'attendance', 'broadcast']

# Output column order of the generated CSV.
CSV_COLUMNS = ['match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
               'home_team', 'home_goal', 'away_goal', 'away_team', 'status',
               'home_pk_score', 'away_pk_score', 'broadcast', 'attendance']

# SFMS01 renders full-width digits in the 節 column (e.g. 第１０節第２日).
FULLWIDTH_DIGITS = str.maketrans('０１２３４５６７８９', '0123456789')

# SFMS01 marks an undecided venue with decorative markers.
UNDECIDED_STADIUM = '●未定●'


def datasite_year(season: str) -> int:
    """Derive the SFMS01 ``competition_years`` value from a season string.

    Both the single-year form ('2025') and the cross-year form ('26-27') are
    accepted; the cross-year form resolves to its starting year.

    Args:
        season (str): Season string from the config file.

    Returns:
        int: Four-digit year to query.
    """
    head = str(season).split('-')[0]
    year = int(head)
    return year + 2000 if year < 100 else year


def read_match(competition: str) -> pd.DataFrame:
    """Read every match of the configured season from the J-League Data Site.

    A single request returns all sections of the season, so unlike the old
    per-section reader this takes no section argument.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        pd.DataFrame: DataFrame containing match data

    Raises:
        KeyError: If the competition has no 'datasite.frame_ids' entry
        ValueError: If the result table cannot be found in the response
    """
    frame_id = config.datasite.frame_ids[competition]
    if frame_id is None:
        raise KeyError(f"No datasite.frame_ids entry for {competition}")
    _url = config.get_format_str('urls.datasite_url_format',
                                 datasite_year(config.season), frame_id)
    logger.info("Access %s", _url)
    soup = BeautifulSoup(requests.get(_url, timeout=config.http_timeout).text, 'lxml')
    return read_match_from_web(soup, competition)


def read_match_from_web(soup: BeautifulSoup, competition: str) -> pd.DataFrame:
    """Parse the SFMS01 search result table into the published CSV shape.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        pd.DataFrame: DataFrame containing match data, ordered by section

    Raises:
        ValueError: If the result table cannot be found in the response
    """
    table = soup.find('table', class_='search-table')
    if table is None:
        raise ValueError('Could not find the SFMS01 result table in the response')

    rows = []
    for _tr in table.find_all('tr'):
        cells = [_td.get_text(strip=True) for _td in _tr.find_all('td')]
        if not cells:
            continue  # header row
        # The broadcast column is omitted entirely on some rows; pad to a fixed width.
        cells = (cells + [''] * len(DATASITE_COLUMNS))[:len(DATASITE_COLUMNS)]
        rows.append(cells)

    matches = pd.DataFrame(rows, columns=DATASITE_COLUMNS)
    # One frame_id may serve several competitions over the years; keep only ours.
    names = config.datasite.competition_names[competition]
    matches = matches[matches['competition'].isin(names)].reset_index(drop=True)
    if matches.empty:
        logger.warning("No %s matches found on the Data Site", competition)
        return pd.DataFrame(columns=CSV_COLUMNS)

    return build_match_frame(matches)


def build_match_frame(matches: pd.DataFrame) -> pd.DataFrame:
    """Derive the published CSV columns from raw SFMS01 rows.

    Args:
        matches (pd.DataFrame): Raw rows named after DATASITE_COLUMNS.

    Returns:
        pd.DataFrame: DataFrame holding CSV_COLUMNS, sorted by section.
    """
    matches = matches.copy()
    matches['section_no'] = matches['section'].str.translate(FULLWIDTH_DIGITS) \
                                              .str.extract(r'第(\d+)節', expand=False).astype(int)
    matches['match_date'] = matches['match_date'].str.replace(r'\(.+\)', '', regex=True) \
                                                 .apply(convert_datasite_date)
    matches['stadium'] = matches['stadium'].replace(UNDECIDED_STADIUM, '未定')
    matches['attendance'] = matches['attendance'].str.replace(',', '', regex=False)

    # Score is '3-4' when played, '1-1(PK4-2)' for a shootout, and vs / blank otherwise.
    goals = matches['score'].str.extract(r'^(\d+)-(\d+)')
    matches['home_goal'] = goals[0].fillna('')
    matches['away_goal'] = goals[1].fillna('')
    pks = matches['score'].str.extract(r'PK\s*(\d+)-(\d+)')
    matches['home_pk_score'] = pks[0].fillna('')
    matches['away_pk_score'] = pks[1].fillna('')

    matches['status'] = matches['score'].apply(derive_status)

    # Number matches in the order the Data Site lists them, which is how the
    # historical CSVs were built; a stable sort keeps that order within a section.
    matches = matches.sort_values('section_no', kind='stable')
    matches['match_index_in_section'] = matches.groupby('section_no').cumcount() + 1
    return matches[CSV_COLUMNS].reset_index(drop=True)


def derive_status(score: str) -> str:
    """Map an SFMS01 score cell to the published CSV status vocabulary.

    Only what the Data Site actually states is trusted.  A past-dated match
    with no score is left as 'ＶＳ' rather than being guessed as cancelled:
    the Data Site publishes results with some lag, so a date-based guess would
    briefly mark every just-finished match as called off.  Cancellations are
    written into the score cell itself, so they are detected explicitly.

    Args:
        score (str): Raw text of the スコア column.

    Returns:
        str: One of '試合終了', '試合不実施', '試合中止', 'ＶＳ'.
    """
    score_text = (score or '').strip()
    if re.match(r'^\d+-\d+', score_text):
        return '試合終了'
    if '不実施' in score_text:
        return '試合不実施'
    if '中止' in score_text:
        return '試合中止'
    return 'ＶＳ'


def convert_datasite_date(match_date: str) -> str:
    """Convert an SFMS01 date ('26/08/07') to the standard format ('2026/08/07').

    Args:
        match_date (str): Date text with the weekday suffix already removed.

    Returns:
        str: Converted date string, or the input unchanged if unparseable.
    """
    text = (match_date or '').strip()
    if re.match(r'^\d{2}/\d{2}/\d{2}$', text):
        return f'20{text}'
    return text


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


def read_matches(competition: str, sections: list[int] = None,
                 url_category: str = None) -> pd.DataFrame:
    """Read match data for specified competition from the web.

    One Data Site request returns the whole season, so `sections` only narrows
    down the already-fetched rows; it does not reduce the number of requests.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        sections (list[int], optional): Section numbers to keep. Defaults to all.
        url_category (str, optional): Unused; kept for call-site compatibility.

    Returns:
        pd.DataFrame: DataFrame containing match data
    """
    if url_category:
        logger.warning("url_category=%s is ignored: the Data Site serves each competition"
                       " separately", url_category)
    _matches = read_match(competition)
    if sections:
        _matches = _matches[_matches['section_no'].isin(set(sections))]
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
    Any start_time not matching HH:MM format (e.g. '未定', '-', '中止') is treated as '00:00' (midnight).
    The resulting list is sorted and duplicates are removed.

    Args:
        _subset: DataFrame containing match data for a specific section
    Returns:
        list: List of kickoff times for the given match data

    Raises:
        AttributeError: If the start_time column contains non-string values
        ParserError: If the date data is not in the correct format
        ValueError: If the date data is not in the correct format
        TypeError: If the timestamp already has a timezone
        KeyError: If the DataFrame does not contain 'start_time' or 'match_date' columns
    """
    is_valid_time = _subset['start_time'].str.match(r'^\d{1,2}:\d{2}$')
    start_time = _subset['start_time'].where(is_valid_time, '00:00')
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
        A set of sections where matches started within the target period.

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

    Raises:
        NotImplementedError: If a group_display filter is needed but the fetched
            data carries no 'group' column (the Data Site does not publish one).
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
        fetched = read_matches(competition, fetch_range, url_category=url_cat)

        # Grouped sub-seasons need to know which group each match belongs to.
        # The Data Site does not publish that, so fail loudly rather than
        # silently writing every group's matches into every CSV.
        grouped = [sub['name'] for sub in subs if sub.get('group_display')]
        if grouped and 'group' not in fetched.columns:
            raise NotImplementedError(
                f"Cannot split sub-seasons {grouped} of {competition}: the fetched data "
                "has no 'group' column. The Data Site does not expose one, so a grouped "
                "season needs a different source.")

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
        all_matches = read_matches(competition, url_category=url_category)
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

    diff_matches = read_matches(competition, need_update, url_category=url_category)
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
