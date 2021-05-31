"""Jリーグ各節の試合情報を読み込み、CSVとして取得、保存
"""
import re
from datetime import datetime
import pandas as pd
from bs4 import BeautifulSoup
import requests

DEBUG = False

# Jリーグ公開の各節試合情報のURL
SOURCE_URL_FORMAT = 'https://www.jleague.jp/match/section/j{}/{}/'


def read_match_data(soup: BeautifulSoup):
    """Jリーグの各節の試合情報リストから内容を読み込んで返す
    """
    result_list = []

    match_sections = soup.find_all('section', class_='matchlistWrap')
    i = 1
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
            match_dict['match_index_in_section'] = i
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
            i += 1
    return result_list


def read_all_matches(category: int):
    """指定されたカテゴリの全て試合を読み込む
    """
    match_counts = {1: 39, 2: 43, 3: 30}
    all_matches = pd.DataFrame()
    for _i in range(1, match_counts[category]):
        soup = BeautifulSoup(requests.get(SOURCE_URL_FORMAT.format(category, _i)).text, 'lxml')
        result_list = read_match_data(soup)
        all_matches = pd.concat([all_matches, pd.DataFrame(result_list)])
    all_matches.reset_index(drop=True)
    return all_matches


def parse_argv(arg: str):
    """引数をパースする
        数値と、"数値-数値" の形式を受け取り、範囲全体の数値リストに変換
        1-3 -> [1, 2, 3]
    """
    match = re.match(r'(\d)\-(\d)', arg)
    if match:
        return list(range(int(match[1]), int(match[2]) + 1))
    return [int(arg)]


if __name__ == '__main__':
    import sys
    from make_match_bar_graph import dump_team_file
    _PREFIX = '../csv/match_result-J'
    for _category in parse_argv(sys.argv[1]):
        print(f'Start read J{_category} matches...')
        _DF = read_all_matches(_category)
        _DF.to_csv(f'{_PREFIX}{_category}-{datetime.now().strftime("%Y%m%d")}.csv')
        _DF['match_date'] = _DF['match_date'].dt.strftime('%m/%d')
        dump_team_file(_DF.where(pd.notnull(_DF), None), _category)
