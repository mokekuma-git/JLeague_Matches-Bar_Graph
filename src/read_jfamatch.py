"""Read JFA match data and convert to CSV

The settings for competition is defined in the config file ../config/jfamatch.yaml.
The format of the config file is as follows:

```yaml
competitions:
  PrincePremierE:
    schedule_url: https://www.jfa.jp/match/takamado_jfa_u18_premier2025/east/match/schedule.json
    csv_path: ../docs/csv/2025_allmatch_result-PrincePremierE.csv
  WC2022:
    schedule_url: https://www.jfa.jp/national_team/samuraiblue/worldcup_2022/group{}/match/schedule.json
    csv_path: ../docs/csv/2022_allmatch_result-wc_group.csv
    groups: A, B, C, D, E, F, G, H
    match_in_section: 3
    timezone_diff: 06:00
```

The key of the each competition is the name of the competition.
The `schedule_url` is the URL of the JSON file that contains the match schedule.
  It is formatted with the group name if the competition has groups.
The `csv_path` is the path to the CSV file that will be created.
The `groups` is a list of groups for the competition.
  It allows to be specified by a comma-separated string or a list of strings.
  If not specified, the default is an empty string.
The `match_in_section` is the number of matches in each section.
  It is used to calculate the section number if not specified in the JSON.
The `timezone_diff` is the time difference from JST.
  It is used to convert the match date and time to JST.
  '-' can be used to indicate a negative time difference. ex) -06:00
"""
import argparse
from datetime import timedelta
import json
import logging
import os
from pathlib import Path
import re
from typing import Any

import pandas as pd
import requests

from match_utils import mu
from set_config import Config

logger = logging.getLogger(__name__)


def _prepare_config() -> Config:
    """Reads the configuration file and prepares the config object.

    Returns:
        Config: Configuration object with parsed settings
    """
    new_conf = mu.init_config(Path(__file__).parent / '../config/jfamatch.yaml')

    def is_string_list(obj: Any) -> bool:
        if not isinstance(obj, list):
            return False
        return all(isinstance(item, str) for item in obj)

    new_conf.competition_names = new_conf.competitions.keys()
    for _, cmpt_conf in new_conf.competitions.items():
        if 'groups' in cmpt_conf:
            if isinstance(cmpt_conf.groups, str):
                # groups are comma separated
                # ex) 'A,B,C' -> ['A', 'B', 'C']
                cmpt_conf.groups = [group.strip() for group in cmpt_conf.groups.split(',')]
            elif is_string_list(cmpt_conf.groups):
                pass
            else:
                raise ValueError(f"Invalid type for 'groups' in {cmpt_conf.groups}")
        else:  # default to list has one empty string
            cmpt_conf['groups'] = ['']

    # Type conversion
    new_conf.section_no = re.compile(new_conf.section_no)

    return new_conf


config = _prepare_config()


def _parse_years(raw_years: Any) -> list[int]:
    """Parse config years into a sorted integer list.

    Accepts:
      - list[int]
      - list[str]
      - comma-separated string: "2015,2016"
      - inclusive range string: "1993-2025"
    """
    if raw_years is None:
        return []
    if isinstance(raw_years, list):
        years = [int(year) for year in raw_years]
    elif isinstance(raw_years, str):
        raw_years = raw_years.strip()
        if not raw_years:
            return []
        if ',' in raw_years:
            years = [int(year.strip()) for year in raw_years.split(',')]
        elif re.fullmatch(r'\d{4}-\d{4}', raw_years):
            start, end = map(int, raw_years.split('-'))
            years = list(range(start, end + 1))
        else:
            years = [int(raw_years)]
    else:
        raise ValueError(f"Invalid type for 'years': {type(raw_years).__name__}")

    return sorted(years)


def _resolve_schedule_url(comp_conf: dict[str, Any], group: str, year: int | None = None) -> str:
    """Resolve the schedule URL with optional per-year overrides."""
    if year is not None and 'year_overrides' in comp_conf:
        override_url = comp_conf.year_overrides.get(str(year))
        if override_url:
            return override_url

    format_kwargs = {'group': group}
    if year is not None:
        format_kwargs['year'] = year
    return comp_conf.schedule_url.format(**format_kwargs)


def read_match_json(_url: str) -> dict[str, Any]:
    """Read the match JSON data from the given URL

    Args:
        _url (str): URL of the match JSON data

    Returns:
        Dict[str, Any]: Parsed JSON data
                        Return an empty list if the data is not available
    """
    result = None
    counter = 0
    while result is None and counter < 10:
        try:
            logger.info("Access %s", _url)
            response = requests.get(_url, timeout=config.http_timeout)
            if response.status_code == 404:
                logger.warning("Match data not found (404): %s", _url)
                return json.loads('{"matchScheduleList":{"matchSchedule": []}}')
            response.raise_for_status()
            result = json.loads(response.text)
        except (TypeError, json.JSONDecodeError, requests.RequestException) as _ex:
            logger.warning("Retry %d/%d: %s", counter, 10, _ex)

        counter += 1
    if result is not None:
        return result
    logger.error("Failed to get match data for %s after %d tries", _url, counter)
    return json.loads('{"matchScheduleList":{"matchSchedule": []}}')


def read_jfa_match(_url: str, matches_in_section: int = None) -> pd.DataFrame:
    """Read the match data from the given URL and convert to DataFrame.

    The sample of JFA style JSON data is as follows:
    {'matchTypeName': '第1節',
     'matchNumber': '1',  # It seems to be the match number in the section
     'matchDate': '2021/07/22',  # Unused
     'matchDateJpn': '2021/07/22',
     'matchDateWeek': '木',  # Unused
     'matchTime': '20:00',  # Unused
     'matchTimeJpn': '20:00',
     'venue': '東京スタジアム',
     'venueFullName': '東京／東京スタジアム',  # Unused
     'homeTeamName': '日本',
     'homeTeamQualificationDescription': '',  # Unused
     'awayTeamName': '南アフリカ',
     'awayTeamQualificationDescription': '',  # Unused
     'score': {
         'homeWinFlag': False,  # Unused
         'awayWinFlag': False,  # Unused
         'homeScore': '',
         'awayScore': '',
         'homeTeamScore1st': '',  # Unused for each half
         'awayTeamScore1st': '',  # Unused
         'homeTeamScore2nd': '',  # Unused
         'awayTeamScore2nd': '',  # Unused
         'exMatch': False,
         'homeTeamScore1ex': '',  # Unused for extension
         'awayTeamScore1ex': '',  # Unused
         'homeTeamScore2ex': '',  # Unused
         'awayTeamScore2ex': '',  # Unused
         'homePKScore': '',  # Unused for PK
         'awayPKScore': ''   # Unused
     },
     'scorer': {
         'homeScorer': [],  # Unused
         'awayScorer': []  # Unused
     },
     'matchStatus': '',
     'officialReportURL': ''  # Unused
    }

    Args:
        _url (str): URL of the match data
        matches_in_section (int, optional): Number of matches in each section.
            If not specified, it will be calculated from the JSON data.

    Returns:
        pd.DataFrame: DataFrame containing the match data
    """
    raw = read_match_json(_url)
    match_list = raw[config.schedule_container][config.schedule_list]
    logger.info("Read %d matches from %s", len(match_list), _url)
    result_list = []
    match_index_dict = {}
    for (_count, _match_data) in enumerate(match_list):
        _row = {}
        for (target_key, org_key) in config.replace_key.items():
            _row[target_key] = _match_data[org_key]
        for (target_key, org_key) in config.score_data_key.items():
            _row[target_key] = _match_data['score'].get(org_key, '')
        _regexp_result = config.section_no.search(_row['section_no'])
        if _regexp_result:
            section_no = int(_regexp_result[1])
        elif matches_in_section is not None:
            section_no = int(_count / matches_in_section) + 1
        else:  # section_no is not specified
            section_no = 0
        _row['section_no'] = section_no
        if section_no not in match_index_dict:
            match_index_dict[section_no] = 1
        else:
            match_index_dict[section_no] += 1
        _row['match_index_in_section'] = match_index_dict[section_no]

        # JFA embeds match status info in 'venueFullName' for irregular matches
        venue_full = _match_data['venueFullName']
        if '【中止】' in venue_full:
            _row['status'] = '試合中止'
            logger.info("Cancelled match: %s", venue_full)
        elif '試合不実施' in venue_full:
            _row['status'] = '試合不実施'
            logger.info("Forfeited match: %s", venue_full)

        # Compute extra-time score from two-half differential values.
        # Some JFA feeds expose only the ET flag, so warn and fall back to 0-0
        # to keep the CSV internally consistent without reviving extraTime.
        score = _match_data['score']
        if score.get('exMatch'):
            missing_ex_score = False
            for side in ('home', 'away'):
                s1 = score.get(f'{side}TeamScore1ex', '')
                s2 = score.get(f'{side}TeamScore2ex', '')
                if s1 != '' and s2 != '':
                    _row[f'{side}_score_ex'] = int(s1) + int(s2)
                else:
                    missing_ex_score = True
            if missing_ex_score:
                logger.warning(
                    "exMatch=true but extra-time scores missing for %s vs %s on %s; "
                    "filling 0-0 extra-time scores",
                    _row['home_team'],
                    _row['away_team'],
                    _row['match_date'],
                )
                _row.setdefault('home_score_ex', 0)
                _row.setdefault('away_score_ex', 0)
        _row['match_date'] = mu.to_datetime_aspossible(_row['match_date'])

        result_list.append(_row)

    return pd.DataFrame(result_list)


def read_group(competition: str) -> None:
    """Reead the match data for the specified competition and update the CSV file.

    Args:
        competition (str): Name of the competition
    """
    if competition not in config.competitions:
        logger.warning("Unknown competition: \"%s\" (available: %s)", competition, config.competition_names)
        return

    comp_conf = config.competitions[competition]
    years = _parse_years(comp_conf.get('years'))
    if years:
        for year in years:
            match_df = read_all_group(comp_conf, year=year)
            if match_df.empty:
                logger.info("Skip %s %d: no match rows", competition, year)
                continue
            _finalize_match_df(match_df, comp_conf, competition)
            mu.update_if_diff(match_df, comp_conf.csv_path.format(year=year))
        return

    match_df = read_all_group(comp_conf)
    _finalize_match_df(match_df, comp_conf, competition)
    mu.update_if_diff(match_df, comp_conf.csv_path)


def _finalize_match_df(match_df: pd.DataFrame, comp_conf: dict[str, Any], competition: str) -> None:
    """Apply post-processing shared by single-year and multi-year fetches."""
    # Apply team name rename if configured
    if 'team_rename' in comp_conf:
        rename_map = dict(comp_conf.team_rename._data)
        for col in ('home_team', 'away_team'):
            match_df[col] = match_df[col].replace(rename_map)
        logger.info("Applied team_rename (%d mappings) to %s", len(rename_map), competition)

    if 'status' in match_df:
        logger.debug("Match status:\n%s", match_df['status'])


def read_all_group(comp_conf: dict[str, Any], year: int = None) -> pd.DataFrame:
    """Read the match data for all groups in the specified competition.

    Args:
        comp_conf (Dict[str, Any]): Configuration for the competition

    Returns:
        pd.DataFrame: DataFrame containing the match data for all groups
    """
    df_list = []
    for group in comp_conf.groups:
        _mis = None
        if 'match_in_section' in comp_conf:
            _mis = comp_conf.match_in_section
        _df = read_jfa_match(_resolve_schedule_url(comp_conf, group, year), _mis)
        _df['group'] = group
        if not _df.empty:
            df_list.append(_df)
    if not df_list:
        return pd.DataFrame()
    match_df = pd.concat(df_list, ignore_index=True)

    # I don't know why but JFA set the local time into 'matchDateJpn' and 'matchTimeJpn'
    if 'timezone_diff' in comp_conf:
        new_time = calc_time_diff(
            match_df['match_date'].map(str),
            match_df['start_time'],
            comp_conf.timezone_diff)
        match_df['match_date'] = new_time.dt.date.strftime(config.standard_date_format)
        match_df['start_time'] = new_time.dt.time.strftime('%H:%M')

    match_df = match_df.sort_values(['group', 'section_no', 'match_index_in_section']).reset_index(drop=True)
    return match_df


def calc_time_diff(org_date: pd.Series, org_time: pd.Series, diff_str: str) -> pd.Series:
    """Apply time difference to the original date and time.

    Args:
        org_date (pd.Series): Original date array (str)
        org_time (pd.Series): Original time array (str)
        time_diff_str (str): Time difference string ex) HH:MM:SS or -HH:MM:SS
    Returns:
        pd.Series: The array of date and time with the time difference applied (pd.Timestamp)
    """
    _sign = 1
    if diff_str.startswith('-'):
        diff_str = diff_str[1:]
        _sign = -1
    diff_list = list(map(int, diff_str.split(':')))
    if len(diff_list) == 1:
        diff_list.append(0)
    if len(diff_list) == 2:
        diff_list.append(0)
    time_diff = _sign * timedelta(hours=diff_list[0], minutes=diff_list[1], seconds=diff_list[2])
    return pd.to_datetime(org_date + 'T' + org_time) + time_diff


def make_args() -> argparse.Namespace:
    """Create command line arguments for the script.

    Returns:
        argparse.Namespace: Parsed command line arguments
    """
    parser = argparse.ArgumentParser(
        description='read_jfamatches.py\n'
                    'Read JFA match data and convert to CSV')

    parser.add_argument('competition', metavar='COMP', type=str, nargs='*',
                        help='The name of the competition to read.'
                        f'{config.competition_names}', default=['PrincePremierE'])
    parser.add_argument('-d', '--debug', action='store_true',
                        help='Enable debug mode.')

    return parser.parse_args()


if __name__ == '__main__':
    os.chdir(Path(__file__).parent)

    args = make_args()
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )

    for compt in args.competition:
        read_group(compt)
