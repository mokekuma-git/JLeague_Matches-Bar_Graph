"""WEリーグの試合情報を読み込んでCSV化"""
import argparse
from datetime import datetime
import os
from pathlib import Path
import re
from typing import Any

import bs4
import pandas as pd
import requests

from match_utils import mu

def init() -> None:
    """Load config and compute runtime values (season, csv path, etc.)."""
    mu.init_config(Path(__file__).parent / '../config/we_league.yaml')

    mu.config.match_week_regexp = re.compile(mu.config.match_week_pattern)
    mu.config.today = datetime.now().date()
    if mu.config.today.month < mu.config.season_start_month:
        mu.config.season = mu.config.today.year - 1
    else:
        mu.config.season = mu.config.today.year
    mu.config.csv_filename = mu.config.get_format_str(
        'paths.csv_format', season=f'{mu.config.season} - {mu.config.season + 1}')


def read_match() -> list[dict[str, Any]]:
    """WEリーグ公式Webから試合リスト情報を読んで返す"""
    _url = mu.config.urls.source_url
    print(f'access {_url}...')
    soup = bs4.BeautifulSoup(requests.get(_url, timeout=mu.config.http_timeout).text, 'lxml')
    return read_match_from_web(soup)


def parse_match_date_data(match: bs4.element.Tag) -> dict[str, str]:
    r"""与えられた "日付<span>(曜日)</span>時間" を日付と時間に分けて返す

    ex) <span class="time">[空白類]9/12<span>(SUN)</span>10:01[空白類]</span>
    Argument:
        match: 日時データを示すTag要素
        フォーマットは、match_date, start_timeをキーとしたDict形式
    """
    match_date = match.contents[0].strip()
    if datetime.strptime(match_date, mu.config.date_format).date().month < mu.config.season_start_month:
        match_date = f'{mu.config.season + 1}/' + match_date
    else:
        match_date = f'{mu.config.season}/' + match_date
    try:
        match_date = pd.to_datetime(match_date)
    except (ValueError, pd.errors.ParserError):
        pass
    return {'match_date': match_date,
            'start_time': match.contents[2].strip(),
            'dayofweek': match.contents[1].text.strip('()')}


def read_match_from_web(soup: bs4.BeautifulSoup) -> list[dict[str, Any]]:
    """各グループの試合リスト情報をHTML内容から読み取る"""
    result_list = []

    for match_box in soup.find_all('div', class_='match-box'):
        # 1節分のmatch-box内
        _index = 1
        section = mu.config.match_week_regexp.match(match_box.get('id'))[1]
        for match_data in match_box.find_all('li', class_='matchContainer'):
            # 1試合分のmatchContainer内
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
    os.chdir(Path(__file__).parent)
    init()

    _args = make_args()
    if _args.debug:
        mu.config.debug = True

    mu.update_if_diff(pd.DataFrame(read_match()), mu.config.csv_filename)
