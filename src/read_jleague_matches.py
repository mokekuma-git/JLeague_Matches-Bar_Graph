"""Read match information of J-League and save as CSV"""
import argparse
from datetime import datetime
from datetime import timedelta
import logging
import os
from pathlib import Path
import re

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


# Output column order of the generated CSV.
CSV_COLUMNS = ['match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
               'home_team', 'home_goal', 'away_goal', 'away_team', 'status',
               'home_pk_score', 'away_pk_score', 'broadcast']

# Section headers render their number with full-width digits on some pages.
FULLWIDTH_DIGITS = str.maketrans('０１２３４５６７８９', '0123456789')

# Match links look like /match/j1/2026/082901/ -- category, year, month, day, index.
MATCH_LINK_RE = re.compile(r'^/match/([a-z0-9]+)/(\d{4})/(\d{2})(\d{2})(\d+)/')

SECTION_RE = re.compile(r'第([0-9０-９]+)節')
HEADER_DATE_RE = re.compile(r'(\d{4})/(\d{1,2})/(\d{1,2})')
TIME_RE = re.compile(r'^\d{1,2}:\d{2}$')
# The detail page keeps the kick-off in its header: '2026/8/22 (土) 18:00 KO'.
DETAIL_KICKOFF_RE = re.compile(r'(\d{1,2}:\d{2})\s*KO')

# Status vocabulary of the published CSV.  'ＶＳ' means not played yet; a status
# containing '速報中' marks a match in progress (the front-end strips the marker
# before display and uses it to flag the row as live).
STATUS_FINISHED = '試合終了'
STATUS_SCHEDULED = 'ＶＳ'
STATUS_CANCELLED = '試合中止'
STATUS_LIVE_MARKER = '速報中'


def read_match(competition: str, periods: list[tuple[str, str]] = None) -> pd.DataFrame:
    """Read matches of the configured season from the J-League schedule pages.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        periods (list[tuple[str, str]], optional): (start, end) ISO dates to fetch.
            Defaults to every month of the configured season.

    Returns:
        pd.DataFrame: DataFrame containing match data

    Raises:
        KeyError: If the key 'urls.match_url_format' is not found in the config file
    """
    frames = []
    links: dict[tuple, str] = {}
    for (start, end) in periods or season_periods():
        _url = config.get_format_str('urls.match_url_format',
                                     competition.lower(), start, end)
        logger.info("Access %s", _url)
        soup = BeautifulSoup(requests.get(_url, timeout=config.http_timeout).text, 'lxml')
        frames.append(read_match_from_web(soup, competition))
        links.update(read_detail_links(soup, competition))

    matches = pd.concat(frames) if frames else pd.DataFrame(columns=CSV_COLUMNS)
    # The same match can appear in two adjacent periods; the link is unique per match.
    matches = matches.drop_duplicates(subset=['match_date', 'home_team', 'away_team'])
    matches = renumber_matches(matches)
    # Carried alongside the frame so a caller can look a kick-off time up later.
    matches.attrs['detail_links'] = links
    return matches


def season_periods(months: int = 12, start_month: int = None) -> list[tuple[str, str]]:
    """Return month-long (start, end) ISO date pairs covering the season.

    One request is capped at roughly 200 matches, so the season has to be
    fetched in chunks; a calendar month is comfortably below that limit.

    Args:
        months (int): Number of months to cover from the season start.
        start_month (int, optional): Month the season opens in.  Resolved from
            season_map when omitted.

    Returns:
        list[tuple[str, str]]: (start, end) pairs in 'YYYY-MM-DD' form.
    """
    if start_month is None:
        start_month = mu.resolve_season_start_month()
    head = str(config.season).split('-')[0]
    year = int(head)
    year = year + 2000 if year < 100 else year

    periods = []
    cursor = datetime(year, start_month, 1)
    for _ in range(months):
        if cursor.month == 12:
            nxt = cursor.replace(year=cursor.year + 1, month=1)
        else:
            nxt = cursor.replace(month=cursor.month + 1)
        periods.append((cursor.strftime('%Y-%m-%d'),
                        (nxt - timedelta(days=1)).strftime('%Y-%m-%d')))
        cursor = nxt
    return periods


def read_match_from_web(soup: BeautifulSoup, competition: str) -> pd.DataFrame:
    """Parse one schedule page into the published CSV shape.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        pd.DataFrame: DataFrame holding CSV_COLUMNS (unnumbered).
    """
    sections = read_sections_from_web(soup)
    category = competition.lower()

    rows = []
    seen = set()
    for link in soup.find_all('a', href=MATCH_LINK_RE):
        card = link.find(class_='m-schedule__match')
        if card is None:
            continue  # a bare overlay link, not the match card itself
        _match = MATCH_LINK_RE.match(link['href'])
        if _match.group(1) != category:
            continue  # cup / continental / friendly fixture on the same page
        match_date = f'{_match.group(2)}/{_match.group(3)}/{_match.group(4)}'
        key = (match_date, _match.group(5))
        if key in seen:
            continue  # the card is linked more than once (#review, #lineup)
        seen.add(key)

        row = read_card(link, card)
        row['match_date'] = match_date
        row['section_no'] = sections.get(match_date)
        rows.append(row)

    if not rows:
        return pd.DataFrame(columns=CSV_COLUMNS)

    matches = pd.DataFrame(rows)
    unknown = matches['section_no'].isna()
    if unknown.any():
        logger.warning("No section header for %d %s match(es) on %s",
                       int(unknown.sum()), competition,
                       sorted(set(matches.loc[unknown, 'match_date'])))
        matches = matches[~unknown]
    matches['section_no'] = matches['section_no'].astype(int)
    return matches.reindex(columns=CSV_COLUMNS)


def read_sections_from_web(soup: BeautifulSoup) -> dict[str, int]:
    """Map match dates to section numbers using the page's group headers.

    Headers read like '2026/9/12 (土) 第7節'.  Only league headers carry a
    section number, so cup and continental fixtures drop out here.  Headers are
    not interleaved with the cards they label, which is why the date is used as
    the join key rather than document order.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data

    Returns:
        dict[str, int]: {'2026/09/12': 7, ...}
    """
    sections = {}
    for header in soup.find_all(class_='m-section-header'):
        text = header.get_text(' ', strip=True)
        _date = HEADER_DATE_RE.search(text)
        _section = SECTION_RE.search(text)
        if not (_date and _section):
            continue
        key = f'{_date.group(1)}/{int(_date.group(2)):02d}/{int(_date.group(3)):02d}'
        section_no = int(_section.group(1).translate(FULLWIDTH_DIGITS))
        if sections.setdefault(key, section_no) != section_no:
            logger.warning("Date %s carries sections %s and %s; keeping %s",
                           key, sections[key], section_no, sections[key])
    return sections


def read_card(link: BeautifulSoup, card: BeautifulSoup) -> dict[str, str]:
    """Extract one match from its schedule card.

    Args:
        link (BeautifulSoup): The <a> wrapping the card (holds venue / broadcast).
        card (BeautifulSoup): The 'm-schedule__match' element itself.

    Returns:
        dict[str, str]: Match fields other than match_date / section_no.
    """
    names = [_e.get_text(strip=True)
             for _e in card.find_all(class_='m-schedule__team-name',
                                     attrs={'data-media': 'sp'})]
    goals = [_e.get_text(strip=True) for _e in card.find_all(class_='m-schedule__score')]
    live = card.find(class_='m-schedule__live-text')
    over = card.find(class_='m-schedule__game-over-text')

    stadium = link.find(class_='m-schedule__info-stadium', attrs={'data-media': 'sp'})
    platform = link.find(class_='m-schedule__info-platform')

    return {
        'start_time': read_start_time(card),
        'stadium': stadium.get_text(strip=True) if stadium else '',
        'home_team': names[0] if len(names) == 2 else '',
        'away_team': names[1] if len(names) == 2 else '',
        'home_goal': goals[0] if len(goals) == 2 else '',
        'away_goal': goals[1] if len(goals) == 2 else '',
        'status': derive_status(goals,
                                live.get_text(' ', strip=True) if live else '',
                                over.get_text(' ', strip=True) if over else ''),
        'home_pk_score': '',
        'away_pk_score': '',
        'broadcast': platform.get_text(' ', strip=True).lstrip('・') if platform else '',
    }


def read_start_time(card: BeautifulSoup) -> str:
    """Return the scheduled kick-off time, which is only shown before kick-off.

    Once a match starts the slot is replaced by the score and the elapsed time,
    so an empty result here means the match is under way or already over.

    Args:
        card (BeautifulSoup): The 'm-schedule__match' element.

    Returns:
        str: 'HH:MM', or '' when the card no longer shows one.
    """
    info = card.find(class_='m-schedule__match-info')
    if info is None:
        return ''
    for _p in info.find_all('p'):
        text = _p.get_text(strip=True)
        if TIME_RE.match(text):
            return text
    return ''


def derive_status(goals: list[str], live_text: str, over_text: str) -> str:
    """Map the card's own wording to the published CSV status vocabulary.

    Only what the page states is used; nothing is inferred from the clock.

    Args:
        goals (list[str]): Score texts found on the card (empty before kick-off).
        live_text (str): Elapsed-time text shown while the match is in progress.
        over_text (str): Text shown once the match has finished.

    Returns:
        str: '試合終了', '試合中止', '速報中…' or 'ＶＳ'.
    """
    for text in (over_text, live_text):
        if '中止' in text:
            return STATUS_CANCELLED
    if over_text:
        return STATUS_FINISHED
    if live_text:
        # Keep the elapsed time; the front-end strips the marker before display.
        return f'{STATUS_LIVE_MARKER}{live_text}'
    return STATUS_SCHEDULED if len(goals) != 2 else STATUS_FINISHED


def renumber_matches(matches: pd.DataFrame) -> pd.DataFrame:
    """Sort by section and assign the 1-based index used inside each section.

    Args:
        matches (pd.DataFrame): Parsed matches.

    Returns:
        pd.DataFrame: Sorted frame holding CSV_COLUMNS.
    """
    if matches.empty:
        return pd.DataFrame(columns=CSV_COLUMNS)
    matches = matches.sort_values(['section_no', 'match_date', 'home_team'],
                                  kind='stable').reset_index(drop=True)
    matches['match_index_in_section'] = matches.groupby('section_no').cumcount() + 1
    return matches.reindex(columns=CSV_COLUMNS)


def read_detail_links(soup: BeautifulSoup, competition: str) -> dict[tuple, str]:
    """Map each match on the page to its detail-page path.

    Args:
        soup (BeautifulSoup): BeautifulSoup object containing the web data
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')

    Returns:
        dict[tuple, str]: {(match_date, home_team, away_team): '/match/j3/2026/082225/'}
    """
    category = competition.lower()
    links = {}
    for link in soup.find_all('a', href=MATCH_LINK_RE):
        card = link.find(class_='m-schedule__match')
        if card is None:
            continue
        _match = MATCH_LINK_RE.match(link['href'])
        if _match.group(1) != category:
            continue
        names = [_e.get_text(strip=True)
                 for _e in card.find_all(class_='m-schedule__team-name',
                                         attrs={'data-media': 'sp'})]
        if len(names) != 2:
            continue
        match_date = f'{_match.group(2)}/{_match.group(3)}/{_match.group(4)}'
        links.setdefault((match_date, names[0], names[1]), _match.group(0))
    return links


def read_kickoff_from_detail(path: str) -> str:
    """Read the kick-off time from a match's own page.

    The schedule page drops the time on kick-off, so a match that was still
    undated when it was last recorded has no time anywhere else.  Its own page
    keeps it ("2026/8/22 (土) 18:00 KO") long after the final whistle.

    Args:
        path (str): Site-relative detail path, e.g. '/match/j3/2026/082225/'.

    Returns:
        str: 'HH:MM', or '' when the page does not state one.
    """
    url = f'https://www.jleague.jp{path}'
    logger.info("Access %s", url)
    try:
        text = requests.get(url, timeout=config.http_timeout).text
    except requests.RequestException as exc:
        logger.warning("Could not read %s: %s", url, exc)
        return ''
    found = DETAIL_KICKOFF_RE.search(BeautifulSoup(text, 'lxml').get_text(' ', strip=True))
    return found.group(1) if found else ''


def fill_start_times_from_detail(matches: pd.DataFrame, links: dict[tuple, str],
                                 limit: int = 20) -> pd.DataFrame:
    """Look up kick-off times that are missing everywhere else, one page each.

    Only matches that have already been played are looked up: a fixture later in
    the season legitimately has no time yet, and asking for hundreds of those
    would be pointless.  What remains is the rare case of a match played before
    its kick-off time was ever recorded.  The number of extra requests is capped
    so an unexpected gap cannot turn into hundreds of fetches.

    Args:
        matches (pd.DataFrame): Matches whose start_time may still be blank.
        links (dict[tuple, str]): Detail paths from read_detail_links().
        limit (int): Most detail pages to fetch in one run.

    Returns:
        pd.DataFrame: `matches` with any recovered kick-off times filled in.
    """
    if matches.empty:
        return matches
    status = matches['status'].fillna('').astype(str)
    played = status.str.contains(STATUS_LIVE_MARKER) | status.isin(
        [STATUS_FINISHED, STATUS_CANCELLED])
    blank = (matches['start_time'].fillna('').astype(str).str.strip() == '') & played
    if not blank.any():
        return matches

    matches = matches.copy()
    fetched = 0
    for index, row in matches[blank].iterrows():
        if fetched >= limit:
            logger.warning("Stopped after %d detail lookups; %d still without a time",
                           limit, int(blank.sum()) - fetched)
            break
        path = links.get((row['match_date'], row['home_team'], row['away_team']))
        if not path:
            continue
        fetched += 1
        kickoff = read_kickoff_from_detail(path)
        if kickoff:
            matches.at[index, 'start_time'] = kickoff
    return matches


def keep_known_start_times(fetched: pd.DataFrame, current: pd.DataFrame) -> pd.DataFrame:
    """Restore kick-off times the schedule page stops showing once a match starts.

    The card replaces the kick-off time with the score and the elapsed time the
    moment a match is under way, so a fetch alone would blank `start_time` for
    every match already played.  That is not just a display loss: kick-off times
    are what decide which sections are due for a refresh, so once every match in
    a section had started the section would drop out of the update window and
    stop being polled.  The scheduled time is therefore carried over from what is
    already known.

    Args:
        fetched (pd.DataFrame): Matches just read from the web.
        current (pd.DataFrame): Matches already stored in the CSV.

    Returns:
        pd.DataFrame: `fetched` with previously known kick-off times filled back in.
    """
    if current is None or current.empty or fetched.empty:
        return fetched
    if 'start_time' not in current.columns:
        return fetched

    keys = ['section_no', 'home_team', 'away_team']
    known = {}
    for row in current[keys + ['start_time']].itertuples(index=False):
        time_text = '' if pd.isna(row.start_time) else str(row.start_time).strip()
        if time_text:
            known[(row.section_no, row.home_team, row.away_team)] = time_text

    fetched = fetched.copy()
    restored = 0
    for index, row in fetched.iterrows():
        text = '' if pd.isna(row['start_time']) else str(row['start_time']).strip()
        if text:
            continue
        previous = known.get((row['section_no'], row['home_team'], row['away_team']))
        if previous:
            fetched.at[index, 'start_time'] = previous
            restored += 1
    if restored:
        logger.info("Kept %d kick-off time(s) the schedule page no longer shows", restored)
    return fetched


def keep_unlisted_matches(fetched: pd.DataFrame, current: pd.DataFrame,
                          sections: set[int] = None) -> pd.DataFrame:
    """Carry over fixtures the schedule pages cannot show.

    A fixture whose date is not settled yet has no place on a calendar, so the
    date-ranged schedule pages omit it entirely (e.g. a section left open until
    an AFC draw).  Dropping it would shrink the section and lose a match the
    site itself still counts, so any row already known from the CSV but absent
    from the fetch is kept, with its date and kick-off time left blank.

    Args:
        fetched (pd.DataFrame): Matches just read from the web.
        current (pd.DataFrame): Matches already stored in the CSV.
        sections (set[int], optional): Restrict to these sections.

    Returns:
        pd.DataFrame: `fetched` plus the carried-over rows.
    """
    if current is None or current.empty:
        return fetched

    known = current if sections is None else current[current['section_no'].isin(sections)]
    if known.empty:
        return fetched

    keys = ['section_no', 'home_team', 'away_team']
    seen = set(map(tuple, fetched[keys].values)) if not fetched.empty else set()
    missing = known[[tuple(row) not in seen for row in known[keys].values]]
    if missing.empty:
        return fetched

    logger.warning("Keeping %d fixture(s) the schedule page does not list: %s",
                   len(missing),
                   [f"sec{r.section_no} {r.home_team}-{r.away_team}"
                    for r in missing.itertuples()])
    combined = pd.concat([fetched, missing.reindex(columns=fetched.columns)])
    return renumber_matches(combined)


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

    The season is fetched month by month, so `sections` only narrows down the
    already-fetched rows; it does not reduce the number of requests.

    Args:
        competition (str): Competition key (e.g. 'J1', 'J2', 'J3')
        sections (list[int], optional): Section numbers to keep. Defaults to all.
        url_category (str, optional): Unused; kept for call-site compatibility.

    Returns:
        pd.DataFrame: DataFrame containing match data
    """
    if url_category:
        logger.warning("url_category=%s is ignored: each competition has its own"
                       " schedule page", url_category)
    _matches = read_match(competition)
    if sections:
        _matches = _matches[_matches['section_no'].isin(set(sections))]
    # A common mistake is not saving the result of sort or reset_index operations
    links = _matches.attrs.get('detail_links', {})
    _matches = _matches.sort_values(['section_no', 'match_index_in_section']).reset_index(drop=True)
    _matches.attrs['detail_links'] = links
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
        if Path(latest_file).exists():
            known = mu.read_allmatches_csv(latest_file)
            links = all_matches.attrs.get('detail_links', {})
            all_matches = keep_known_start_times(all_matches, known)
            all_matches = fill_start_times_from_detail(all_matches, links)
            all_matches = keep_unlisted_matches(all_matches, known)
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
    diff_links = diff_matches.attrs.get('detail_links', {})
    diff_matches = keep_known_start_times(diff_matches, current)
    diff_matches = fill_start_times_from_detail(diff_matches, diff_links)
    diff_matches = keep_unlisted_matches(diff_matches, current, set(need_update))
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
