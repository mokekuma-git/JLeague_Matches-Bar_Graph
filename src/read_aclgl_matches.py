"""2021 ACLグループステージの試合情報を読み込んでCSV, JSO化"""
import datetime
import re
import sys
from typing import Any

from bs4 import BeautifulSoup
import pandas as pd
import requests

from match_utils import update_if_diff
from read_jleague_matches import config

ACL_MATCH_URL = 'https://soccer.yahoo.co.jp/jleague/category/acl/schedule/31194/{}/'
HTTP_TIMEOUT = 60
SECTION_ID_LIST = ['11', '21', '31', '42', '52', '62']
SEASON = datetime.datetime.now().year
CSV_FILENAME = f'../docs/csv/{SEASON}_allmatch_result-ACL_GL.csv'


def read_match(section_id: str) -> list[dict[str, Any]]:
    """スポーツナビサイトから指定された節の各グループの試合リスト情報を読んで返す

    1節～6節は、それぞれSECTION_ID_LISTに対応
    """
    _url = ACL_MATCH_URL.format(section_id)
    print(f'access {_url}...')
    soup = BeautifulSoup(requests.get(_url, timeout=HTTP_TIMEOUT).text, 'lxml')
    return read_match_from_web(soup)


def parse_match_date_data(text: str) -> dict[str, str]:
    r"""与えられた "日付(改行)時間" (4/16（金）\n4:00 など) を日付と時間に分けて返す

    フォーマットは、match_date, start_timeをキーとしたDict形式
    Validationのため、一度datetimeに変換するが、返すのは文字列
    """
    (match_date, start_time) = text.split()
    match_date = pd.to_datetime(SEASON + '/' + match_date[:match_date.index('（')]).date()
    try:
        start_time = pd.to_datetime(start_time).time()
    except (ValueError, pd.errors.ParserError):
        start_time = pd.to_datetime('00:00').time()
    return {'match_date': match_date, 'start_time': str(start_time)}


def parse_match_result_data(text: str) -> dict[str, str]:
    r"""勝敗結果データ ("3 - 1\n試合終了" や "- 試合前" など) をゴール数と状態に分けて返す

    フォーマットは、home_goal, away_goal, statusをキーとしたDict形式
    """
    # 3-1 のようにスペースが無いテキストが来てもOKなように
    text = text.replace('-', ' - ')
    result_list = text.split()
    if len(result_list) <= 3:  # "- 試合前" スタイル
        home_goal = ''
        away_goal = ''
        # result_list[0] は '-'
        match_status = result_list[1]
    else:  # "3 - 1\n試合終了" スタイル
        home_goal = result_list[0]
        # result_list[2] は '-'
        away_goal = result_list[2]
        match_status = result_list[3]

    return {'home_goal': home_goal, 'away_goal': away_goal, 'status': match_status}


def read_match_from_web(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """各グループの試合リスト情報をHTML内容から読み取る"""
    result_list = []

    match_groups = soup.find_all('section', class_='sc-modCommon01')
    _index = 1
    for _section in match_groups:
        group = _section.find('header').text.strip()
        group = group.replace('グループ', '')

        match_table = _section.find('tbody')
        _index = 0
        for _match in match_table.find_all('tr'):
            match_dict = {'group': group}
            # 1試合分のtrタグ内
            td_list = _match.find_all('td')
            # 日時 (4/16（金）\n4:00)
            match_dict.update(parse_match_date_data(td_list[0].text))
            # 節 (第3節)
            match_dict['section_no'] = re.search(r'\d+', td_list[1].text)[0]
            # ホームチーム (アルヒラル)
            match_dict['home_team'] = td_list[2].text.strip()
            # 試合結果 (2 - 2\n試合終了)
            match_dict.update(parse_match_result_data(td_list[3].text))
            # アウェイチーム (イスティクロル)
            match_dict['away_team'] = td_list[4].text.strip()
            # スタジアム (プリンスファイサルビンファハド)
            match_dict['stadium'] = td_list[5].text.strip()
            match_dict['match_index_in_section'] = _index

            result_list.append(match_dict)
            _index += 1
    return result_list


if __name__ == '__main__':
    import os
    from pathlib import Path
    os.chdir(Path(__file__).parent.parent)

    if '--debug' in sys.argv:
        config.debug = True

    match_df = pd.DataFrame()
    for section in SECTION_ID_LIST:
        match_df = pd.concat([match_df, pd.DataFrame(read_match(section))])

    match_df = match_df.sort_values(['section_no', 'match_index_in_section']) \
        .reset_index(drop=True)
    update_if_diff(match_df, CSV_FILENAME)
