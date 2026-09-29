from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

from make_old_matches_csv import (
    _assign_jleaguecup_section_no,
    _convert_feeder_placeholder,
    _derive_status,
    _extract_match_numbers,
    _jleaguecup_round_sort_key,
    _season_label,
    config,
    make_each_csv,
    make_jleaguecup_csv,
)


def test_derive_status_maps_played_and_unplayed_scores() -> None:
    assert _derive_status('1-0') == '試合終了'
    assert _derive_status('1-1(PK4-5)') == '試合終了'
    assert _derive_status('中止') == '試合中止'
    assert _derive_status('試合不実施') == '試合不実施'
    assert _derive_status('', date.today() + timedelta(days=1)) == 'ＶＳ'
    assert _derive_status(None, date.today() - timedelta(days=1)) == '試合中止'


def test_make_each_csv_adds_status_for_legacy_league_csv(tmp_path: Path) -> None:
    src = pd.DataFrame(
        [
            {
                '年度': 2020,
                '大会': 'Ｊ１',
                '試合日': '02/21(金)',
                '節': '第1節',
                'K/O時刻': '19:00',
                'スタジアム': '国立',
                'ホーム': 'A',
                'アウェイ': 'B',
                'スコア': '1-0',
                'インターネット中継・TV放送': 'DAZN',
                '入場者数': 10000,
            },
            {
                '年度': 2020,
                '大会': 'Ｊ１',
                '試合日': '02/22(土)',
                '節': '第1節',
                'K/O時刻': '14:00',
                'スタジアム': '埼玉',
                'ホーム': 'C',
                'アウェイ': 'D',
                'スコア': '中止',
                'インターネット中継・TV放送': 'NHK',
                '入場者数': 20000,
            },
        ]
    )
    csv_path = tmp_path / '2020.csv'
    src.to_csv(csv_path)

    result = make_each_csv(str(csv_path), 0)

    season = result['2020']
    assert 'status' in season.columns
    assert season['status'].tolist() == ['試合終了', '試合中止']
    assert season.columns.tolist()[:10] == [
        'match_date',
        'section_no',
        'match_index_in_section',
        'start_time',
        'stadium',
        'home_team',
        'home_goal',
        'away_goal',
        'away_team',
        'status',
    ]


def test_make_each_csv_marks_future_blank_score_as_vs(tmp_path: Path) -> None:
    future = date.today() + timedelta(days=30)
    src = pd.DataFrame(
        [
            {
                '年度': future.year,
                '大会': 'Ｊ１',
                '試合日': future.strftime('%m/%d(日)'),
                '節': '第1節',
                'K/O時刻': '14:00',
                'スタジアム': '埼玉',
                'ホーム': 'C',
                'アウェイ': 'D',
                'スコア': '',
                'インターネット中継・TV放送': 'NHK',
                '入場者数': 20000,
            },
        ]
    )
    csv_path = tmp_path / 'future.csv'
    src.to_csv(csv_path)

    result = make_each_csv(str(csv_path), 0)

    season = result[str(future.year)]
    assert season['status'].tolist() == ['ＶＳ']


# --- JLeagueCup (Levain Cup / ルヴァンカップ) helpers -----------------------------------


def test_season_label_cross_year_and_plain() -> None:
    """'YYYY/YY' シーズン (2026/27 onward) becomes 'YY-YY'; anything else falls back to str(year)."""
    assert _season_label('2026/27', 2026) == '26-27'
    assert _season_label(2025, 2025) == '2025'
    assert _season_label('2025', 2025) == '2025'


def test_jleaguecup_round_sort_key_orders_rounds_by_progression() -> None:
    """Rounds sort by tournament progression, not by any date, so callers can order
    section_no correctly even when a later round is played before an earlier one."""
    rounds = ['決勝', '4回戦', '準決勝', '1回戦', 'プレーオフラウンド', '3回戦', '準々決勝', '2回戦']
    ordered = sorted(rounds, key=_jleaguecup_round_sort_key)
    assert ordered == [
        '1回戦', '2回戦', '3回戦', '4回戦',
        'プレーオフラウンド', '準々決勝', '準決勝', '決勝',
    ]


def test_convert_feeder_placeholder() -> None:
    """'[N]w'/'[N]l' become the frontend's feeder-reference notation; other values pass through."""
    assert _convert_feeder_placeholder('[39]w') == 'No.39の勝者'
    assert _convert_feeder_placeholder('[40]l') == 'No.40の敗者'
    assert _convert_feeder_placeholder('鹿島') == '鹿島'


def test_extract_match_numbers_requires_full_coverage() -> None:
    """Only usable when every row has マッチＮｏ［N］; a single miss means 'fall back' (None)."""
    all_present = pd.Series(['マッチＮｏ［１］／DAZN', 'マッチＮｏ［１３］／DAZN'])
    extracted = _extract_match_numbers(all_present)
    assert extracted is not None
    assert extracted.tolist() == ['1', '13']

    partial = pd.Series(['マッチＮｏ［１］／DAZN', 'DAZNのみ'])
    assert _extract_match_numbers(partial) is None


def test_assign_jleaguecup_section_no_orders_by_round_not_date() -> None:
    """4回戦 played before 3回戦 (2026: seeded clubs on 10/03 vs 3回戦 on 10/14) must not
    invert section_no; ordering follows round progression, not first match date."""
    df = pd.DataFrame([
        {'round': '4回戦', 'match_date': '2026/10/03', 'leg': '', 'home_team': 'G', 'away_team': 'H'},
        {'round': '1回戦', 'match_date': '2026/09/02', 'leg': '', 'home_team': 'A', 'away_team': 'B'},
        {'round': '3回戦', 'match_date': '2026/10/14', 'leg': '', 'home_team': 'E', 'away_team': 'F'},
        {'round': '2回戦', 'match_date': '2026/09/29', 'leg': '', 'home_team': 'C', 'away_team': 'D'},
    ])

    result = _assign_jleaguecup_section_no(df)

    by_round = result.set_index('round')['section_no']
    assert by_round['1回戦'] == -4
    assert by_round['2回戦'] == -3
    assert by_round['3回戦'] == -2
    assert by_round['4回戦'] == -1


@pytest.fixture
def redirected_jleaguecup_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point make_jleaguecup_csv's I/O paths at tmp_path so tests never touch csv/ or docs/csv/."""
    monkeypatch.setattr(config.match_data, 'csv_path_format', str(tmp_path / '{year}.csv'))
    monkeypatch.setattr(config.match_data, 'csv_path_format_with_frame',
                         str(tmp_path / '{year}_frame{frame}.csv'))
    monkeypatch.setattr(config.match_data, 'league_csv_path',
                         str(tmp_path / '{season}_allmatch_result-{competition}.csv'))
    return tmp_path


def _jleaguecup_source_row(
    *, season: str, competition: str, section: str, match_date: str,
    home: str, away: str, score: str, broadcast: str, match_card_id: int,
    stadium: str = 'テストＳ',
) -> dict:
    return {
        'シーズン': season,
        '大会': competition,
        '節': section,
        '試合日': match_date,
        'K/O時刻': '19:00',
        'ホーム': home,
        'スコア': score,
        'アウェイ': away,
        'スタジアム': stadium,
        '入場者数': 1000,
        'インターネット中継・TV放送': broadcast,
        'match_card_id': match_card_id,
    }


def test_make_jleaguecup_csv_2026_round_order_and_placeholders(
        redirected_jleaguecup_paths: Path) -> None:
    """End-to-end regression for the 2026/27 ルヴァンカップ pipeline: season label,
    round-order section_no (not date order), マッチＮｏ-based match_number, and
    bracket-feeder placeholder conversion for a not-yet-decided later round."""
    rows = [
        _jleaguecup_source_row(
            season='2026/27', competition='ルヴァンカップ 1stラウンド',
            section='１回戦第１日', match_date='26/09/02(水)', home='Ａ', away='Ｂ',
            score='1-0', broadcast='マッチＮｏ［１］／テレビ', match_card_id=90001,
        ),
        _jleaguecup_source_row(
            season='2026/27', competition='ルヴァンカップ 1stラウンド',
            section='２回戦第１日', match_date='26/09/29(火)', home='Ｃ', away='Ｄ',
            score='2-1', broadcast='マッチＮｏ［２］／テレビ', match_card_id=90002,
        ),
        # 3回戦: later date (10/14), not yet played
        _jleaguecup_source_row(
            season='2026/27', competition='ルヴァンカップ 1stラウンド',
            section='３回戦第１日', match_date='26/10/14(水)', home='Ｅ', away='Ｆ',
            score='vs', stadium='●未定●', broadcast='マッチＮｏ［３］', match_card_id=90003,
        ),
        # 4回戦 (seeded clubs' day): earlier date (10/03) than 3回戦, must still sort after it
        _jleaguecup_source_row(
            season='2026/27', competition='ルヴァンカップ 1stラウンド',
            section='４回戦第１日', match_date='26/10/03(土)', home='Ｇ', away='Ｈ',
            score='vs', broadcast='マッチＮｏ［４］', match_card_id=90004,
        ),
        # 4回戦 second day: feeder placeholders referencing match numbers 3 and 4
        _jleaguecup_source_row(
            season='2026/27', competition='ルヴァンカップ 1stラウンド',
            section='４回戦第２日', match_date='26/10/28(水)', home='[3]w', away='[4]l',
            score='vs', stadium='●未定●', broadcast='マッチＮｏ［５］', match_card_id=90005,
        ),
    ]
    pd.DataFrame(rows).to_csv(redirected_jleaguecup_paths / '2026.csv')

    make_jleaguecup_csv(2026)

    outfile = redirected_jleaguecup_paths / '26-27_allmatch_result-JLeagueCup.csv'
    assert outfile.exists()
    result = pd.read_csv(outfile, index_col=0)

    # Season label: '2026/27' → '26-27'
    by_round = result.set_index('round')['section_no']
    assert by_round['1回戦'] == -4
    assert by_round['2回戦'] == -3
    assert by_round['3回戦'] == -2
    assert (result.loc[result['round'] == '4回戦', 'section_no'] == -1).all()

    # マッチＮｏ present on every row → used as match_number (not match_card_id)
    assert sorted(result['match_number'].tolist()) == [1, 2, 3, 4, 5]

    # Feeder placeholders converted to the frontend's "No.N の勝者/敗者" notation
    placeholder_row = result[result['match_number'] == 5].iloc[0]
    assert placeholder_row['home_team'] == 'No.3の勝者'
    assert placeholder_row['away_team'] == 'No.4の敗者'

    # Future, not-yet-played rows get ＶＳ status and empty goals
    unplayed = result[result['match_number'].isin([3, 4, 5])]
    assert (unplayed['status'] == 'ＶＳ').all()
    assert unplayed['home_goal'].isna().all()

    # Already-played rows keep normal scoring
    played = result[result['match_number'].isin([1, 2])]
    assert (played['status'] == '試合終了').all()


def test_make_jleaguecup_csv_match_number_fallback_to_match_card_id(
        redirected_jleaguecup_paths: Path) -> None:
    """When even one cup row lacks マッチＮｏ［N］, match_number falls back to
    match_card_id for the whole year (2025 semantics: only 48/69 rows carried it)."""
    rows = [
        _jleaguecup_source_row(
            season='2025', competition='ＹＬＣ 1stラウンド',
            section='１回戦', match_date='25/03/20(木)', home='Ａ', away='Ｂ',
            score='1-0', broadcast='マッチＮｏ［１］／テレビ', match_card_id=80001,
        ),
        _jleaguecup_source_row(
            season='2025', competition='ＹＬＣ 1stラウンド',
            section='１回戦', match_date='25/03/20(木)', home='Ｃ', away='Ｄ',
            score='2-1', broadcast='テレビのみ（マッチＮｏ無し）', match_card_id=80002,
        ),
    ]
    pd.DataFrame(rows).to_csv(redirected_jleaguecup_paths / '2025.csv')

    make_jleaguecup_csv(2025)

    outfile = redirected_jleaguecup_paths / '2025_allmatch_result-JLeagueCup.csv'
    assert outfile.exists()
    result = pd.read_csv(outfile, index_col=0)
    assert sorted(result['match_number'].tolist()) == [80001, 80002]
