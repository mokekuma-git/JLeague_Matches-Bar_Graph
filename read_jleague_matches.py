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

COL_NAMES = ['match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
             'home_team', 'home_goal', 'away_goal', 'away_team']

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
            stadium_td = _tr.find('td', class_='stadium')
            if not stadium_td:
                continue
            start_time = re.search('([^\>]+)\<br', str(stadium_td))[1]
            stadium = re.search('([^\>]+)\<\/a', str(stadium_td))[1]
            home_team = _tr.find('td', class_='clubName rightside').text.strip()
            home_goal = _tr.find('td', class_='point rightside').text.strip()
            away_team = _tr.find('td', class_='clubName leftside').text.strip()
            away_goal = _tr.find('td', class_='point leftside').text.strip()
            _str_match_date = (match_date.strftime("%Y/%m/%d") if match_date else '未定')
            if DEBUG:
                print(f'{_str_match_date} {section_no}節 {i} {start_time} [{stadium}]' + \
                      f' {home_team} ({home_goal}) - ({away_goal}) {away_team}')
            # 追加内容は、COL_NAMES に合わせること (追加する時は、必ず同時に更新)
            result_list.append((match_date, section_no, i, start_time, stadium,
                                home_team, home_goal, away_goal, away_team))
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
        all_matches = pd.concat([all_matches, pd.DataFrame(result_list, columns=COL_NAMES)])
    return all_matches


if __name__ == '__main__':
    import sys
    category = int(sys.argv[1])
    all_matches = read_all_matches(category)
    all_matches.to_csv(f'match_result-J{category}-{datetime.now().strftime("%Y%m%d")}.csv')