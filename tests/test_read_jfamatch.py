import json
from pathlib import Path

from match_utils import mu

_ORIGINAL_CONFIG = mu.config
from read_jfamatch import (
    _finalize_match_df,
    _parse_years,
    _resolve_schedule_url,
    read_jfa_match,
    read_group,
)
import read_jfamatch as read_jfamatch_module
mu.config = read_jfamatch_module.config


def test_read_jfa_match_parses_two_digit_section_numbers(monkeypatch, tmp_path: Path) -> None:
    payload = {
        'matchScheduleList': {
            'matchSchedule': [
                {
                    'matchTypeName': '第10節',
                    'matchNumber': '1001',
                    'matchDate': '2021/10/31',
                    'matchDateJpn': '2021/10/31',
                    'matchDateWeek': '日',
                    'matchTime': '13:00',
                    'matchTimeJpn': '13:00',
                    'venue': '会場A',
                    'venueFullName': '会場A',
                    'homeTeamName': 'A',
                    'homeTeamQualificationDescription': '',
                    'awayTeamName': 'B',
                    'awayTeamQualificationDescription': '',
                    'score': {
                        'homeWinFlag': True,
                        'awayWinFlag': False,
                        'homeScore': '2',
                        'awayScore': '1',
                        'homeTeamScore1st': '',
                        'awayTeamScore1st': '',
                        'homeTeamScore2nd': '',
                        'awayTeamScore2nd': '',
                        'exMatch': False,
                        'homeTeamScore1ex': '',
                        'awayTeamScore1ex': '',
                        'homeTeamScore2ex': '',
                        'awayTeamScore2ex': '',
                        'homePKScore': '',
                        'awayPKScore': '',
                    },
                    'scorer': {'homeScorer': [], 'awayScorer': []},
                    'matchStatus': '試合終了',
                    'officialReportURL': '',
                },
                {
                    'matchTypeName': '第11節',
                    'matchNumber': '1101',
                    'matchDate': '2021/11/06',
                    'matchDateJpn': '2021/11/06',
                    'matchDateWeek': '土',
                    'matchTime': '13:00',
                    'matchTimeJpn': '13:00',
                    'venue': '会場B',
                    'venueFullName': '会場B',
                    'homeTeamName': 'C',
                    'homeTeamQualificationDescription': '',
                    'awayTeamName': 'D',
                    'awayTeamQualificationDescription': '',
                    'score': {
                        'homeWinFlag': False,
                        'awayWinFlag': False,
                        'homeScore': '',
                        'awayScore': '',
                        'homeTeamScore1st': '',
                        'awayTeamScore1st': '',
                        'homeTeamScore2nd': '',
                        'awayTeamScore2nd': '',
                        'exMatch': False,
                        'homeTeamScore1ex': '',
                        'awayTeamScore1ex': '',
                        'homeTeamScore2ex': '',
                        'awayTeamScore2ex': '',
                        'homePKScore': '',
                        'awayPKScore': '',
                    },
                    'scorer': {'homeScorer': [], 'awayScorer': []},
                    'matchStatus': 'ＶＳ',
                    'officialReportURL': '',
                },
            ]
        }
    }

    json_path = tmp_path / 'schedule.json'
    json_path.write_text(json.dumps(payload), encoding='utf-8')

    monkeypatch.setattr(
        read_jfamatch_module,
        'read_match_json',
        lambda _: json.loads(json_path.read_text(encoding='utf-8')),
    )

    actual = read_jfa_match('dummy.json')

    assert actual['section_no'].tolist() == [10, 11]
    assert actual['match_index_in_section'].tolist() == [1, 1]


def test_parse_years_supports_inclusive_ranges() -> None:
    assert _parse_years('1993-1995') == [1993, 1994, 1995]
    assert _parse_years('2015, 2017') == [2015, 2017]
    assert _parse_years(['2024', '2025']) == [2024, 2025]


def test_resolve_schedule_url_prefers_year_override() -> None:
    class DummyCompConf(dict):
        def __getattr__(self, name):
            return self[name]

    comp_conf = DummyCompConf({
        'schedule_url': 'https://example.com/emperorscup_{year}/match/schedule.json',
        'year_overrides': {'2014': 'https://example.com/legacy/2014.json'},
    })

    assert _resolve_schedule_url(comp_conf, '', 2014) == 'https://example.com/legacy/2014.json'
    assert _resolve_schedule_url(comp_conf, '', 2015) == (
        'https://example.com/emperorscup_2015/match/schedule.json'
    )


def test_read_group_writes_only_existing_multi_year_csvs(monkeypatch) -> None:
    class DummyTeamRename:
        _data = {'鹿島アントラーズ': '鹿島'}

    class DummyCompConf(dict):
        def __getattr__(self, name):
            return self[name]

    comp_conf = DummyCompConf({
        'schedule_url': 'https://example.com/emperorscup_{year}/match/schedule.json',
        'csv_path': '../docs/csv/{year}_allmatch_result-EmperorsCup.csv',
        'groups': [''],
        'years': '1993-1994',
        'team_rename': DummyTeamRename(),
    })
    monkeypatch.setitem(read_jfamatch_module.config.competitions._data, 'EmperorsCup', comp_conf)
    setattr(read_jfamatch_module.config.competitions, 'EmperorsCup', comp_conf)

    def fake_read_all_group(conf, year=None):
        if year == 1993:
            return read_jfamatch_module.pd.DataFrame()
        return read_jfamatch_module.pd.DataFrame([
            {
                'match_date': '1994/01/01',
                'section_no': 1,
                'match_index_in_section': 1,
                'start_time': '13:00',
                'stadium': '国立',
                'home_team': '鹿島アントラーズ',
                'home_goal': 2,
                'away_goal': 1,
                'away_team': 'A',
                'status': '試合終了',
                'group': '',
            }
        ])

    written = []

    monkeypatch.setattr(read_jfamatch_module, 'read_all_group', fake_read_all_group)
    monkeypatch.setattr(mu, 'update_if_diff', lambda df, path: written.append((df.copy(), path)))

    read_group('EmperorsCup')

    assert [path for _, path in written] == ['../docs/csv/1994_allmatch_result-EmperorsCup.csv']
    assert written[0][0]['home_team'].tolist() == ['鹿島']


def test_finalize_match_df_assigns_tournament_section_numbers() -> None:
    class DummyTeamRename:
        _data = {'鹿島アントラーズ': '鹿島'}

    class DummyCompConf(dict):
        def __getattr__(self, name):
            return self[name]

    comp_conf = DummyCompConf({
        'team_rename': DummyTeamRename(),
        'tournament': True,
    })
    df = read_jfamatch_module.pd.DataFrame([
        {
            'match_date': '2025/05/25',
            'round': '1回戦',
            'home_team': '鹿島アントラーズ',
            'away_team': 'A',
            'status': '試合終了',
            'match_index_in_section': 9,
            'section_no': 1,
        },
        {
            'match_date': '2025/06/18',
            'round': '準決勝',
            'home_team': 'B',
            'away_team': '鹿島アントラーズ',
            'status': '試合終了',
            'match_index_in_section': 5,
            'section_no': 0,
        },
        {
            'match_date': '2025/11/22',
            'round': '決勝戦',
            'home_team': '鹿島アントラーズ',
            'away_team': 'C',
            'status': '試合終了',
            'match_index_in_section': 7,
            'section_no': 0,
        },
    ])

    actual = _finalize_match_df(df, comp_conf, 'EmperorsCup')

    assert actual['home_team'].tolist()[0] == '鹿島'
    assert actual['section_no'].tolist() == [-3, -2, -1]
    assert actual['match_index_in_section'].tolist() == [1, 1, 1]


def test_finalize_match_df_sorts_by_match_number_when_available() -> None:
    class DummyCompConf(dict):
        def __getattr__(self, name):
            return self[name]

    comp_conf = DummyCompConf({})
    df = read_jfamatch_module.pd.DataFrame([
        {
            'match_date': '2024/09/25',
            'round': '準々決勝',
            'home_team': 'B',
            'away_team': 'C',
            'status': '試合終了',
            'group': '',
            'match_number': '81',
            'section_no': -3,
            'match_index_in_section': 3,
        },
        {
            'match_date': '2024/08/21',
            'round': 'ラウンド16',
            'home_team': 'A',
            'away_team': 'B',
            'status': '試合終了',
            'group': '',
            'match_number': '73',
            'section_no': -4,
            'match_index_in_section': 1,
        },
        {
            'match_date': '2024/09/11',
            'round': '準々決勝',
            'home_team': 'C',
            'away_team': 'D',
            'status': '試合終了',
            'group': '',
            'match_number': '82',
            'section_no': -3,
            'match_index_in_section': 1,
        },
    ])

    actual = _finalize_match_df(df, comp_conf, 'EmperorsCup')

    assert actual['match_number'].tolist() == ['73', '81', '82']
    assert actual['round'].tolist() == ['ラウンド16', '準々決勝', '準々決勝']
