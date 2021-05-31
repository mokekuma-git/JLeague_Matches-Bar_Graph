"""Jリーグ各節の試合情報を読み込み、CSVとして取得、保存
"""
from datetime import datetime
from typing import List, Set, Dict, Any
import re
from glob import glob
import pandas as pd
from bs4 import BeautifulSoup
import requests

DEBUG = False

# Jリーグ公開の各節試合情報のURL
SOURCE_URL_FORMAT = 'https://www.jleague.jp/match/section/j{}/{}/'


def read_match_data(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """Jリーグの各節の試合情報リストから内容を読み込んで返す
    """
    result_list = []

    match_sections = soup.find_all('section', class_='matchlistWrap')
    _index = 1
    for _section in match_sections:
        match_div = _section.find('div', class_='timeStamp')
        if match_div:
            match_date = match_div.find('h4').text.strip()
            match_date = datetime.strptime(match_date[:match_date.index('(')], '%Y年%m月%d日')
        else:
            match_date = None
        section_no = _section.find('div', class_='leagAccTit').find('h5').text.strip()
        section_no = re.search('第(.+)節', section_no)[1]
        #print((match_date, section_no))
        for _tr in _section.find_all('tr'):
            match_dict = {}
            match_dict['match_date'] = match_date
            match_dict['section_no'] = section_no
            match_dict['match_index_in_section'] = _index
            stadium_td = _tr.find('td', class_='stadium')
            if not stadium_td:
                continue
            match_dict['start_time'] = re.search(r'([^\>]+)\<br', str(stadium_td))[1]
            match_dict['stadium'] = re.search(r'([^\>]+)\<\/a', str(stadium_td))[1]
            match_dict['home_team'] = _tr.find('td', class_='clubName rightside').text.strip()
            match_dict['home_goal'] = _tr.find('td', class_='point rightside').text.strip()
            match_dict['away_goal'] = _tr.find('td', class_='point leftside').text.strip()
            match_dict['away_team'] = _tr.find('td', class_='clubName leftside').text.strip()
            # str_match_date = (match_date.strftime("%Y/%m/%d") if match_date else '未定')
            if DEBUG:
                print(match_dict)
            result_list.append(match_dict)
            _index += 1
    return result_list


def read_all_matches(category: int) -> pd.DataFrame:
    """指定されたカテゴリの全て試合を読み込む
    """
    match_counts = {1: 39, 2: 43, 3: 30}
    return read_matches_range(category, list(range(1, match_counts[category])))


def read_matches_range(category: int, _range: List[int]) -> pd.DataFrame:
    """指定されたカテゴリの指定された節のデータを読み込む
    """
    _matches = pd.DataFrame()
    for _i in _range:
        soup = BeautifulSoup(requests.get(SOURCE_URL_FORMAT.format(category, _i)).text, 'lxml')
        result_list = read_match_data(soup)
        _matches = pd.concat([_matches, pd.DataFrame(result_list)])
    _matches.reset_index(drop=True)
    return _matches


def get_undecided_section(all_matches: pd.DataFrame) -> Set[str]:
    """開催日未定の節を返す
    """
    return set(all_matches[all_matches['match_date'].isnull()]['section_no'])


def get_match_dates_of_section(all_matches: pd.DataFrame) -> Dict[str, Set[pd.Timestamp]]:
    """各節の開催日リストを返す
    開催日未定の試合は無視
    """
    return all_matches.dropna(
        subset=['match_date']).groupby('section_no')['match_date'].apply(set).to_dict()


def get_sections_to_update(sec_dates: Dict[str, Set[pd.Timestamp]],
                           _start: pd.Timestamp, _end: pd.Timestamp) -> Set[str]:
    """startからendまでの対象期間までに、試合が開催された節のセットを返す
    startとend当日に試合が行われる節も含む
    """
    target_sec = set()
    for (_sec, _dates) in sec_dates.items():
        for _date in _dates:
            if _start < _date < _end:
                target_sec.add(_sec)
    return target_sec


def read_latest_allmatches_csv(category: int) -> pd.DataFrame:
    """指定されたカテゴリの最新のCSVファイルを読み込んでDataFrameで返す
    """
    _matches_file = glob(f'../csv/*J{category}*.csv')[-1]
    return read_allmatches_csv(_matches_file)


def read_allmatches_csv(matches_file: str) -> pd.DataFrame:
    """read_jleague_matches.py が書き出した結果のCSVファイルを読み込んでDataFrame構造を再現
        matches_file: 読み込むファイル名
    """
    print(matches_file)
    all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
    all_matches['match_date'] = pd.to_datetime(all_matches['match_date']).dt.strftime('%m/%d')
    all_matches['home_goal'] = all_matches['home_goal'].fillna('')
    all_matches['away_goal'] = all_matches['away_goal'].fillna('')
    # JSONでNaNをnullとして出力するために、置換
    all_matches = all_matches.where(pd.notnull(all_matches), None)
    return all_matches


def parse_argv(arg: str) -> List[int]:
    """引数をパースする
        数値と、"数値-数値" の形式を受け取り、範囲全体の数値リストに変換
        1-3 -> [1, 2, 3]
    """
    match = re.match(r'(\d)\-(\d)', arg)
    if match:
        return list(range(int(match[1]), int(match[2]) + 1))
    return [int(arg)]


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    import sys
    from make_match_bar_graph import dump_team_file
    _PREFIX = '../csv/match_result-J'

    if len(sys.argv) <= 1:
        _ARGV = '1-3'
    else:
        _ARGV = sys.argv[1]

    for _category in parse_argv(_ARGV):
        print(f'Start read J{_category} matches...')
        _DF = read_all_matches(_category)
        _DF.to_csv(f'{_PREFIX}{_category}-{datetime.now().strftime("%Y%m%d")}.csv')
        _DF['match_date'] = _DF['match_date'].dt.strftime('%m/%d')
        dump_team_file(_DF.where(pd.notnull(_DF), None), _category)
