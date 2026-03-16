import json
from pathlib import Path

from match_utils import mu

_ORIGINAL_CONFIG = mu.config
from read_jfamatch import read_jfa_match
import read_jfamatch as read_jfamatch_module
mu.config = _ORIGINAL_CONFIG


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
