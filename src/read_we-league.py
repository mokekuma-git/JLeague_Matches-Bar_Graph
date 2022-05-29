"""2021 ACLグループステージの試合情報を読み込んでCSV, JSO化"""
import re
import os
from typing import Any
from typing import Dict
from typing import List
from datetime import datetime
import argparse

import bs4

import pandas as pd

import requests

from read_jleague_matches import PREFERENCE, update_if_diff

WEL_MATCH_URL = 'https://weleague.jp/matches/'
CSV_FILENAME = '../docs/csv/{}_allmatch_result-we.csv'

MATCH_WEEK_REGEXP = re.compile(r'matchweek(\d+)')
DATE_FORMAT = '%m/%d'
SEASON_THRESHOLD_MONTH = 6
_TODAY = datetime.now().date()
if _TODAY.month <= SEASON_THRESHOLD_MONTH:
    SEASON = _TODAY.year - 1
else:
    SEASON = _TODAY.year


def read_match() -> List[Dict[str, Any]]:
    """WEリーグ公式Webから試合リスト情報を読んで返す"""
    print(f'access {WEL_MATCH_URL}...')
    soup = bs4.BeautifulSoup(requests.get(WEL_MATCH_URL).text, 'lxml')
    return read_match_from_web(soup)


def parse_match_date_data(match: bs4.element.Tag) -> Dict[str, str]:
    r"""与えられた "日付<span>(曜日)</span>時間" を日付と時間に分けて返す

    ex) <span class="time">[空白類]9/12<span>(SUN)</span>10:01[空白類]</span>
    Argument:
        match: 日時データを示すTag要素
        フォーマットは、match_date, start_timeをキーとしたDict形式
    """
    #display(match.contents[0].strip(), match.contents[2].strip())
    match_date = match.contents[0].strip()
    if datetime.strptime(match_date, DATE_FORMAT).date().month <= SEASON_THRESHOLD_MONTH:
        #_date = _date.replace(year=2022)
        match_date = f'{SEASON + 1}/' + match_date
    else:
        #_date = _date.replace(year=2021)
        match_date = f'{SEASON}/' + match_date
    try:
        match_date = pd.to_datetime(match_date)
    except:
        pass
    return {'match_date': match_date,
            'start_time': match.contents[2].strip(),
            'dayofweek': match.contents[1].text.strip('()')}


def read_match_from_web(soup: bs4.BeautifulSoup) -> List[Dict[str, Any]]:
    """各グループの試合リスト情報をHTML内容から読み取る"""
    result_list = []

    for match_box in soup.find_all('div', class_='match-box'):
        # 1節分のmatch-box内
        _index = 1
        section = MATCH_WEEK_REGEXP.match(match_box.get('id'))[1]
        for match_data in match_box.find_all('li', class_='matchContainer'):
            # 1試合分のmatchContainer内
            #display(match_data)
            match_dict = {'section_no': section, 'match_index_in_section': _index}

            # 日時 (<span class="time">[空白類]9/12<span>(SUN)</span>10:01[空白類]</span>)
            match_dict.update(parse_match_date_data(match_data.find('span', class_='time')))
            # スタジアム (ノエビアスタジアム神戸)
            match_dict['stadium'] = match_data.find('span', class_='stadium').text

            teams = match_data.find_all('div', class_='team')
            # ホームチーム (INAC神戸レオネッサ)
            match_dict['home_team'] = teams[0].find('span', class_='name').text
            # ホーム得点 (<span>5</span>)
            home_goal = teams[0].find('span', class_='score')
            if home_goal:
                match_dict['home_goal'] = home_goal.text
            else:
                match_dict['home_goal'] = ''
            # アウェイ得点 (<span>0</span>)
            away_goal = teams[1].find('span', class_='score')
            if away_goal:
                match_dict['away_goal'] = away_goal.text
            else:
                match_dict['away_goal'] = ''
            # アウェイチーム (大宮アルディージャVENTUS)
            match_dict['away_team'] = teams[1].find('span', class_='name').text
            result_list.append(match_dict)
            _index += 1
    return result_list


def make_args() -> argparse.Namespace:
    """引数チェッカ"""
    parser = argparse.ArgumentParser(
        description='read_we-league.py\n'
                    'WEリーグで公開される各大会の試合情報を読み込んでCSVを作成')

    parser.add_argument('-d', '--debug', action='store_true',
                        help='デバッグ出力を表示')

    return parser.parse_args()


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    ARGS = make_args()
    if ARGS.debug:
        PREFERENCE['debug'] = True

    update_if_diff(pd.DataFrame(read_match()), CSV_FILENAME.format(f'{SEASON}-{SEASON+1}'))
