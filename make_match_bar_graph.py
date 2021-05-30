"""read_jleague_matches.pyで読み取ったJリーグ試合結果から、各チームの勝ち点積み上げ棒グラフを作成
"""
import json
import pandas as pd
import numpy

CATEGORY_TOP_TEAMS = [3, 2, 2]
CATEGORY_BOTTOM_TEAMS = [4, 4, 0]
CATEGORY_TEAMS_COUNT = [20, 22, 15]

HEADER_FILE = 'j_points_header.html'
FOOTER_FILE = 'j_points_footer.html'

OUTPUT_FILE = 'docs/j{}_points.json'


class NumDFEncoder(json.JSONEncoder):
    """JSON展開用エンコーダ
        pandasが出すnumpyの数値と、DataFrameを今回向けにシリアライズ
    """
    def default(self, obj):
        if isinstance(obj, numpy.integer):
            return int(obj)
        if isinstance(obj, numpy.floating):
            return float(obj)
        if isinstance(obj, numpy.ndarray):
            return obj.tolist()
        if isinstance(obj, pd.DataFrame):
            return obj.to_dict(orient='records')
        return super().default(obj)


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
        max_point: 全チーム中の最大勝ち点 (get_available_pointで得たもの)
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


def dump_team_map(all_matches: pd.DataFrame, category: int):
    """全チームの試合データをJSON文字列としてダンプする
    """
    (_df, max_p) = make_team_map(all_matches)
    return json.dumps({'matches':_df, 'category': category, 'max_point': max_p},
                      cls=NumDFEncoder, ensure_ascii=False)


def make_bar_graph_html(all_matches: pd.DataFrame, category: int,
                        team_sort_key: str='point', old_bottom: bool=True, insert_point_columns: list=None):
    """read_jleague_matches.py を読み込んだ結果から、勝ち点積み上げ棒グラフを表示するHTMLファイルを作り、内容を返す
        all_matches: read_jleague_matches.py を読み込んだ結果
        category: Jカテゴリ
        team_sort_key: チーム列の並べ方 ('point': 最新の勝ち点順 (default), 'avlbl_pt': 最大勝ち点=残り全部勝った時の勝ち点)
        old_bottom: 各チームの勝ち点の表を、古い日程を下にしたい時はTrue (default: True)
        insert_point_columns: 何番目に勝ち点表示を挟むか
    """
    if not insert_point_columns:
        insert_point_columns = make_insert_columns(category)
    (team_map, max_point) = make_team_map(all_matches)

    for target_team in team_map:
        team_map[target_team]['html'] = make_html_column(team_map[target_team]['df'], target_team, max_point, old_bottom)

    point_column = make_point_column(max_point)
    html_list = [read_file(HEADER_FILE)]
    html_list.append(point_column)
    index = 0
    for (target_team, _point) in sorted(team_map.items(), key=lambda x:x[1][team_sort_key], reverse=True):
        html_list.append(team_map[target_team]['html'])
        index += 1
        if index in insert_point_columns:
            html_list.append(point_column)
    html_list.append(point_column)

    html_list.append(read_file(FOOTER_FILE))

    return ''.join(html_list)


def read_allmatches_csv(matches_file: str):
    """read_jleague_matches.py が書き出した結果のCSVファイルを読み込んでDataFrame構造を再現
        matches_file: 読み込むファイル名
    """
    all_matches = pd.read_csv(matches_file, index_col=0, dtype=str, na_values='')
    all_matches['match_date'] = pd.to_datetime(all_matches['match_date']).dt.strftime('%m/%d')
    all_matches['home_goal'] = all_matches['home_goal'].fillna('')
    all_matches['away_goal'] = all_matches['away_goal'].fillna('')
    all_matches = all_matches.where(pd.notnull(all_matches), None)
    return all_matches


def read_file(file_name: str):
    """指定されたファイルをテキストで読んで返す
    """
    with open(file_name, mode='r') as _fp:
        result = _fp.read()
    return result


def dump_team_file(all_matches: pd.DataFrame, category: int):
    """カテゴリ毎の試合結果などをJSONファイルに書き込む
    """
    with open(OUTPUT_FILE.format(category), mode='w') as _fp:
        _fp.write(dump_team_map(all_matches, category))


if __name__ == '__main__':
    from glob import glob
    import re

    for _category in [1, 2, 3]:
        _matches_file = glob(f'csv/*J{_category}*.csv')[-1]
        print(_matches_file)
        dump_team_file(read_allmatches_csv(_matches_file), int(re.search(r'J(\d)', _matches_file)[1]))
