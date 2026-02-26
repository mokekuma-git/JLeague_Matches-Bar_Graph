"""Process and save J-League match results from data.j-league.or.jp into CSV files"""
import logging
import os
from pathlib import Path

import pandas as pd

from read_older2020_matches import parse_years
from set_config import Config

logger = logging.getLogger(__name__)

config = Config(Path(__file__).parent / '../config/old_matches.yaml')


def make_old_matches_csv(competition: str, years: list[int] | None = None) -> None:
    """Convert match results of the specified years for the given competition into CSV format

    Args:
        competition: Competition key (e.g. 'J1', 'J2', 'J3')
        years: List of years to process. If None, all years will be processed.

    Returns:
        None
    """
    comp_index = int(competition[1]) - 1
    for year in years:
        filename = config.get_path('match_data.csv_path_format', year=year)
        if not filename.exists():
            logger.warning("File not found: %s", filename)
            continue
        df_dict = make_each_csv(filename, comp_index)
        if not df_dict:
            continue
        for (season, df) in df_dict.items():
            outfile = config.get_path('match_data.league_csv_path', season=season, competition=competition)
            logger.info("Stored: %s (%d rows)", outfile, len(df))
            df.to_csv(outfile, lineterminator='\n', encoding=config.match_data.encoding)


def make_each_csv(filename: str, comp_index: int) -> dict[str, pd.DataFrame]:
    """Convert match results for the specified competition and year into CSV format

    Original data source from data.j-league.or.jp includes multiple competitions in a single year.
    If the season of specified competition is divided into two stages, split and generate CSVs for each stage.
    The season name of multiple stages has suffixes like 'A', 'B', etc. (defined by config.season_suffix)

    Args:
        filename: Path to the input CSV file
        comp_index: Zero-based index into config.league_name

    Returns:
        dict: Dictionary containing DataFrames for each season {season_name: DataFrame}
    """
    _df = pd.read_csv(filename, index_col=0)
    matches = _df[_df['大会'].isin(config.league_name[comp_index])].reset_index(drop=True)
    if matches.empty:
        return []

    year = matches['年度'].value_counts().keys()[0]
    season_dict = init_season_dict(matches, year)

    matches['match_date'] = matches['年度'].astype(str) + \
        '/' + matches['試合日'].str.replace(r'\(.+\)', '', regex=True)
    matches['section_no'] = matches['節'].str.replace('第', '', regex=False) \
        .replace('節.*', '', regex=True).astype('int')
    rename_dict = config.rename_dict.to_dict()
    matches = matches.rename(columns=rename_dict)
    matches['home_goal'] = matches['スコア'].str.replace(r'\-.*$', '', regex=True)
    matches['away_goal'] = matches['スコア'].str.replace(r'^\d+\-', '', regex=True)
    columns_list = config.columns_list.copy()
    if year <= 1998:  # Until 1998, there was a penalty kick rule
        matches['away_goal'] = matches['away_goal'].str.replace(r'\(PK.*', '', regex=True)
        matches['home_pk'] = matches['スコア'].str.extract(r'\(PK(\d+)\-', expand=False)
        matches['home_pk'] = matches['home_pk'].fillna('')
        matches['away_pk'] = matches['スコア'].str.extract(r'\(PK\d+\-(\d+)\)', expand=False)
        matches['away_pk'] = matches['away_pk'].fillna('')
        columns_list.extend(['home_pk', 'away_pk'])
    matches['attendance'] = matches['attendance'].astype('int')

    for (_season, _name) in season_dict.items():
        season_matches = []
        for _group in matches[matches['大会'] == _name].groupby('section_no'):
            _section = _group[1].reset_index(drop=True).reset_index()
            _section['index'] += 1
            _section = _section.rename(columns={'index': 'match_index_in_section'})
            season_matches.append(_section)

        season_dict[_season] = pd.concat(season_matches)[columns_list]

    return season_dict


def init_season_dict(matches: pd.DataFrame, year: int) -> dict[str, str]:
    """Create a dictionary mapping season names to their respective start dates

    Args:
        matches: DataFrame containing match data
        year: Year of the matches

    Returns:
        dict: Dictionary mapping season names to their respective start dates
    """
    season_dict = {}
    season_names = matches['大会'].value_counts().keys()
    if len(season_names) > 1:
        # ex) 1993: ['Ｊ１ サントリー', 'Ｊ１ ＮＩＣＯＳ']
        season_start = {}
        for _name in season_names:
            season_start[_name] = matches[matches['大会'] == _name]['試合日'].iat[0]
        for (_i, _season) in enumerate(sorted(season_start.items(), key=lambda x: x[1])):
            season_dict[str(year) + config.season_suffix[_i]] = _season[0]
    else:
        season_dict[str(year)] = season_names[0]
    logger.debug("Season dict: %s", season_dict)
    return season_dict


if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    for _comp in ['J1', 'J2', 'J3']:
        make_old_matches_csv(_comp, parse_years())
