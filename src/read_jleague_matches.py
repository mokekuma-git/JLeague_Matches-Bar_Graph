"""Jリーグ各節の試合情報を読み込み、CSVとして取得、保存
"""
from datetime import datetime
from typing import List, Set, Dict, Any
import re
from glob import glob
from numpy import diff
import pandas as pd
from bs4 import BeautifulSoup
import requests

DEBUG = False
DATE_FORMAT = '%Y%m%d'
_PREFIX = '../csv/match_result-J'

# Jリーグ公開の各節試合情報のURL
SOURCE_URL_FORMAT = 'https://www.jleague.jp/match/section/j{}/{}/'


def read_match_from_web(soup: BeautifulSoup) -> List[Dict[str, Any]]:
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
    """指定されたカテゴリの全て試合をWeb経由で読み込む
    """
    # TODO: 各カテゴリの全試合数はチーム数から出したいところだが、チーム数をどこから取るか？
    match_counts = {1: 39, 2: 43, 3: 31}
    return read_matches_range(category, list(range(1, match_counts[category])))


def read_matches_range(category: int, _range: List[int]) -> pd.DataFrame:
    """指定されたカテゴリの指定された節のデータをWebから読み込む
    """
    _matches = pd.DataFrame()
    for _i in _range:
        _url = SOURCE_URL_FORMAT.format(category, _i)
        print(f'access {_url}...')
        soup = BeautifulSoup(requests.get(_url).text, 'lxml')
        result_list = read_match_from_web(soup)
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


def get_sections_to_update(all_matches: pd.DataFrame,
                           _start: pd.Timestamp, _end: pd.Timestamp) -> Set[str]:
    """startからendまでの対象期間までに、試合が開催された節のセットを返す
    startとend当日に試合が行われる節も含む
    """
    target_sec = set()
    for (_sec, _dates) in get_match_dates_of_section(all_matches).items():
        for _date in _dates:
            if _start <= _date <= _end:
                print(f'add {_sec} for match on {_date} between {_start} - {_end}')
                target_sec.add(_sec)
    return target_sec


def get_latest_allmatches_filename(category: int) -> str:
    """指定されたカテゴリの最新のCSVファイル名を返す
    """
    _filelist = glob(f'../csv/*J{category}*.csv')
    if not _filelist:
        return None
    return _filelist[-1]


def read_latest_allmatches_csv(category: int) -> pd.DataFrame:
    """指定されたカテゴリの最新のCSVファイルを読み込んでDataFrameで返す
    該当ファイルが一つもない場合はエラー
    """
    return read_allmatches_csv(get_latest_allmatches_filename(category))


def read_allmatches_csv(matches_file: str) -> pd.DataFrame:
    """read_jleague_matches.py が書き出した結果のCSVファイルを読み込んでDataFrame構造を再現
        matches_file: 読み込むファイル名
    """
    print('match file "' + matches_file + '" reading.')
    all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
    all_matches['match_date'] = pd.to_datetime(all_matches['match_date'])
    all_matches['home_goal'] = all_matches['home_goal'].fillna('')
    all_matches['away_goal'] = all_matches['away_goal'].fillna('')
    # JSONでNaNをnullとして出力するために、置換
    all_matches = all_matches.where(pd.notnull(all_matches), None)
    return all_matches


def store_all_matches(all_matches: pd.DataFrame, category: int) -> None:
    """試合結果ファイルを実行日を付けた試合データファイルとして保存する
    """
    all_matches.to_csv(f'{_PREFIX}{category}-{datetime.now().strftime(DATE_FORMAT)}.csv')


def update_all_matches(category: int, force_update: bool=False) -> pd.DataFrame:
    """これまでに読み込んだ試合データからの差分をWeb経由で読み込んで、差分を上書きした結果を返す
    該当ファイルが一つもない場合は、全試合のデータをWeb経由で読み込む
    試合データに変化があった場合は、実行日を付けた試合データファイルを保存する
    """
    latest_file = get_latest_allmatches_filename(category)

    # 最新の試合結果が無い場合は、全データを読んで保存して読み込み結果を返す
    if (not latest_file) or force_update:
        all_matches = read_all_matches(category)
        store_all_matches(all_matches, category)
        return all_matches

    current_matches = read_allmatches_csv(latest_file)
    _start = parse_date_from_filename(latest_file)
    _end = datetime.now()
    # undecided = get_undecided_section(current_matches)
    need_update = get_sections_to_update(current_matches, _start, _end)

    if not need_update:
        return current_matches

    diff_matches = read_matches_range(category, need_update)
    old_matches = current_matches[current_matches['section_no'].isin(need_update)]
    print(diff_matches)
    print(old_matches)
    print(diff_matches == old_matches)
    new_matches = pd.concat([current_matches[~current_matches['section_no'].isin(need_update)],
                             diff_matches]).sort_values(['section_no', 'match_index_in_section']).reset_index()
    # store_all_matches(new_matches, category)
    return new_matches


def parse_date_from_filename(filename: str) -> datetime:
    """試合データファイル名から、取得日時を読みだす
    """
    # ファイルフォーマットが想定と違った時のことはあまり考えていない
    date_str = re.search(r'\-(\d{8}).*\.csv', filename)[1]
    return datetime.strptime(date_str, DATE_FORMAT)


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

    if len(sys.argv) <= 1:
        _ARGV = '1-3'
    else:
        _ARGV = sys.argv[1]
    if len(sys.argv) > 2:
        _FORCE_UPDATE_ALL = True
    else:
        _FORCE_UPDATE_ALL = False

    for _category in parse_argv(_ARGV):
        print(f'Start read J{_category} matches...')
        dump_team_file(update_all_matches(_category, _FORCE_UPDATE_ALL), _category)
