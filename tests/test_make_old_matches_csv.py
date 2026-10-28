from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

from make_old_matches_csv import (
    _assign_jleaguecup_section_no,
    _classify_jyouthcup_stage,
    _convert_feeder_placeholder,
    _derive_status,
    _extract_match_numbers,
    _jleaguecup_round_sort_key,
    _jyouthcup_round_sort_key,
    _season_label,
    config,
    make_each_csv,
    make_jleaguecup_csv,
    make_jyouthcup_csv,
)


def test_derive_status_maps_played_and_unplayed_scores() -> None:
    assert _derive_status('1-0') == '試合終了'
    assert _derive_status('1-1(PK4-5)') == '試合終了'
    assert _derive_status('中止') == '試合中止'
    assert _derive_status('試合不実施') == '試合不実施'
    assert _derive_status('', date.today() + timedelta(days=1)) == 'ＶＳ'
    assert _derive_status(None, date.today() - timedelta(days=1)) == '試合中止'


@pytest.mark.parametrize('score', ['vs', 'VS', 'ＶＳ', 'ｖｓ'])
@pytest.mark.parametrize('match_date', [None, '2000/01/01', '2026/10/03', '2099/01/01'])
def test_explicit_unplayed_score_does_not_become_cancelled(score, match_date) -> None:
    """SFMS01's vs is still scheduled when a result has not been posted yet."""
    assert _derive_status(score, match_date) == 'ＶＳ'


def test_blank_score_on_today_is_not_a_cancellation() -> None:
    assert _derive_status('', date.today()) == 'ＶＳ'


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
    assert _season_label('2026Jユース', 1026) == '2026'
    assert _season_label('2026特別', 1026) == '2026'


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
    monkeypatch.setattr(config.paths, 'timestamp_file', str(tmp_path / 'csv_timestamp.csv'))
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


# --- JYouthCup (Ｊユースカップ) ----------------------------------------------------------


def test_classify_jyouthcup_stage() -> None:
    assert _classify_jyouthcup_stage('Ｊユースカップ １ｓｔラウンド１６') == ('1st', '16')
    assert _classify_jyouthcup_stage('Ｊユースカップ １ｓｔラウンド３') == ('1st', '3')
    assert _classify_jyouthcup_stage('Ｊユースカップ ２ｎｄラウンドＡ') == ('2nd', 'A')
    assert _classify_jyouthcup_stage('Ｊユースカップ ノックアウトラウンド') == ('KO', '')
    assert _classify_jyouthcup_stage('Ｊユースカップ Ｓｈｏｗｃａｓｅ Ｍａｔｃｈ') is None
    with pytest.raises(ValueError, match='謎の大会'):
        _classify_jyouthcup_stage('Ｊユースカップ 謎の大会')


def test_jyouthcup_round_sort_key() -> None:
    rounds = ['決勝', '3位決定戦', '準決勝', '準々決勝', 'ラウンド16', '2回戦', '10回戦', '1回戦']
    assert sorted(rounds, key=_jyouthcup_round_sort_key) == [
        '1回戦', '2回戦', '10回戦', 'ラウンド16', '準々決勝', '準決勝', '3位決定戦', '決勝']
    with pytest.raises(ValueError):
        _jyouthcup_round_sort_key('謎ラウンド')


def _jyouthcup_source_row(
    *, season: str, competition: str, section: str, match_date: str, home: str, away: str,
    score: str, match_card_id: object, start_time: str = '12:00', stadium: str = 'テストＳ',
) -> dict:
    return {
        'シーズン': season,
        '大会': competition,
        '節': section,
        '試合日': match_date,
        'K/O時刻': start_time,
        'ホーム': home,
        'スコア': score,
        'アウェイ': away,
        'スタジアム': stadium,
        '入場者数': 100,
        'インターネット中継・TV放送': '',
        'match_card_id': match_card_id,
    }


_KO = 'Ｊユースカップ ノックアウトラウンド'
_SHOWCASE = 'Ｊユースカップ Ｓｈｏｗｃａｓｅ Ｍａｔｃｈ'


def _write_frame50(base: Path, year: int, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_csv(base / f'{year}_frame50.csv')


def test_make_jyouthcup_csv_knockout(redirected_jleaguecup_paths: Path) -> None:
    season = '2026Jユース'
    rows = [
        _jyouthcup_source_row(season=season, competition=_SHOWCASE, section=None,
                              match_date='26/04/01(水)', home='Ｘ', away='Ｙ',
                              score='1-0', match_card_id=1),
        _jyouthcup_source_row(season=season, competition=_KO, section='決勝',
                              match_date='26/07/20(月・祝)', home='川崎Ｆ', away='湘南',
                              score='2-1', match_card_id=33690),
        _jyouthcup_source_row(season=season, competition=_KO, section='１回戦',
                              match_date='26/05/09(土)', home='秋田', away='札幌',
                              score='1-1(PK2-4)', match_card_id=33601),
        _jyouthcup_source_row(season=season, competition=_KO, section='１回戦',
                              match_date='26/05/10(日)', home='甲', away='乙',
                              score='3-0(没収)', match_card_id=33602),
        _jyouthcup_source_row(season=season, competition=_KO, section='準決勝',
                              match_date='26/07/10(金)', home='丙', away='丁',
                              score='0-0', match_card_id=33680),
    ]
    _write_frame50(redirected_jleaguecup_paths, 1026, rows)

    make_jyouthcup_csv(1026)

    outfile = redirected_jleaguecup_paths / '2026_allmatch_result-JYouthCup_KO.csv'
    assert outfile.exists()
    assert not list(redirected_jleaguecup_paths.glob('*JYouthCup_1st.csv'))
    result = pd.read_csv(outfile, index_col=0, keep_default_na=False, dtype=str)
    assert list(result.columns) == [
        'match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
        'home_team', 'home_goal', 'away_goal', 'away_team', 'status', 'round',
        'home_pk_score', 'away_pk_score', 'match_number']
    assert len(result) == 4  # Showcase row dropped
    assert list(result.index) == ['0', '1', '2', '3']
    by_round = result.drop_duplicates('round').set_index('round')['section_no']
    assert by_round['1回戦'] == '-3'
    assert by_round['準決勝'] == '-2'
    assert by_round['決勝'] == '-1'

    final = result[result['round'] == '決勝'].iloc[0]
    assert final['match_date'] == '2026/07/20'
    assert final['match_number'] == '33690'

    pk = result[result['home_team'] == '秋田'].iloc[0]
    assert (pk['home_goal'], pk['away_goal']) == ('1', '1')
    assert (pk['home_pk_score'], pk['away_pk_score']) == ('2', '4')
    assert pk['match_index_in_section'] == '1'

    forfeit = result[result['home_team'] == '甲'].iloc[0]
    assert (forfeit['home_goal'], forfeit['away_goal']) == ('3', '0')
    assert forfeit['status'] == '試合終了'
    assert forfeit['home_pk_score'] == '' and forfeit['away_pk_score'] == ''
    assert forfeit['match_index_in_section'] == '2'


def test_make_jyouthcup_csv_group_stage(redirected_jleaguecup_paths: Path) -> None:
    season = '2026/27'
    g3 = 'Ｊユースカップ １ｓｔラウンド３'
    g16 = 'Ｊユースカップ １ｓｔラウンド１６'
    rows = [
        _jyouthcup_source_row(season=season, competition=g3, section='第２節',
                              match_date='26/10/02(金)', home='琉球', away='ＹＳ横浜',
                              score='2-4', match_card_id=35203),
        _jyouthcup_source_row(season=season, competition=g3, section='第１節',
                              match_date='26/09/20(日)', home='Ａ', away='Ｂ',
                              score='1-0', match_card_id=35201),
        _jyouthcup_source_row(season=season, competition=g3, section='第２節',
                              match_date='未定', home='Ｃ', away='Ｄ',
                              score='vs', match_card_id='', start_time='',
                              stadium='●未定●'),
        _jyouthcup_source_row(season=season, competition=g3, section='第２節',
                              match_date='25/11/03(月・祝)', home='Ｅ', away='Ｆ',
                              score='vs', match_card_id=''),
        _jyouthcup_source_row(season=season, competition=g16, section='第２節',
                              match_date='26/10/03(土)', home='Ｇ', away='Ｈ',
                              score='vs', match_card_id=''),
    ]
    _write_frame50(redirected_jleaguecup_paths, 2026, rows)

    make_jyouthcup_csv(2026)

    outfile = redirected_jleaguecup_paths / '26-27_allmatch_result-JYouthCup_1st.csv'
    assert outfile.exists()
    result = pd.read_csv(outfile, index_col=0, keep_default_na=False, dtype=str)
    assert list(result.columns) == [
        'match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
        'home_team', 'home_goal', 'away_goal', 'away_team', 'status', 'group', 'match_number']
    assert list(result['group']) == ['3', '3', '3', '3', '16']
    assert list(result['section_no']) == ['2', '1', '2', '2', '2']

    # 第２節 of group 3: dated 2025/11/03, 2026/10/02, then 未定 last
    assert list(result['match_index_in_section']) == ['2', '1', '3', '1', '1']

    undecided = result[result['home_team'] == 'Ｃ'].iloc[0]
    assert undecided['match_date'] == '未定'
    assert undecided['stadium'] == '未定'
    assert undecided['start_time'] == ''
    assert undecided['status'] == 'ＶＳ'
    assert undecided['home_goal'] == '' and undecided['match_number'] == ''

    played = result[result['home_team'] == '琉球'].iloc[0]
    assert (played['home_goal'], played['away_goal'], played['match_number']) == ('2', '4', '35203')
    assert played['status'] == '試合終了'


def test_make_jyouthcup_csv_writes_one_file_per_stage(
        redirected_jleaguecup_paths: Path) -> None:
    season = '2026/27'
    rows = [
        _jyouthcup_source_row(season=season, competition='Ｊユースカップ １ｓｔラウンド１',
                              section='第１節', match_date='26/09/20(日)', home='Ａ', away='Ｂ',
                              score='1-0', match_card_id=1),
        _jyouthcup_source_row(season=season, competition=_KO, section='ラウンド16',
                              match_date='27/03/20(土)', home='Ｃ', away='Ｄ',
                              score='vs', match_card_id=''),
    ]
    _write_frame50(redirected_jleaguecup_paths, 2026, rows)

    make_jyouthcup_csv(2026)

    assert (redirected_jleaguecup_paths / '26-27_allmatch_result-JYouthCup_1st.csv').exists()
    assert (redirected_jleaguecup_paths / '26-27_allmatch_result-JYouthCup_KO.csv').exists()


def test_make_jyouthcup_csv_unifies_team_spellings(redirected_jleaguecup_paths: Path) -> None:
    """26/27 lists 栃木SC once as 栃木ＳＣ; left alone, グループ2 would show five teams."""
    group2 = 'Ｊユースカップ １ｓｔラウンド２'
    rows = [
        _jyouthcup_source_row(season='2026/27', competition=group2, section='第１節',
                              match_date='未定', home='栃木ＳＣ', away='福島',
                              score='vs', match_card_id=''),
        _jyouthcup_source_row(season='2026/27', competition=group2, section='第３節',
                              match_date='未定', home='大宮', away='栃木SC',
                              score='vs', match_card_id=''),
    ]
    _write_frame50(redirected_jleaguecup_paths, 2026, rows)

    make_jyouthcup_csv(2026)

    result = pd.read_csv(redirected_jleaguecup_paths / '26-27_allmatch_result-JYouthCup_1st.csv',
                         index_col=0)
    teams = set(result['home_team']) | set(result['away_team'])
    assert teams == {'栃木SC', '福島', '大宮'}


def test_make_jyouthcup_csv_stamps_only_changed_files(
        redirected_jleaguecup_paths: Path) -> None:
    """The league view shows csv_timestamp.csv, so a changed CSV is stamped; a rerun
    on unchanged input must touch neither file (the daily job commits any diff)."""
    rows = [
        _jyouthcup_source_row(season='2026/27', competition='Ｊユースカップ １ｓｔラウンド１',
                              section='第１節', match_date='26/09/20(日)', home='Ａ', away='Ｂ',
                              score='vs', match_card_id=''),
    ]
    _write_frame50(redirected_jleaguecup_paths, 2026, rows)
    outfile = redirected_jleaguecup_paths / '26-27_allmatch_result-JYouthCup_1st.csv'
    stamp_file = redirected_jleaguecup_paths / 'csv_timestamp.csv'

    make_jyouthcup_csv(2026)
    stamps = pd.read_csv(stamp_file, index_col=0)
    assert stamps.index.tolist() == [str(outfile)]
    first_stamp = stamp_file.read_text(encoding='utf-8')

    make_jyouthcup_csv(2026)
    assert stamp_file.read_text(encoding='utf-8') == first_stamp

    rows[0]['スコア'] = '2-1'
    _write_frame50(redirected_jleaguecup_paths, 2026, rows)
    make_jyouthcup_csv(2026)
    assert stamp_file.read_text(encoding='utf-8') != first_stamp
    assert pd.read_csv(outfile, index_col=0)['status'].tolist() == ['試合終了']


def test_make_jyouthcup_csv_unknown_competition_raises(
        redirected_jleaguecup_paths: Path) -> None:
    rows = [
        _jyouthcup_source_row(season='2026/27', competition='Ｊユースカップ 謎の大会',
                              section='第１節', match_date='26/09/20(日)', home='Ａ', away='Ｂ',
                              score='1-0', match_card_id=1),
    ]
    _write_frame50(redirected_jleaguecup_paths, 2026, rows)

    with pytest.raises(ValueError, match='謎の大会'):
        make_jyouthcup_csv(2026)


def test_make_jyouthcup_csv_missing_input_is_noop(
        redirected_jleaguecup_paths: Path) -> None:
    make_jyouthcup_csv(2026)
    assert not list(redirected_jleaguecup_paths.glob('*JYouthCup*'))
