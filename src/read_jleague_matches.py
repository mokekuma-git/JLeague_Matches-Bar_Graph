"""Jリーグ各節の試合情報を読み込み、CSVとして取得、保存"""
import argparse
from datetime import datetime
from datetime import date
from datetime import timedelta
import os
import re
from typing import Any
from typing import Dict
from typing import List
from typing import Set

from bs4 import BeautifulSoup

import pandas as pd

import pytz

import requests

PREFERENCE = {}
# このあたりの変数は、configなどの外部パラメータ化したい
PREFERENCE['debug'] = False
DATE_FORMAT = '%Y%m%d'
LOCAL_TZ = pytz.timezone('Asia/Tokyo')
SEASON = 2024
CSVFILE_FORMAT = '../docs/csv/{}_allmatch_result-J{}.csv'
TIMESTAMP_FILE = '../docs/csv/csv_timestamp.csv'
JLEAGUE_DATE_FORMAT = '%Y年%m月%d日'
STANDARD_DATE_FORMAT = '%Y/%m/%d'

# Jリーグ公開の各節試合情報のURL
SOURCE_URL_FORMAT = 'https://www.jleague.jp/match/section/j{}/{}/'
# Jリーグ公開の順位情報のURL
STANDING_URL_FORMAT = 'https://www.jleague.jp/standings/j{}/'


def read_teams(category: int):
    """各カテゴリのチームリストを返す"""
    _url = STANDING_URL_FORMAT.format(category)
    print(f'access {_url}...')
    soup = BeautifulSoup(requests.get(_url).text, 'lxml')
    return read_teams_from_web(soup, category)


def read_teams_from_web(soup: BeautifulSoup, category: int) -> List[str]:
    """Jリーグの順位情報からチームリストを読み込んで返す"""
    standings = soup.find('table', class_=f'J{category}table')
    if not standings:
        print(f'Can\'t find J{category} teams...')
        return []
    td_teams = standings.find_all('td', class_='tdTeam')
    return [list(_td.stripped_strings)[1] for _td in td_teams]


def read_match(category: int, sec: int) -> pd.DataFrame:
    """指定されたカテゴリの指定された1つの節をデータをWebから読み込む"""
    _url = SOURCE_URL_FORMAT.format(category, sec)
    print(f'access {_url}...')
    soup = BeautifulSoup(requests.get(_url).text, 'lxml')
    return read_match_from_web(soup)


def read_match_from_web(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """Jリーグの各節の試合情報リストから内容を読み込んで返す"""
    result_list = []

    match_sections = soup.find_all('section', class_='matchlistWrap')
    _index = 1
    for _section in match_sections:
        match_div = _section.find('div', class_='timeStamp')
        if match_div:
            match_date = match_div.find('h4').text.strip()
            match_date = datetime.strptime(match_date[:match_date.index('(')], JLEAGUE_DATE_FORMAT).date()
        else:
            match_date = None
        section_no = _section.find('div', class_='leagAccTit').find('h5').text.strip()
        section_no = re.search('第(.+)節', section_no)[1]
        # print((match_date, section_no))
        for _tr in _section.find_all('tr'):
            match_dict = {}
            match_dict['match_date'] = match_date
            match_dict['section_no'] = int(section_no)
            match_dict['match_index_in_section'] = _index
            stadium_td = _tr.find('td', class_='stadium')
            if not stadium_td:
                continue
            _match = re.search(r'([^\>]+)\<br', str(stadium_td))
            match_dict['start_time'] = _match[1] if _match else ""
            _match = re.search(r'([^\>]+)\<\/a', str(stadium_td))
            match_dict['stadium'] = _match[1] if _match else ""
            match_dict['home_team'] = _tr.find('td', class_='clubName rightside').text.strip()
            match_dict['home_goal'] = _tr.find('td', class_='point rightside').text.strip()
            match_dict['away_goal'] = _tr.find('td', class_='point leftside').text.strip()
            match_dict['away_team'] = _tr.find('td', class_='clubName leftside').text.strip()
            # str_match_date = (match_date.strftime("%Y/%m/%d") if match_date else '未定')

            _status = _tr.find('td', class_='status')
            match_dict['status'] = \
                _status.text.strip().replace('\n', '') if _status is not None else '不明'

            if PREFERENCE['debug']:
                print(match_dict)
            result_list.append(match_dict)
            _index += 1
    return result_list


def read_all_matches(category: int) -> pd.DataFrame:
    """指定されたカテゴリの全て試合をWeb経由で読み込む"""
    return read_matches_range(category)


def read_matches_range(category: int, _range: List[int] = None) -> pd.DataFrame:
    """指定されたカテゴリの指定された節リストのデータをWebから読み込む"""
    _matches = pd.DataFrame()
    if not _range:
        teams_count = len(read_teams(category))
        if teams_count % 2 > 0:
            _range = range(1, teams_count * 2 + 1)
        else:
            _range = range(1, (teams_count - 1) * 2 + 1)

    for _i in _range:
        result_list = read_match(category, _i)
        _matches = pd.concat([_matches, pd.DataFrame(result_list)])
    # sortしたりreset_indexした結果を変数に残さないミスは良くやる
    _matches = _matches.sort_values(['section_no', 'match_index_in_section']).reset_index(drop=True)
    return _matches


def get_undecided_section(all_matches: pd.DataFrame) -> Set[str]:
    """開催日未定の節を返す"""
    return set(all_matches[all_matches['match_date'].isnull()]['section_no'])


def get_match_dates_of_section(all_matches: pd.DataFrame) -> Dict[str, Set[pd.Timestamp]]:
    """各節の開催日リストを返す

    開催日未定の試合は無視
    """
    return all_matches.dropna(subset=['match_date']).groupby('section_no').apply(make_kickoff_time)


def make_kickoff_time(_subset: pd.DataFrame) -> Set[pd.Timestamp]:
    """与えられた試合データから、キックオフ時間を作成し、その2時間後 (試合終了時間想定) のセットを返す

    与えられる試合データは同一節のものと想定
    試合開始時間未定の場合は 00:00 キックオフと考える
    同一時間を複数返さないようにするためのセット化を実施
    """
    start_time = _subset['start_time'].str.replace('未定', '00:00')
    result = pd.to_datetime(_subset['match_date'].map(lambda x: x.strftime(STANDARD_DATE_FORMAT)) + ' ' + start_time)
    result = result.dt.tz_localize(LOCAL_TZ)
    return set(result)


def get_sections_to_update(all_matches: pd.DataFrame,
                           _lastupdate: pd.Timestamp, _now: pd.Timestamp) -> Set[str]:
    """startからendまでの対象期間に、試合が開始した節のセットを返す"""
    target_sec = set()
    for (_sec, _dates) in get_match_dates_of_section(all_matches).items():
        for _start in _dates:
            _end = _start + timedelta(hours=2)
            if _lastupdate <= _end and _start <= _now:
                print(f'add "{_sec}" (for match at {_start}-{_end}) between {_lastupdate} - {_now}')
                target_sec.add(_sec)
    target_sec = list(target_sec)
    target_sec.sort()
    return target_sec


def get_latest_allmatches_filename(category: int) -> str:
    """指定されたカテゴリの最新のCSVファイル名を返す

    CSVファイルは常に同一名称に変更 (最新ファイルは毎回上書き)
    """
    return CSVFILE_FORMAT.format(SEASON, category)


def read_latest_allmatches_csv(category: int) -> pd.DataFrame:
    """指定されたカテゴリの最新のCSVファイルを読み込んでDataFrameで返す

    該当ファイルが一つもない場合は空DataFrameを返す
    """
    filename = get_latest_allmatches_filename(category)
    if filename:
        return read_allmatches_csv(filename)
    return pd.DataFrame()


def read_allmatches_csv(matches_file: str) -> pd.DataFrame:
    """read_jleague_matches.py が書き出した結果のCSVファイルを読み込んでDataFrame構造を再現

    Arguments:
        matches_file: 読み込むファイル名
    """
    print(f'match file {matches_file} reading.')
    all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
    if 'index' in all_matches.columns:
        all_matches = all_matches.drop(columns=['index'])
    all_matches['match_date'] = all_matches['match_date'].map(to_datetime_aspossible)
    all_matches['home_goal'] = all_matches['home_goal'].fillna('')
    all_matches['away_goal'] = all_matches['away_goal'].fillna('')
    all_matches['section_no'] = all_matches['section_no'].astype('int')
    all_matches['match_index_in_section'] = all_matches['match_index_in_section'].astype('int')
    # JSONでNaNをnullとして出力するために、置換
    all_matches = all_matches.where(pd.notnull(all_matches), None)
    return all_matches


def to_datetime_aspossible(val):
    """可能な限りTimestamp型として読み込み、不可能な場合は文字列として返す"""
    try:
        return pd.to_datetime(val).date()
    except:
        return val


def update_timestamp(filename: str) -> None:
    """与えられたfilenameのタイムスタンプ日時を現時刻に更新する"""
    if os.path.exists(TIMESTAMP_FILE):
        timestamp = pd.read_csv(TIMESTAMP_FILE, index_col=0, parse_dates=[1])
        timestamp['date'] = timestamp['date'].apply(
            lambda x: x.tz_localize(LOCAL_TZ) if x.tz is None else x.tz_convert(LOCAL_TZ))
        # タイムゾーン記述がない時間はLOCAL_TZ (東京時間) と解釈
        # +09:00 などの記述から付くタイムゾーンはpytz.FixedOffset(540)で、
        # pytz.timezone('Asia/Tokyo')で得られる<DstTzInfo 'Asia/Tokyo' JST+9:00:00 STD>
        # とは異なるので、tz_convertを使って変換しないと代入時にpandasがWarningを出す
    else:
        timestamp = pd.DataFrame(columns=['date'])
        timestamp.index.name = 'file'
    timestamp.loc[filename] = datetime.now().astimezone(LOCAL_TZ)
    timestamp.to_csv(TIMESTAMP_FILE, lineterminator='\n')


def update_all_matches(category: int, force_update: bool = False,
                       need_update:Set[int] = None) -> pd.DataFrame:
    """これまでに読み込んだ試合データからの差分をWeb経由で読み込んで、差分を上書きした結果を返す

    該当ファイルが一つもない場合は、全試合のデータをWeb経由で読み込む
    更新対象の節をneed_updateオプションで指定した場合は、その節の内容を更新
    need_update指定がない場合は、対象ファイルの更新日から現在までに開始した試合のみ更新
    試合データに変化があった場合に実行日を付けた試合データファイルを保存する
    """
    latest_file = get_latest_allmatches_filename(category)

    # 最新の試合結果が無い場合は、全データを読んで保存して読み込み結果を返す
    if (not os.path.exists(latest_file)) or force_update:
        all_matches = read_all_matches(category)
        update_if_diff(all_matches, latest_file)
        return all_matches

    current = read_allmatches_csv(latest_file)
    if not need_update:  # アップデート対象節を指定されていない場合、自動チェック
        _lastupdate = get_timestamp_from_csv(latest_file)
        _now = datetime.now().astimezone(LOCAL_TZ)
        print(f'  Check matches finished since {_lastupdate}')
        # undecided = get_undecided_section(current)
        need_update = get_sections_to_update(current, _lastupdate, _now)

        # チェックしてもアップデートが必要な節が無ければ、最新の状態を返す
        if not need_update:
            return current

    diff_matches = read_matches_range(category, need_update)
    old_matches = current[current['section_no'].isin(need_update)]
    if compare_matches(diff_matches, old_matches):
        new_matches = pd.concat([current[~current['section_no'].isin(need_update)], diff_matches]) \
                        .sort_values(['section_no', 'match_index_in_section']) \
                        .reset_index(drop=True)
        update_if_diff(new_matches, latest_file)
        return new_matches
    return None


def compare_matches(foo_df, bar_df) -> bool:
    """試合情報を比較 (違いがあればTrue)"""
    _foo = foo_df.drop(columns=['match_index_in_section']).fillna('')
    _bar = bar_df.drop(columns=['match_index_in_section']).fillna('')
    _foo = _foo.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)
    _bar = _bar.sort_values(['section_no', 'match_date', 'home_team']).reset_index(drop=True)

    if not _foo.equals(_bar):
        if PREFERENCE['debug']:
            df_comp = _foo.compare(_bar)
            for col_name in df_comp.columns.droplevel(1).unique():
                print(col_name, df_comp[col_name].dropna())
        return True
    return False


def update_if_diff(match_df: pd.DataFrame, filename: str) -> bool:
    """試合DataFrameとファイル名を受け取り、中身に差分があれば更新する"""
    # ファイル名をが無ければ上書きもできないので、異常終了
    if not filename:
        raise ValueError("Filename is mandatory")

    if not os.path.exists(filename):
        # 旧ファイルが無ければ書きこんで終了
        update_csv(match_df, filename)
        return True

    old_df = read_allmatches_csv(filename)
    if compare_matches(match_df, old_df):
        # 旧ファイルと変更があれば書きこんで終了
        update_csv(match_df, filename)
        return True

    # 旧ファイルと最新内容に変更が無いのでそのまま終了
    print(f'No chnges found in {filename}')
    return False


def update_csv(match_df: pd.DataFrame, filename: str) -> None:
    """試合DataFrameとファイル名を受け取り、CSVファイルを作成・更新する"""
    print(f'Update {filename}')
    # pd.Timestamp だけなら元の記述 (日付だけ) をキープしてくれるようだが、
    # 文字列も入ってくると、日付・時間の双方を出してしまうらしいので、
    # 出力前に match_date の内容を文字列にする
    match_df['match_date'] = match_df['match_date'].map(lambda x: str(x) if isinstance(x, date) else x)
    match_df.to_csv(filename, lineterminator='\n')
    update_timestamp(filename)


def get_timestamp_from_csv(filename: str) -> datetime:
    """試合データ更新日CSVから、取得日時を読みだす"""
    if os.path.exists(TIMESTAMP_FILE):
        timestamp = pd.read_csv(TIMESTAMP_FILE, index_col=0, parse_dates=[1])
        timestamp = timestamp[~timestamp.index.duplicated(keep="first")]
        if filename in timestamp.index:
            return timestamp.loc[filename]['date']
    # TIMESTAMP_FILE そのものが無い、filename の時間が記録されていない時はファイルスタンプから
    return datetime.fromtimestamp(os.stat(filename).st_mtime)


def parse_range_csv(args: str) -> Set[int]:
    """カンマで区切られた数値引数リストをパースする
    
    カンマで区切られた数値と、"数値-数値" の形式のリストを受け取り、全要素の和集合を作成する
    '1-3,5,7-10' -> [1, 2, 3, 5, 7, 8, 9, 10]
    """
    return parse_range_list(args.split(','))


def parse_range_list(args: str) -> Set[int]:
    """引数リストをパースする

    数値と、"数値-数値" の形式のリストを受け取り、全要素の和集合を作成する
    ['1-3', '5', '7-10'] -> [1, 2, 3, 5, 7, 8, 9, 10]
    """
    result = set()
    for arg in args:
        result |= set(parse_range(arg))
    return sorted(result)


def parse_range(arg: str) -> Set[int]:
    """引数をパースする

    数値と、"数値-数値" の形式を受け取り、範囲全体の数値リストに変換
    1-3 -> [1, 2, 3]
    """
    match = re.match(r'(\d+)\-(\d+)', arg)
    if match:
        return list(range(int(match[1]), int(match[2]) + 1))
    return [int(arg)]


def make_args() -> argparse.Namespace:
    """引数チェッカ"""
    parser = argparse.ArgumentParser(
        description='read_jleague_matches.py\n'
                    'Jリーグの各カテゴリの試合情報を読み込んでCSV化し、JSONファイルを作成')

    parser.add_argument('category', default=['1-3'], nargs='*',
                        help='リーグカテゴリ (数値指定、複数指定時は-で繋ぐ [default: 1-3])')
    parser.add_argument('-f', '--force_update_all', action='store_true',
                        help='差分を考えずにすべての試合データを読み込んで保存')
    parser.add_argument('-s', '--sections', type=parse_range_csv,
                        help='更新する節を指定する (カンマで区切られた数値指定、範囲指定は-で繋ぐ ex) 1,10-15,20)')
    parser.add_argument('-d', '--debug', action='store_true',
                        help='デバッグ出力を表示')

    return parser.parse_args()


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    ARGS = make_args()
    if ARGS.debug:
        PREFERENCE['debug'] = True

    for _category in parse_range_list(ARGS.category):
        print(f'Start read J{_category} matches...')

        update_all_matches(_category, force_update=ARGS.force_update_all, need_update=ARGS.sections)
