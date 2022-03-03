"""Jリーグデータサイトから、各年の全試合データを取得して保存"""
import re

from bs4 import BeautifulSoup

import pandas as pd

import requests

MATCH_CARD_ID = re.compile(r'/SFMS02/\?match_card_id=(\d+)')


def read_href(td_tag) -> str:
    """取得した試合結果を表すtdタグ内容から、リンク先のhrefを取得し、match_card_idを返す

    リンクが設定されていない時は、Noneを返す
    """
    a_tag = td_tag.find('a')
    if a_tag:
        # print(a_tag['href'])
        return MATCH_CARD_ID.search(a_tag['href'])[1]
    # print(_td)
    return None


def store_year_data(_year: int) -> None:
    """与えられた年のJリーグ試合データを取得し、DataFrame化してファイル保存

    試合結果列にaタグでリンクが張られていた場合は、試合IDを読み取って列に加える
    """
    print(_year)
    _url = 'https://data.j-league.or.jp/SFMS01/search?competition_years={}&tv_relay_station_name='
    _text = requests.request('GET', _url.format(_year)).text
    _df = pd.read_html(_text)[0]
    soup = BeautifulSoup(_text, 'lxml')
    id_list = []
    match_td_list = soup.find_all('td', class_='al-c')
    for _td in match_td_list:
        id_list.append(read_href(_td))
    _df['match_card_id'] = id_list
    _df.to_csv(f'../csv/{_year}.csv')


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    for _year in range(1993, 2021):
        store_year_data(_year)
