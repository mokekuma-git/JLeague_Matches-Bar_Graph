"""Process and save J-League match results from data.j-league.or.jp into CSV files"""
import logging
import os
import re
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / 'src'))
sys.path.insert(0, str(_REPO_ROOT / 'scripts' / 'legacy'))

import pandas as pd

from fetch_match_detail import FILTER_ALIASES
from read_older2020_matches import parse_years
from set_config import Config

logger = logging.getLogger(__name__)

config = Config(Path(__file__).parent / 'legacy' / 'old_matches.yaml')


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
    # Handle column name change between SFMS01 versions (シーズン → 年度)
    if 'シーズン' in _df.columns and '年度' not in _df.columns:
        _df = _df.rename(columns={'シーズン': '年度'})
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
        matches['home_pk_score'] = matches['スコア'].str.extract(r'\(PK(\d+)\-', expand=False)
        matches['home_pk_score'] = matches['home_pk_score'].fillna('')
        matches['away_pk_score'] = matches['スコア'].str.extract(r'\(PK\d+\-(\d+)\)', expand=False)
        matches['away_pk_score'] = matches['away_pk_score'].fillna('')
        columns_list.extend(['home_pk_score', 'away_pk_score'])
    if 'home_score_ex' in matches.columns:
        for col in ('home_score_ex', 'away_score_ex'):
            matches[col] = matches[col].fillna('').apply(
                lambda x: str(int(float(x))) if x != '' else ''
            )
        columns_list.extend(['home_score_ex', 'away_score_ex'])
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


_FW_DIGITS = str.maketrans('０１２３４５６７８９', '0123456789')


def _derive_round(competition_name: str, section: str) -> str:
    """Derive round name from SFMS01 大会 and 節 columns."""
    if '1stラウンド' in competition_name:
        m = re.match(r'([０-９\d]+回戦)', section)
        return m.group(1).translate(_FW_DIGITS) if m else section
    if 'プレーオフ' in competition_name:
        return 'プレーオフラウンド'
    if 'プライム' in competition_name:
        for prefix in ('準々決勝', '準決勝', '決勝'):
            if section.startswith(prefix):
                return prefix
    return section.translate(_FW_DIGITS)


def _derive_leg(section: str) -> str:
    """Derive H&A leg number from 節 column. Returns '' for single-match rounds."""
    m = re.search(r'第([０-９\d]+)戦', section)
    if m:
        return m.group(1).translate(_FW_DIGITS)
    return ''


def make_jleaguecup_csv(year: int) -> None:
    """Convert Levain Cup (YLC) match results from intermediate CSV into final CSV.

    Filters YLC matches from csv/{year}.csv, derives round/leg columns,
    and outputs docs/csv/{year}_allmatch_result-JLeagueCup.csv.
    """
    filename = config.get_path('match_data.csv_path_format', year=year)
    if not filename.exists():
        return

    _df = pd.read_csv(filename, index_col=0)
    matches = _df[_df['大会'].str.contains(FILTER_ALIASES['JLeagueCup'], na=False)].reset_index(drop=True)
    if matches.empty:
        return

    # Date: YY/MM/DD(day) → YYYY/MM/DD
    raw_date = matches['試合日'].str.replace(r'\(.+\)', '', regex=True)
    matches['match_date'] = raw_date.apply(
        lambda d: f'20{d}' if d.count('/') >= 2 else f'{year}/{d}'
    )

    # Round and leg derivation
    matches['round'] = matches.apply(
        lambda r: _derive_round(str(r['大会']), str(r['節'])), axis=1
    )
    matches['leg'] = matches['節'].apply(lambda s: _derive_leg(str(s)))

    matches['section_no'] = 0

    # Rename JP columns → English
    rename_dict = config.rename_dict.to_dict()
    matches = matches.rename(columns=rename_dict)

    # Parse scores (handles both "1-0" and "1-1 (PK2-4)")
    score_parts = matches['スコア'].str.extract(r'^(\d+)-(\d+)')
    matches['home_goal'] = score_parts[0].fillna('')
    matches['away_goal'] = score_parts[1].fillna('')

    # PK scores
    matches['home_pk_score'] = matches['スコア'].str.extract(
        r'\(PK(\d+)-', expand=False).fillna('')
    matches['away_pk_score'] = matches['スコア'].str.extract(
        r'\(PK\d+-(\d+)\)', expand=False).fillna('')

    # ET scores from enrich
    if 'home_score_ex' in matches.columns:
        for col in ('home_score_ex', 'away_score_ex'):
            matches[col] = matches[col].fillna('').apply(
                lambda x: str(int(float(x))) if x != '' else ''
            )

    # Status
    matches['status'] = matches['スコア'].apply(
        lambda x: '試合終了' if pd.notna(x) and re.match(r'\d', str(x)) else 'ＶＳ'
    )

    # match_index_in_section: sequential within each round+leg group
    result_parts = []
    for _, group_df in matches.groupby(['round', 'leg'], sort=False):
        section = group_df.reset_index(drop=True).reset_index()
        section['index'] += 1
        section = section.rename(columns={'index': 'match_index_in_section'})
        result_parts.append(section)
    result = pd.concat(result_parts)

    columns_list = [
        'match_date', 'section_no', 'match_index_in_section',
        'start_time', 'stadium', 'home_team', 'home_goal', 'away_goal',
        'away_team', 'status', 'round', 'home_pk_score', 'away_pk_score',
    ]
    if 'home_score_ex' in result.columns:
        columns_list.extend(['home_score_ex', 'away_score_ex'])
    columns_list.append('leg')

    # Normalize nullable_int columns to int-strings or empty
    for col in ('leg', 'home_pk_score', 'away_pk_score',
                'home_score_ex', 'away_score_ex'):
        if col in result.columns:
            result[col] = result[col].fillna('').apply(
                lambda x: str(int(float(x))) if x != '' else ''
            )

    outfile = config.get_path('match_data.league_csv_path',
                              season=str(year), competition='JLeagueCup')
    result[columns_list].to_csv(outfile, lineterminator='\n',
                                encoding=config.match_data.encoding)
    logger.info("Stored: %s (%d rows)", outfile, len(result))


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
    os.chdir(_REPO_ROOT / 'src')
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%H:%M:%S',
    )
    import argparse as _ap
    _parser = _ap.ArgumentParser(
        description='Convert SFMS01 intermediate CSV to published CSV',
        parents=[],
    )
    _parser.add_argument('--competition', nargs='*',
                         default=['J1', 'J2', 'J3'],
                         help='Competitions to process (default: J1 J2 J3). '
                              'Use JLeagueCup for Levain/Nabisco Cup '
                              '(aliases: leaguecup, levain, nabisco).')
    # Inject competition arg before parse_years() consumes --year/--range/--list
    _comp_args, _remaining = _parser.parse_known_args()
    sys.argv = [sys.argv[0]] + _remaining  # Let parse_years() handle year args
    years = parse_years()
    _jleaguecup_aliases = {'JLeagueCup', 'leaguecup', 'levain', 'nabisco'}
    for _comp in _comp_args.competition:
        if _comp in _jleaguecup_aliases:
            for year in years:
                make_jleaguecup_csv(year)
        else:
            make_old_matches_csv(_comp, years)
