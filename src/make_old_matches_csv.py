from glob import glob
import re
import pandas as pd

LEAGUE_NAME = [['Ｊ１', 'Ｊ１ １ｓｔ', 'Ｊ１ ２ｎｄ', 'Ｊ１ サントリー', 'Ｊ１ ＮＩＣＯＳ'], ['Ｊ２'], ['Ｊ３']]

RENAME_DICT = {
    'K/O時刻': 'start_time', 'スタジアム': 'stadium',
    'ホーム': 'home_team', 'アウェイ': 'away_team',
    'インターネット中継・TV放送': 'broadcast', '入場者数': 'attendance'
}

COLUMNS_LIST = ['match_date', 'section_no', 'match_index_in_section', 'start_time', 'stadium',
                'home_team', 'home_goal', 'away_goal', 'away_team', 'broadcast', 'attendance']
category = 1

def make_old_matches_csv(category: int) -> None:
    """指定カテゴリの1993年から指定年度の試合結果をこのライブラリ用のCSVに変換
    """
    for filename in glob('../csv/[0-9][0-9][0-9][0-9].csv'):
        _df = make_each_csv(filename, category)
        if _df.empty:
            continue
        _year = re.search(r'([0-9][0-9][0-9][0-9]).csv', filename)[1]
        _output = f'../csv/{_year}_allmatch_result-J{category}.csv'
        print(_output, len(_df))
        _df.to_csv(_output)


def make_each_csv(filename: str, category: int) -> pd.DataFrame:
    """指定カテゴリ、指定年度の試合結果をこのライブラリ用のCSVに変換
    """
    _df = pd.read_csv(filename, index_col=0)
    matches = _df[_df['大会'].isin(LEAGUE_NAME[category - 1])].reset_index(drop=True)
    if matches.empty:
        print(_df['大会'].value_counts())
        return pd.DataFrame()

    matches['match_date'] = matches['試合日'].str.replace(r'\(.+\)', '', regex=True)
    matches['section_no'] = matches['節'].str.replace('第', '', regex=False).replace('節.*', '', regex=True).astype('int')
    matches = matches.rename(columns=RENAME_DICT)
    matches['home_goal'] = matches['スコア'].str.replace(r'\-.*', '', regex=True)
    matches['away_goal'] = matches['スコア'].str.replace(r'.*\-', '', regex=True)
    matches['attendance'] = matches['attendance'].astype('int')

    all_matches = pd.DataFrame()
    for _group in matches.groupby('section_no'):
        _section = _group[1].reset_index(drop=True).reset_index()
        _section['index'] += 1
        _section = _section.rename(columns={'index': 'match_index_in_section'})
        all_matches = pd.concat([all_matches, _section])

    all_matches = all_matches[COLUMNS_LIST]

    return all_matches


if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    for category in [1, 2, 3]:
        make_old_matches_csv(category)
