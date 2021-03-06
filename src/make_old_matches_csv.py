"""過去のJリーグデータを元に、2020年以前の勝敗データをJSON化して保存"""
from glob import glob
from typing import Dict

import pandas as pd

LEAGUE_NAME = [['Ｊ１', 'Ｊ１ １ｓｔ', 'Ｊ１ ２ｎｄ', 'Ｊ１ サントリー', 'Ｊ１ ＮＩＣＯＳ'], ['Ｊ２'], ['Ｊ３']]
SEASON_SUFFIX = ['A', 'B', 'C', 'D', 'E', 'F']

RENAME_DICT = {
    'K/O時刻': 'start_time', 'スタジアム': 'stadium',
    'ホーム': 'home_team', 'アウェイ': 'away_team',
    'インターネット中継・TV放送': 'broadcast', '入場者数': 'attendance'
}

COLUMNS_LIST = ['match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
                'home_team', 'home_goal', 'away_goal', 'away_team',
                'broadcast', 'attendance']


def make_old_matches_csv(category: int) -> None:
    """指定カテゴリの1993年から指定年度の試合結果をこのライブラリ用のCSVに変換"""
    # all_season = pd.DataFrame()
    for filename in glob('../csv/[12][09][0129][0-9].csv'):
        df_dict = make_each_csv(filename, category)
        if not df_dict:
            continue
        for (season, _df) in df_dict.items():
            _output = f'../csv/{season}_allmatch_result-J{category}.csv'
            print(_output, len(_df))
            _df.to_csv(_output)
            # _df['season'] = season
            # all_season = pd.concat([all_season, _df])
    # all_season.to_csv(f'../csv/test_allmatches{category}.csv', encoding='utf-8-sig')


def make_each_csv(filename: str, category: int) -> Dict[str, pd.DataFrame]:
    """指定カテゴリ、指定年度の試合結果をこのライブラリ用のCSVに変換

    二期になっていた場合、各期に分割、CSV化
    """
    _df = pd.read_csv(filename, index_col=0)
    matches = _df[_df['大会'].isin(LEAGUE_NAME[category - 1])].reset_index(drop=True)
    if matches.empty:
        # print(_df['大会'].value_counts())
        return []

    year = matches['年度'].value_counts().keys()[0]
    season_dict = {}
    season_names = matches['大会'].value_counts().keys()
    if len(season_names) > 1:
        # print(year, matches['年度'].value_counts(), season_names)
        season_start = {}
        for _name in season_names:
            season_start[_name] = matches[matches['大会'] == _name]['試合日'].iat[0]
        # print(season_start)
        for (_i, _season) in enumerate(sorted(season_start.items(), key=lambda x: x[1])):
            season_dict[str(year) + SEASON_SUFFIX[_i]] = _season[0]
    else:
        season_dict[str(year)] = season_names[0]
    print(season_dict)

    matches['match_date'] = matches['年度'].astype(str) + \
        '/' + matches['試合日'].str.replace(r'\(.+\)', '', regex=True)
    matches['section_no'] = matches['節'].str.replace('第', '', regex=False) \
        .replace('節.*', '', regex=True).astype('int')
    matches = matches.rename(columns=RENAME_DICT)
    matches['home_goal'] = matches['スコア'].str.replace(r'\-.*$', '', regex=True)
    matches['away_goal'] = matches['スコア'].str.replace(r'^\d+\-', '', regex=True)
    columns_list = COLUMNS_LIST.copy()
    if year <= 1998:  # 1998年まではPKのルールがあった
        matches['away_goal'] = matches['away_goal'].str.replace(r'\(PK.*', '', regex=True)
        matches['home_pk'] = matches['スコア'].str.extract(r'\(PK(\d+)\-', expand=False)
        matches['home_pk'].fillna('')
        matches['away_pk'] = matches['スコア'].str.extract(r'\(PK\d+\-(\d+)\)', expand=False)
        matches['away_pk'].fillna('')
        columns_list.extend(['home_pk', 'away_pk'])
    matches['attendance'] = matches['attendance'].astype('int')

    for (_season, _name) in season_dict.items():
        season_matches = pd.DataFrame()
        for _group in matches[matches['大会'] == _name].groupby('section_no'):
            _section = _group[1].reset_index(drop=True).reset_index()
            _section['index'] += 1
            _section = _section.rename(columns={'index': 'match_index_in_section'})
            season_matches = pd.concat([season_matches, _section])

        season_dict[_season] = season_matches[columns_list]

    return season_dict


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    for _category in [1, 2, 3]:
        make_old_matches_csv(_category)
