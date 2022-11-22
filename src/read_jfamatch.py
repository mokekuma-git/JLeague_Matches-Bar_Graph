"""JFAが公開する試合情報を読み込んでCSV化

まずは、プリンス関東のデータを読み込む仕様として、今後パラメータ選択でいろいろなカテゴリを読みに行く作りに変更
年度指定もできるようにする。
"""
import argparse
import json
import re
from typing import Any
from typing import Dict
from datetime import timedelta

import pandas as pd

import requests

from read_jleague_matches import PREFERENCE, update_if_diff

SCHEDULE_URL = 'URL'
CSV_FILENAME = 'CSV'
GROUP_NAMES = 'GROUP'
MATCHES_IN_SECTION = 'MATCHES_IN_SECTION'
TIMEZONE_DIFF = 'TIMEZONE_DIFF'
COMPETITION_CONF = {
    'Olympic': {
        SCHEDULE_URL: 'https://www.jfa.jp/national_team/u24_2021/tokyo_olympic_2020/group{}/match/schedule.json',
        CSV_FILENAME: '../docs/csv/2021_allmatch_result-Olympic_GS.csv',
        GROUP_NAMES: ['A', 'B', 'C', 'D']
    },
    # 'ACL2021GL': {
    #     SCHEDULE_URL: 'http://www.jfa.jp/match/acl_2021/group{}/match/schedule.json',
    #     CSV_FILENAME: '../docs/csv/2021_allmatch_result-ACL_GL.csv',
    #     GROUP_NAMES: ['G', 'H', 'I', 'J']
    # }, # A~Fのグループ情報が無い
    'PrinceKanto': {
        SCHEDULE_URL: 'https://jfa.jp/match_47fa/103_kanto/takamado_jfa_u18_prince2022/kanto1/match/schedule.json',
        CSV_FILENAME: '../docs/csv/2022_allmatch_result-PrinceKanto.csv',
        GROUP_NAMES: ['']
    },
    'PrincePremierE': {
        SCHEDULE_URL: 'https://www.jfa.jp/match/takamado_jfa_u18_premier2022/east/match/schedule.json',
        CSV_FILENAME: '../docs/csv/2022_allmatch_result-PrincePremierE.csv',
        GROUP_NAMES: ['']
    },
    'PrincePremierW': {
        SCHEDULE_URL: 'https://www.jfa.jp/match/takamado_jfa_u18_premier2022/west/match/schedule.json',
        CSV_FILENAME: '../docs/csv/2022_allmatch_result-PrincePremierW.csv',
        GROUP_NAMES: ['']
    },
    'WC2022AFC_F': {
        SCHEDULE_URL: 'https://www.jfa.jp/national_team/samuraiblue/worldcup2022/final_q/group{}/match/schedule.json',
        CSV_FILENAME: '../docs/csv/2022_allmatch_result-wcafc_final.csv',
        GROUP_NAMES: ['A', 'B'],
        MATCHES_IN_SECTION: 3
    },
    'WC2022': {
        SCHEDULE_URL: 'https://www.jfa.jp/national_team/samuraiblue/worldcup_2022/group{}/match/schedule.json',
        CSV_FILENAME: '../docs/csv/2022_allmatch_result-wc_group.csv',
        GROUP_NAMES: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        MATCHES_IN_SECTION: 3,
        TIMEZONE_DIFF: '06:00'
    }
}

SCHEDULE_CONTAINER_NAME = 'matchScheduleList'
SCHEDULE_LIST_NAME = 'matchSchedule'
SECTION_NO = re.compile(r'(\d+)')

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


def read_match_json(_url: str) -> Dict[str, Any]:
    """指定したURLの試合リスト情報をjfaのJSON形式で返す"""
    print(f'access {_url}...')
    return json.loads(requests.get(_url).text)


def read_match_df(_url: str, matches_in_section: int = None) -> pd.DataFrame:
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
         'homeTeamScore1st': '',  # 未使用 前半得点
         'awayTeamScore1st': '',  # 未使用 前半得点
         'homeTeamScore2nd': '',  # 未使用 後半得点
         'awayTeamScore2nd': '',  # 未使用 後半得点
         'exMatch': False,
         'homeTeamScore1ex': '',  # 未使用 延長前半得点
         'awayTeamScore1ex': '',  # 未使用 延長前半得点
         'homeTeamScore2ex': '',  # 未使用 延長後半得点
         'awayTeamScore2ex': '',  # 未使用 延長後半得点
         'homePKScore': '',  # 未使用 PK得点
         'awayPKScore': ''   # 未使用 PK得点
     },
     'scorer': {
         'homeScorer': [],  # 未使用
         'awayScorer': []  # 未使用
     },
     'matchStatus': '',
     'officialReportURL': ''  # 未使用
    }
    """
    match_list = read_match_json(_url)[SCHEDULE_CONTAINER_NAME][SCHEDULE_LIST_NAME]
    # print(match_list)
    result_list = []
    match_index_dict = {}
    for (_count, _match_data) in enumerate(match_list):
        _row = {}
        for (target_key, org_key) in REPLACE_KEY_DICT.items():
            _row[target_key] = _match_data[org_key]
        for (target_key, org_key) in SCORE_DATA_KEY_LIST.items():
            _row[target_key] = _match_data['score'][org_key]
        _regexp_result = SECTION_NO.search(_row['section_no'])
        if _regexp_result:
            section_no = int(_regexp_result[1])
        elif matches_in_section is not None:  # 節数の記載が無く、節ごとの試合数が分かっている時は計算
            section_no = int(_count / matches_in_section) + 1
        else:  # 節数不明
            section_no = 0
        _row['section_no'] = section_no
        if section_no not in match_index_dict:
            match_index_dict[section_no] = 1
        else:
            match_index_dict[section_no] += 1
        _row['match_index_in_section'] = match_index_dict[section_no]

        # U18高円宮杯プリンス関東リーグでの中止情報は、なぜか 'venueFullName' に入っていたので暫定対応
        if '【中止】' in _match_data['venueFullName']:
            _row['status'] = '試合中止'
            if PREFERENCE['debug']:
                print('Cancel Game## ' + _match_data['venueFullName'])
        else:
            if PREFERENCE['debug']:
                print('No Cancel## ' + _match_data['venueFullName'])

        _row['extraTime'] = str(_row['extraTime'])  # 旧CSVとの比較用に文字列化
        try:
            _row['match_date'] = pd.to_datetime(_row['match_date']).dt.date
        except:
            pass

        result_list.append(_row)

    return pd.DataFrame(result_list)


def read_group(competition: str) -> None:
    """指定された大会のグループ全体を読み込んでCSV化"""
    if competition not in COMPETITION_CONF:
        print(f'Unknown competion: "{competition}"\n{list(COMPETITION_CONF.keys())}')
        return

    match_df = pd.DataFrame()
    for group in COMPETITION_CONF[competition][GROUP_NAMES]:
        _mis = None
        if MATCHES_IN_SECTION in COMPETITION_CONF[competition]:
            _mis = COMPETITION_CONF[competition][MATCHES_IN_SECTION]
        _df = read_match_df(COMPETITION_CONF[competition][SCHEDULE_URL].format(group), _mis)
        _df['group'] = group
        match_df = pd.concat([match_df, _df])
    # JFAはなぜか 'matchDateJpn', 'matchTimeJpn' でも現地時間にするのでタイムゾーン分変更
    if TIMEZONE_DIFF in COMPETITION_CONF[competition]:
        time_diff_str = COMPETITION_CONF[competition][TIMEZONE_DIFF]
        time_diff_sign = 1
        if COMPETITION_CONF[competition][TIMEZONE_DIFF].startswith('-'):
            time_diff_str = time_diff_str[1:]
            time_diff_sign = -1
        time_diff = list(map(int, time_diff_str.split(':')))
        if len(time_diff) == 1:
            time_diff.append(0)
        if len(time_diff) == 2:
            time_diff.append(0)
        new_time = pd.to_datetime(match_df['match_date'].map(str) + 'T' + match_df['start_time']) + \
                                  time_diff_sign * timedelta(hours=time_diff[0], minutes=time_diff[1], seconds=time_diff[2])
        match_df['match_date'] = new_time.dt.date
        match_df['start_time'] = new_time.dt.time

    if PREFERENCE['debug']:
        print(match_df['status'])
    match_df = match_df.sort_values(['group', 'section_no', 'match_index_in_section']).reset_index(drop=True)
    update_if_diff(match_df, COMPETITION_CONF[competition][CSV_FILENAME])


def make_args() -> argparse.Namespace:
    """引数チェッカ"""
    parser = argparse.ArgumentParser(
        description='read_jfamatches.py\n'
                    'JFAで公開される各大会の試合情報を読み込んでCSVを作成')

    parser.add_argument('competition', metavar='COMP', type=str, nargs='*',
                        help='大会の名前' + str(list(COMPETITION_CONF.keys())), default='PrinceKanto')
    parser.add_argument('-d', '--debug', action='store_true',
                        help='デバッグ出力を表示')

    return parser.parse_args()


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    ARGS = make_args()
    if ARGS.debug:
        PREFERENCE['debug'] = True

    for competition in ARGS.competition:
        read_group(competition)
