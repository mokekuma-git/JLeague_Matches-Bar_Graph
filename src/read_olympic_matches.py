"""2020東京オリンピックサッカーグループステージの試合情報を読み込んでCSV, JSO化
"""
import sys
import pandas as pd
import json
import requests
from typing import Dict, Any
sys.path.append('../src/')
from read_jleague_matches import read_allmatches_csv

SCHEDULE_URL_FORMAT = 'https://www.jfa.jp/national_team/u24_2021/tokyo_olympic_2020/group{}/match/schedule.json'
# 'http://www.jfa.jp/match/acl_2021/group{}/match/schedule.json'
SCHEDULE_CONTAINER_NAME = 'matchScheduleList'
SCHEDULE_LIST_NAME = 'matchSchedule'
CSV_FILENAME = '../docs/csv/2021_allmatch_result-Olympic_GS.csv'
JSON_FILENAME = '../docs/json/olympic_points.json'


REPLACE_KEY_DICT = {
    'match_date': 'matchDateJpn',
    'section_no': 'matchTypeName',
    'start_time': 'matchTimeJpn',
    'stadium': 'venue',
    'home_team': 'homeTeamName',
    'away_team': 'awayTeamName',
    'status': 'matchStatus',
    'matchNumber': 'matchNumber'
}
SCORE_DATA_KEY_LIST = {
    'home_goal': 'homeScore',
    'away_goal': 'awayScore',
    'extraTime': 'exMatch'
}

def read_match_json(group: str) -> Dict[str, Any]:
    """各グループの試合リスト情報をjfaのJSON形式で返す
    """
    _url = SCHEDULE_URL_FORMAT.format(group)
    print(f'access {_url}...')
    return json.loads(requests.get(_url).text)

def read_match_df(group: str) -> pd.DataFrame:
    """各グループの試合リスト情報を自分たちのDataFrame形式で返す
    JFA形式のJSONは、1試合の情報が下記のような内容
    {'matchTypeName': '第1節',
     'matchNumber': '1',  # どうやら、Competitionで通しの番号
     'matchDate': '2021/07/22',  # 未使用
     'matchDateJpn': '2021/07/22',
     'matchDateWeek': '木',  # 未使用
     'matchTime': '20:00',  # 未使用
     'matchTimeJpn': '20:00',
     'venue': '東京スタジアム',
     'venueFullName': '東京／東京スタジアム',  # 未使用
     'homeTeamName': '日本',
     'homeTeamQualificationDescription': '',  # 未使用
     'awayTeamName': '南アフリカ',
     'awayTeamQualificationDescription': '',  # 未使用
     'score': {
         'homeWinFlag': False,  # 未使用
         'awayWinFlag': False,  # 未使用
         'homeScore': '',
         'awayScore': '',
         'homeTeamScore1st': '',  # 未使用
         'awayTeamScore1st': '',  # 未使用
         'homeTeamScore2nd': '',  # 未使用
         'awayTeamScore2nd': '',  # 未使用
         'exMatch': False
     },
     'scorer': {
         'homeScorer': [],  # 未使用
         'awayScorer': []  # 未使用
     },
     'matchStatus': '',
     'officialReportURL': ''  # 未使用
    }
    """
    match_list = read_match_json(group)[SCHEDULE_CONTAINER_NAME][SCHEDULE_LIST_NAME]
    # print(match_list)
    result_list = []
    match_index_dict = {}
    for _match_data in match_list:
        _row = {}
        _row['group'] = group
        for (target_key, org_key) in REPLACE_KEY_DICT.items():
            _row[target_key] = _match_data[org_key]
        for (target_key, org_key) in SCORE_DATA_KEY_LIST.items():
            _row[target_key] = _match_data['score'][org_key]
        section_no = _row['section_no']
        if section_no not in match_index_dict:
            match_index_dict[section_no] = 1
        else:
            match_index_dict[section_no] += 1
        _row['match_index_in_section'] = match_index_dict[section_no]
        result_list.append(_row)

    return pd.DataFrame(result_list)


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    if '--skip' not in sys.argv:
        match_df = pd.DataFrame()
    for group in ['A', 'B', 'C', 'D']:
        match_df = pd.concat([match_df, read_match_df(group)])
    match_df = match_df.sort_values(['group', 'section_no', 'match_index_in_section']).reset_index(drop=True)
    match_df.to_csv(CSV_FILENAME)
