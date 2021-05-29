"""read_jleague_matches.pyで読み取ったJリーグ試合結果から、各チームの勝ち点積み上げ棒グラフを作成
"""
import pandas as pd

CATEGORY_TOP_TEAMS = [3, 2, 2]
CATEGORY_BOTTOM_TEAMS = [4, 4, 0]
CATEGORY_TEAMS_COUNT = [20, 22, 15]


def make_insert_columns(category: int):
    """各カテゴリの勝ち点列を入れる敷居位置を決定
        昇格チーム (ACL出場チーム)、中間、降格チームの位置に挟む
    """
    category -= 1
    columns = [CATEGORY_TOP_TEAMS[category],
               int(CATEGORY_TEAMS_COUNT[category] / 2)]
    if CATEGORY_BOTTOM_TEAMS[category]:
        columns.append(CATEGORY_TEAMS_COUNT[category] - CATEGORY_BOTTOM_TEAMS[category])
    return columns


def get_point_from_match(_row: pd.Series):
    """勝点を計算
        先に、has_match_resultの結果が 'has_result' に入っていることを期待
        _row: 該当試合の1行データ
    """
    if not _row['has_result']:
        return 0
    # str型で入ってるはずなんだけど、比べられるからそのまま
    # まじめにやるなら int()を使う?
    if _row['goal_get'] > _row['goal_lose']:
        return 3
    if _row['goal_get'] < _row['goal_lose']:
        return 0
    return 1


def has_match_result(_row: pd.Series):
    """試合結果 (途中経過) があるか否かを返す
        _row: 該当試合の1行データ
    """
    if not _row['goal_get']:
        return False
    if not _row['goal_lose']:
        return False
    return True


def make_team_df(all_matches: pd.DataFrame, target_team: str):
    """対象チームを抽出して相手チームと勝ち負けの形に整形
        all_matches: read_jleague_matches.py を読み込んだ結果
        target_team: 対象チームの名称
    """
    _df = all_matches[(all_matches['home_team'] == target_team) | (all_matches['away_team'] == target_team)]
    _df = _df.sort_values('match_date')
    _df['is_home'] = _df.apply(lambda x: x['home_team'] == target_team, axis=1)
    _df['opponent'] = _df.apply(lambda x: x['away_team'] if x['is_home'] else x['home_team'], axis=1)
    _df['goal_get'] = _df.apply(lambda x: x['home_goal'] if x['is_home'] else x['away_goal'], axis=1)
    _df['goal_lose'] = _df.apply(lambda x: x['away_goal'] if x['is_home'] else x['home_goal'], axis=1)
    _df = _df.drop(columns=['home_team', 'away_team', 'home_goal', 'away_goal', 'match_index_in_section'])
    _df['has_result'] = _df.apply(has_match_result, axis=1)
    _df['point'] = _df.apply(get_point_from_match, axis=1)
    return _df


def get_available_point(_df: pd.DataFrame):
    """該当チームの最大勝ち点を求める
    """
    return _df['point'].sum() + 3 * len(_df[(~ _df['has_result'])])


def make_html_column(_df: pd.DataFrame, target_team: str, max_point: int,
                     old_bottom: bool=True, height_unit: int=25):
    """抽出したチームごとのDataFrameを使って、HTMLでチームの勝ち点積み上げ表を作る
        _df: make_team_dfで抽出したチームデータ (DataFrame)
        target_team: 対象チームの名称
        max_point: 対象チームの最大勝ち点 (get_available_pointで得たもの)
        old_bottom: 各チームの勝ち点の表を、古い日程を下にしたい時はTrue (default: True)
        height_unit: 試合ボックスの基準高 (引き分けの高さ、勝ちの高さの1/3) (単位px) (default: 25)
    """
    team_name = f'<div class="short box {target_team}">{target_team}</div>\n'
    box_list = []
    for (_i, _row) in _df.iterrows():
        if not _row['has_result']:
            box_height = 3
            future = True
        else:
            box_height = _row['point']
            future = False
        if box_height == 0:
            continue

        if isinstance(_row['match_date'], str):
            match_date = _row['match_date']
        else:
            match_date = '未定 ' if pd.isnull(_row['match_date']) else _row['match_date'].strftime('%m/%d')

        if box_height == 3:
            content = f"{match_date}{_row['opponent']}<br/>{_row['goal_get']}-{_row['goal_lose']}<br/>{_row['stadium']}<br/>"
            if future:
                box_html = f'<div class="tall box"><div class="future bg {target_team}"></div><p>{content}</p></div>\n'
            else:
                box_html = f'<div class="tall box"><p class="{target_team}">{content}</p></div>\n'
        else:
            box_html = f'<div class="short box"><p class="{target_team}">{match_date}{_row["opponent"]}</p></div>\n'
                # _row['goal_get'] + '-' + _row['goal_lose'] + '<br/>'
        box_list.append(box_html)

    space_cols = max_point - get_available_point(_df)
    #print(space_cols)
    if space_cols:
        box_list.append(f'<div class="space box" style="height:{height_unit * space_cols}px">({space_cols})</div>')

    if old_bottom:
        box_list.reverse()
    return '<div>' + team_name + ''.join(box_list) + team_name + '</div>\n\n'


def make_point_column(max_point: int, old_bottom: bool=True):
    """勝点列を作って返す
        old_bottom: 各チームの勝ち点の表を、古い日程を下にしたい時はTrue (default: True)
    """
    box_list = []
    for _i in range(1, max_point + 1):
        box_list.append(f'<div class="point box">{_i}</div>')
    if old_bottom:
        box_list.reverse()
    return '<div><div class="point box">勝点</div>' + ''.join(box_list) + '<div class="point box">勝点</div></div>\n\n'

def make_team_map(all_matches: pd.DataFrame):
    """各チームのチームごとの試合リスト、勝ち点などを収めたdictを返す
    """
    team_map = {}
    max_point = 0
    for target_team in all_matches['home_team'].value_counts().keys():
        _df = make_team_df(all_matches, target_team)
        cur_point = _df['point'].sum()
        available_point = get_available_point(_df)
        team_map[target_team] = {'df': _df,'point': cur_point, 'avlbl_pt': available_point}
        if available_point > max_point:
            max_point = available_point
        # pirnt(_df)
    return (team_map, max_point)

def make_bar_graph_html(all_matches: pd.DataFrame, category: int,
                        team_sort_key: str='point', old_bottom: bool=True,
                        insert_point_columns: list=None, css_file: str='j_points.css'):
    """read_jleague_matches.py を読み込んだ結果から、勝ち点積み上げ棒グラフを表示するHTMLファイルを作り、内容を返す
        all_matches: read_jleague_matches.py を読み込んだ結果
        team_sort_key: チーム列の並べ方 ('point': 最新の勝ち点順 (default), 'avlbl_pt': 最大勝ち点=残り全部勝った時の勝ち点)
        old_bottom: 各チームの勝ち点の表を、古い日程を下にしたい時はTrue (default: True)
        insert_point_columns: 何番目に勝ち点表示を挟むか (default: 4, 10, 16チーム目の後)
        css_file: CSSスタイルシートのパス (default: j_points.css)
    """
    if not insert_point_columns:
        insert_point_columns = make_insert_columns(category)
    (team_map, max_point) = make_team_map(all_matches)

    for target_team in team_map:
        team_map[target_team]['html'] = make_html_column(team_map[target_team]['df'], target_team, max_point, old_bottom)

    point_column = make_point_column(max_point)
    html_list = ['<html>\n',
                 f'<head><link rel="stylesheet" type="text/css" href={css_file}></head>\n',
                 '<body><div class="boxContainer">\n']
    html_list.append(point_column)
    index = 0
    for (target_team, _point) in sorted(team_map.items(), key=lambda x:x[1][team_sort_key], reverse=True):
        html_list.append(team_map[target_team]['html'])
        index += 1
        if index in insert_point_columns:
            html_list.append(point_column)
    html_list.append(point_column)

    html_list.append('</div></body>\n</html>')

    return ''.join(html_list)


def read_allmatches_csv(matches_file: str):
    """read_jleague_matches.py が書き出した結果のCSVファイルを読み込んでDataFrame構造を再現
        matches_file: 読み込むファイル名
    """
    all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
    all_matches['match_date'] = pd.to_datetime(all_matches['match_date']).dt.strftime('%m/%d')
    all_matches['home_goal'] = all_matches['home_goal'].fillna('')
    all_matches['away_goal'] = all_matches['away_goal'].fillna('')
    return all_matches


def make_example_html(matches_file: str='match_result-J{}-20210524.csv', old_bottom: bool=True):
    """各カテゴリのexampleファイルを作成 (勝ち点順、最大勝ち点順の二つずつ)
        matches_file: 試合結果ファイルのフォーマット
            default: 'match_result-J{}-20210524.csv'
            カテゴリを表す数値が入る部分に {} を入れて置く
    """
    for category in [1, 2, 3]:
        # 最大勝ち点差順に並べるファイル
        all_matches = read_allmatches_csv(matches_file.format(category))
        print(all_matches)
        html_result = make_bar_graph_html(all_matches, category, 'avlbl_pt', old_bottom)
        output_file = f'examples/j{category}_points.html'
        with open(output_file, mode='w') as _fp:
            _fp.write(html_result)

        # 現在の勝ち点差順に並べるファイル
        html_result = make_bar_graph_html(all_matches, category, 'point', old_bottom)
        output_file = f'examples/j{category}_points-alt.html'
        with open(output_file, mode='w') as _fp:
            _fp.write(html_result)


if __name__ == '__main__':
    import sys
    from glob import glob
    import re


    if len(sys.argv) > 1:
        _old_bottom = bool(sys.argv[1])
    else:
        _old_bottom = True


    for _matches_file in glob('*.csv'):
        category = int(re.search(r'J(\d)', _matches_file)[1])
        for (_team_sort_key, _output_file) in [('avlbl_pt', f'examples/j{category}_points.html'),
                                               ('point', f'examples/j{category}_points-alt.html')]:
            _all_matches = read_allmatches_csv(_matches_file)
            with open(_output_file, mode='w') as _fp:
                _fp.write(make_bar_graph_html(_all_matches, category, _team_sort_key, _old_bottom))
