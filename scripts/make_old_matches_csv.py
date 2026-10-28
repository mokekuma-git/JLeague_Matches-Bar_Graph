"""Process and save J-League match results from data.j-league.or.jp into CSV files"""
from datetime import date
import logging
import os
import re
import sys
import unicodedata
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / 'src'))
sys.path.insert(0, str(_REPO_ROOT / 'scripts' / 'legacy'))

import pandas as pd

from fetch_match_detail import FILTER_ALIASES
from match_utils import MatchUtils, _recalculate_match_index_in_section
from read_older2020_matches import parse_years
from set_config import Config

logger = logging.getLogger(__name__)

config = Config(Path(__file__).parent / 'legacy' / 'old_matches.yaml')


def _derive_status(score: object, match_date: object = None) -> str:
    """Map SFMS01 score text to the published CSV status vocabulary."""
    score_text = '' if pd.isna(score) else str(score).strip()
    if re.match(r'^\d+\-\d+', score_text):
        return '試合終了'
    if '不実施' in score_text:
        return '試合不実施'
    if '中止' in score_text:
        return '試合中止'
    # An explicit vs means the source has not supplied a result.  A delayed
    # update or postponed fixture must not turn into a cancellation as days pass.
    if unicodedata.normalize('NFKC', score_text).casefold() == 'vs':
        return 'ＶＳ'

    if match_date is not None:
        date_text = '' if pd.isna(match_date) else str(match_date).strip()
        try:
            parsed = pd.to_datetime(date_text).date()
        except (ValueError, TypeError):
            parsed = None
        if parsed is not None and parsed >= date.today():
            return 'ＶＳ'

    return '試合中止'


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
    matches['スコア'] = matches['スコア'].fillna('')
    matches['home_goal'] = matches['スコア'].str.replace(r'\-.*$', '', regex=True)
    matches['away_goal'] = matches['スコア'].str.replace(r'^\d+\-', '', regex=True)
    matches['status'] = matches.apply(
        lambda row: _derive_status(row['スコア'], row['match_date']),
        axis=1,
    )
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


_FRAME_ID_JLEAGUECUP = 11  # competition_frame_ids for ルヴァンカップ (SFMS01)

# Round order for section_no assignment, earliest to latest, for the rounds that come
# after 1stラウンド. 1stラウンド's 'N回戦' entries sort numerically ahead of these and
# are not listed here (see _jleaguecup_round_sort_key).
_JLEAGUECUP_FIXED_ROUND_ORDER = ('プレーオフラウンド', '準々決勝', '準決勝', '決勝')

# Bracket-feeder placeholder used by SFMS01 for not-yet-decided later-round teams,
# e.g. '[39]w' (winner of match No.39), '[40]l' (loser of match No.40).
_FEEDER_PLACEHOLDER = re.compile(r'^\[(\d+)\]([wl])$')

# Official match number, embedded at the start of the broadcast column, e.g. 'マッチＮｏ［１］／...'.
_MATCH_NO_PATTERN = re.compile(r'マッチＮｏ［([０-９]+)］')


def _season_label(season_value: object, year: int) -> str:
    """Derive the published season label from a raw SFMS01 シーズン/年度 value.

    A cross-year season 'YYYY/YY' (used from the 2026/27 season onward) becomes
    'YY-YY' (e.g. '2026/27' -> '26-27'). A 4-digit year followed by a non-digit
    suffix (e.g. '2026Jユース', '2026特別') becomes that year ('2026'). Anything
    else falls back to str(year).
    """
    text = str(season_value).strip()
    match = re.match(r'^(\d{4})/(\d{2})$', text)
    if match:
        return f'{match.group(1)[2:]}-{match.group(2)}'
    match = re.match(r'^(\d{4})\D', text)
    if match:
        return match.group(1)
    return str(year)


def _season_label_from_matches(matches: pd.DataFrame, year: int) -> str:
    """Look up the season label from whichever season column the source CSV carries."""
    for col in ('シーズン', '年度'):
        if col in matches.columns and not matches[col].empty:
            return _season_label(matches[col].iat[0], year)
    return str(year)


def _jleaguecup_round_sort_key(round_label: str) -> tuple:
    """Order JLeagueCup rounds by tournament progression rather than by match date.

    4回戦 matches between already-seeded clubs are sometimes played before 3回戦
    finishes (e.g. in 2026: 4回戦第１日 on 10/03, before 3回戦第１日 on 10/14), so
    date-based ordering (as used by match_utils.assign_bracket_section_no) would
    invert them. Order explicitly instead: 1stラウンドの N回戦 (by N) ->
    プレーオフラウンド -> プライムラウンド (準々決勝 -> 準決勝 -> 決勝).
    """
    match = re.match(r'(\d+)回戦$', round_label)
    if match:
        return (0, int(match.group(1)))
    if round_label in _JLEAGUECUP_FIXED_ROUND_ORDER:
        return (1, _JLEAGUECUP_FIXED_ROUND_ORDER.index(round_label))
    return (2, round_label)


def _assign_jleaguecup_section_no(matches: pd.DataFrame) -> pd.DataFrame:
    """Assign section_no from tournament round order and recalculate round-local indexes.

    The earliest present round gets -(number of distinct rounds present), the latest -1
    (matching the bracket-depth convention used elsewhere, see match_utils.CSV_COLUMN_SCHEMA).
    """
    present_rounds = sorted(matches['round'].unique(), key=_jleaguecup_round_sort_key)
    total_rounds = len(present_rounds)
    round_to_section = {
        round_name: index - total_rounds for index, round_name in enumerate(present_rounds)
    }
    result = matches.copy()
    result['section_no'] = result['round'].map(round_to_section)
    return _recalculate_match_index_in_section(result)


def _convert_feeder_placeholder(value: object) -> object:
    """Convert an SFMS01 bracket-feeder placeholder to the frontend's feeder-reference notation.

    '[N]w' -> 'No.Nの勝者', '[N]l' -> 'No.Nの敗者' (matches the
    ``/^No\\.(\\d+)の(勝者|敗者)$/`` pattern the frontend's topology parser expects
    for a block's ``feeder_reference`` topology_source). Values that don't match the
    placeholder shape (i.e. already-decided team names) pass through unchanged.
    """
    match = _FEEDER_PLACEHOLDER.match(str(value).strip())
    if not match:
        return value
    number, kind = match.groups()
    outcome = '勝者' if kind == 'w' else '敗者'
    return f'No.{number}の{outcome}'


def _extract_match_numbers(broadcast: pd.Series) -> pd.Series | None:
    """Extract official マッチＮｏ［N］ numbers from the broadcast column.

    Returns None (caller should fall back to match_card_id) unless every row has one;
    in 2025 only 48/69 rows carried it, so a partial extraction isn't usable on its own.
    """
    def _extract_one(text: object) -> str | None:
        match = _MATCH_NO_PATTERN.search(str(text))
        return match.group(1).translate(_FW_DIGITS) if match else None

    extracted = broadcast.fillna('').map(_extract_one)
    if extracted.isna().any():
        return None
    return extracted


def make_jleaguecup_csv(year: int) -> None:
    """Convert Levain Cup (ルヴァンカップ, formerly YLC/YNC) match results into final CSV.

    Prefers the frame-filtered intermediate CSV (csv/{year}_frame11.csv, fetched with
    competition_frame_ids=11 to stay under the site's 1,500-row search limit on a full
    season); falls back to csv/{year}.csv for years fetched before frame filtering was
    needed. Filters cup matches from it, derives round/leg/match_number columns, assigns
    section_no by tournament round order, and outputs
    docs/csv/{season}_allmatch_result-JLeagueCup.csv (season label e.g. '26-27' for a
    cross-year シーズン like '2026/27', else str(year)).
    """
    frame_filename = config.get_path('match_data.csv_path_format_with_frame',
                                     year=year, frame=_FRAME_ID_JLEAGUECUP)
    filename = frame_filename if frame_filename.exists() else config.get_path(
        'match_data.csv_path_format', year=year)
    if not filename.exists():
        return

    _df = pd.read_csv(filename, index_col=0)
    matches = _df[_df['大会'].str.contains(FILTER_ALIASES['JLeagueCup'], na=False)].reset_index(drop=True)
    if matches.empty:
        return

    season_label = _season_label_from_matches(matches, year)

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

    # Match number: prefer the official マッチＮｏ［N］ broadcast prefix; fall back to
    # match_card_id (2025 semantics) unless every row in this year has it.
    match_numbers = _extract_match_numbers(matches['インターネット中継・TV放送'])
    if match_numbers is None:
        match_numbers = matches['match_card_id'].astype(str)
    matches['match_number'] = match_numbers

    # Rename JP columns → English
    rename_dict = config.rename_dict.to_dict()
    matches = matches.rename(columns=rename_dict)
    matches['スコア'] = matches['スコア'].fillna('')

    # Bracket-feeder placeholders for not-yet-played later rounds, e.g. '[39]w' → 'No.39の勝者'
    matches['home_team'] = matches['home_team'].apply(_convert_feeder_placeholder)
    matches['away_team'] = matches['away_team'].apply(_convert_feeder_placeholder)

    # Parse scores (handles both "1-0" and "1-1 (PK2-4)"; unplayed rows show "vs")
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

    # Status (handles unplayed "vs" rows via the future-match_date branch)
    matches['status'] = matches.apply(
        lambda row: _derive_status(row['スコア'], row['match_date']),
        axis=1,
    )

    # Seed match_index_in_section with per-(round, leg) arrival order (as returned by
    # the site); this also gives each row a CSV row label that restarts per round/leg,
    # matching the committed CSVs. _recalculate_match_index_in_section (below) uses this
    # seed as a same-date tiebreak and to pair up two-leg fixtures, then overwrites it
    # with the final value while preserving row order and these row labels.
    seed_parts = []
    for _, group_df in matches.groupby(['round', 'leg'], sort=False):
        section = group_df.reset_index(drop=True).reset_index()
        section['index'] += 1
        section = section.rename(columns={'index': 'match_index_in_section'})
        seed_parts.append(section)
    matches = pd.concat(seed_parts)

    # section_no by tournament round order + section-aware match_index_in_section
    result = _assign_jleaguecup_section_no(matches)

    columns_list = [
        'match_date', 'section_no', 'match_index_in_section',
        'start_time', 'stadium', 'home_team', 'home_goal', 'away_goal',
        'away_team', 'status', 'round', 'home_pk_score', 'away_pk_score',
    ]
    if 'home_score_ex' in result.columns:
        columns_list.extend(['home_score_ex', 'away_score_ex'])
    columns_list.extend(['leg', 'match_number'])

    # Normalize nullable_int columns to int-strings or empty
    for col in ('leg', 'home_pk_score', 'away_pk_score',
                'home_score_ex', 'away_score_ex', 'match_number'):
        if col in result.columns:
            result[col] = result[col].fillna('').apply(
                lambda x: str(int(float(x))) if x != '' else ''
            )

    outfile = config.get_path('match_data.league_csv_path',
                              season=season_label, competition='JLeagueCup')
    result[columns_list].to_csv(outfile, lineterminator='\n',
                                encoding=config.match_data.encoding)
    logger.info("Stored: %s (%d rows)", outfile, len(result))


_FRAME_ID_JYOUTHCUP = 50  # competition_frame_ids for Ｊユースカップ (SFMS01)

# Knockout round order for section_no assignment, earliest to latest, after the
# numbered 'N回戦' rounds (see _jyouthcup_round_sort_key).
_JYOUTHCUP_FIXED_ROUND_ORDER = ('ラウンド16', '準々決勝', '準決勝', '3位決定戦', '決勝')

_JYOUTHCUP_GROUP_STAGE_PATTERN = re.compile(r'(1st|2nd)ラウンド(.+)$')

# The site spells a few clubs two ways within one season (26/27: one 栃木ＳＣ among
# 栃木SC rows), which would split a group's table into an extra team.  The frontend
# does not apply season_map's team_rename_map, so unify them here.
_JYOUTHCUP_TEAM_ALIASES = {
    '栃木ＳＣ': '栃木SC',
}

_JYOUTHCUP_STAGE_COMPETITION = {
    '1st': 'JYouthCup_1st',
    '2nd': 'JYouthCup_2nd',
    'KO': 'JYouthCup_KO',
}


def _classify_jyouthcup_stage(competition_name: object) -> tuple[str, str] | None:
    """Classify a Ｊユースカップ 大会 value into (stage, group).

    Returns ('1st' | '2nd', group label) for group stages, ('KO', '') for the
    knockout rounds, and None for exhibitions (Showcase Match) that must be
    dropped. Any other value raises ValueError so that an unknown stage in the
    daily cron fails loudly instead of being silently dropped.
    """
    text = unicodedata.normalize('NFKC', str(competition_name)).strip()
    match = _JYOUTHCUP_GROUP_STAGE_PATTERN.search(text)
    if match:
        return match.group(1), match.group(2).strip()
    if 'ノックアウトラウンド' in text:
        return 'KO', ''
    if 'Showcase' in text:
        return None
    raise ValueError(f'Unexpected Ｊユースカップ 大会 value: {competition_name!r}')


def _jyouthcup_round_sort_key(round_label: str) -> tuple:
    """Order Ｊユースカップ knockout rounds by tournament progression.

    'N回戦' (by N) -> ラウンド16 -> 準々決勝 -> 準決勝 -> 3位決定戦 -> 決勝.
    Unknown labels raise ValueError rather than being placed arbitrarily.
    """
    match = re.match(r'(\d+)回戦$', round_label)
    if match:
        return (0, int(match.group(1)))
    if round_label in _JYOUTHCUP_FIXED_ROUND_ORDER:
        return (1, _JYOUTHCUP_FIXED_ROUND_ORDER.index(round_label))
    raise ValueError(f'Unexpected Ｊユースカップ round label: {round_label!r}')


def _jyouthcup_match_date(raw: object) -> str:
    """'YY/MM/DD(曜)' -> 'YYYY/MM/DD'; any other value (e.g. '未定') is kept verbatim."""
    text = '' if pd.isna(raw) else str(raw).strip()
    text = re.sub(r'\(.+\)', '', text)
    if re.match(r'^\d{2}/\d{2}/\d{2}$', text):
        return f'20{text}'
    return text


def _parse_jyouthcup_section_no(section: object) -> int:
    """'第N節' (possibly full-width) -> N. Unknown formats raise ValueError."""
    text = unicodedata.normalize('NFKC', str(section)).strip()
    match = re.match(r'^第(\d+)節$', text)
    if not match:
        raise ValueError(f'Unexpected Ｊユースカップ 節 value: {section!r}')
    return int(match.group(1))


def make_jyouthcup_csv(year: int) -> None:
    """Convert Ｊユースカップ match results into one final CSV per stage.

    Reads the frame-filtered intermediate CSV (csv/{year}_frame50.csv; year is the
    site's competition_years code, e.g. 1026 for the 2026 edition), drops Showcase
    Match exhibitions, and writes docs/csv/{season}_allmatch_result-JYouthCup_{1st,2nd,KO}.csv
    for each stage present. Group stages carry `group` and per-(group, section)
    match_index_in_section; the knockout stage carries `round` and negative
    section_no by tournament round order.
    """
    filename = config.get_path('match_data.csv_path_format_with_frame',
                               year=year, frame=_FRAME_ID_JYOUTHCUP)
    if not filename.exists():
        logger.warning("JYouthCup source not found: %s", filename)
        return

    _df = pd.read_csv(filename, index_col=0)
    if _df.empty:
        return

    classified = _df['大会'].map(_classify_jyouthcup_stage)
    dropped = int(classified.isna().sum())
    if dropped:
        logger.info("Dropped %d Showcase Match rows from %s", dropped, filename)
    matches = _df[classified.notna()].reset_index(drop=True)
    classified = classified[classified.notna()].reset_index(drop=True)
    if matches.empty:
        return

    season_label = _season_label_from_matches(matches, year)

    result = pd.DataFrame({
        'stage': classified.map(lambda c: c[0]),
        'group': classified.map(lambda c: c[1]),
        'match_date': matches['試合日'].map(_jyouthcup_match_date),
        'start_time': matches['K/O時刻'].fillna('').astype(str),
        'stadium': matches['スタジアム'].fillna('').astype(str).replace('●未定●', '未定'),
        'home_team': matches['ホーム'].replace(_JYOUTHCUP_TEAM_ALIASES),
        'away_team': matches['アウェイ'].replace(_JYOUTHCUP_TEAM_ALIASES),
    })
    score = matches['スコア'].fillna('').astype(str)
    goals = score.str.extract(r'^(\d+)-(\d+)')
    result['home_goal'] = goals[0].fillna('')
    result['away_goal'] = goals[1].fillna('')
    pks = score.str.extract(r'\(PK(\d+)-(\d+)\)')
    result['home_pk_score'] = pks[0].fillna('')
    result['away_pk_score'] = pks[1].fillna('')
    result['status'] = [_derive_status(s, d) for s, d in zip(score, result['match_date'])]
    result['match_number'] = matches['match_card_id']
    result['_section'] = matches['節']

    # Normalize nullable_int columns to int-strings or empty
    for col in ('home_goal', 'away_goal', 'home_pk_score', 'away_pk_score', 'match_number'):
        result[col] = result[col].fillna('').apply(
            lambda x: str(int(float(x))) if x != '' else ''
        )

    group_columns = [
        'match_date', 'section_no', 'match_index_in_section',
        'start_time', 'stadium', 'home_team', 'home_goal', 'away_goal',
        'away_team', 'status', 'group', 'match_number',
    ]
    ko_columns = [
        'match_date', 'section_no', 'match_index_in_section',
        'start_time', 'stadium', 'home_team', 'home_goal', 'away_goal',
        'away_team', 'status', 'round', 'home_pk_score', 'away_pk_score',
        'match_number',
    ]

    for stage, stage_df in result.groupby('stage', sort=False):
        stage_df = stage_df.reset_index(drop=True)
        if stage == 'KO':
            stage_df['round'] = stage_df['_section'].map(
                lambda s: unicodedata.normalize('NFKC', str(s)).strip())
            present_rounds = sorted(stage_df['round'].unique(), key=_jyouthcup_round_sort_key)
            total_rounds = len(present_rounds)
            round_to_section = {r: i - total_rounds for i, r in enumerate(present_rounds)}
            stage_df['section_no'] = stage_df['round'].map(round_to_section)
            # Seed with per-round arrival order as the same-date tiebreak
            stage_df['match_index_in_section'] = stage_df.groupby('round').cumcount() + 1
            stage_df = _recalculate_match_index_in_section(stage_df)
            columns_list = ko_columns
        else:
            stage_df['section_no'] = stage_df['_section'].map(_parse_jyouthcup_section_no)
            # 1-based within each (group, section_no): by date (unparseable such as 未定 last),
            # then site order
            stage_df['_date_sort'] = pd.to_datetime(
                stage_df['match_date'], format='%Y/%m/%d', errors='coerce')
            ordered = stage_df.sort_values(['_date_sort'], kind='stable',
                                           na_position='last')
            ordered['match_index_in_section'] = (
                ordered.groupby(['group', 'section_no']).cumcount() + 1)
            stage_df['match_index_in_section'] = ordered['match_index_in_section']
            columns_list = group_columns

        stage_df = stage_df.reset_index(drop=True)
        csv_name = config.get_format_str('match_data.league_csv_path', season=season_label,
                                         competition=_JYOUTHCUP_STAGE_COMPETITION[stage])
        _write_csv_if_changed(stage_df[columns_list], csv_name)


def _write_csv_if_changed(df: pd.DataFrame, csv_name: str) -> None:
    """Write a published CSV and stamp csv_timestamp.csv, but only when its text changes.

    The league view shows each CSV's timestamp, so a competition updated daily needs
    one; an unchanged rerun leaves both files alone. ``csv_name`` is the unresolved
    path (e.g. '../docs/csv/...'), which is the key format of the timestamp file.
    """
    outfile = Path(csv_name).resolve()
    csv_text = df.to_csv(lineterminator='\n')
    encoding = config.match_data.encoding
    if outfile.exists() and outfile.read_text(encoding=encoding) == csv_text:
        logger.info("No changes found in %s", outfile)
        return
    outfile.write_text(csv_text, encoding=encoding)
    stamper = MatchUtils()
    stamper.config = config
    stamper.update_timestamp(csv_name)
    logger.info("Stored: %s (%d rows)", outfile, len(df))


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
                              '(aliases: leaguecup, levain, nabisco). '
                              'Use JYouthCup for the Ｊユースカップ '
                              '(aliases: jyouth, youthcup).')
    # Inject competition arg before parse_years() consumes --year/--range/--list
    _comp_args, _remaining = _parser.parse_known_args()
    sys.argv = [sys.argv[0]] + _remaining  # Let parse_years() handle year args
    years = parse_years()
    _jleaguecup_aliases = {'JLeagueCup', 'leaguecup', 'levain', 'nabisco'}
    _jyouthcup_aliases = {'JYouthCup', 'jyouth', 'youthcup'}
    for _comp in _comp_args.competition:
        if _comp in _jleaguecup_aliases:
            for year in years:
                make_jleaguecup_csv(year)
        elif _comp in _jyouthcup_aliases:
            for year in years:
                make_jyouthcup_csv(year)
        else:
            make_old_matches_csv(_comp, years)
