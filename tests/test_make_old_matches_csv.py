from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from make_old_matches_csv import _derive_status, make_each_csv


def test_derive_status_maps_played_and_unplayed_scores() -> None:
    assert _derive_status('1-0') == '試合終了'
    assert _derive_status('1-1(PK4-5)') == '試合終了'
    assert _derive_status('中止') == '試合中止'
    assert _derive_status('試合不実施') == '試合不実施'
    assert _derive_status('', date.today() + timedelta(days=1)) == 'ＶＳ'
    assert _derive_status(None, date.today() - timedelta(days=1)) == '試合中止'


def test_make_each_csv_adds_status_for_legacy_league_csv(tmp_path: Path) -> None:
    src = pd.DataFrame(
        [
            {
                '年度': 2020,
                '大会': 'Ｊ１',
                '試合日': '02/21(金)',
                '節': '第1節',
                'K/O時刻': '19:00',
                'スタジアム': '国立',
                'ホーム': 'A',
                'アウェイ': 'B',
                'スコア': '1-0',
                'インターネット中継・TV放送': 'DAZN',
                '入場者数': 10000,
            },
            {
                '年度': 2020,
                '大会': 'Ｊ１',
                '試合日': '02/22(土)',
                '節': '第1節',
                'K/O時刻': '14:00',
                'スタジアム': '埼玉',
                'ホーム': 'C',
                'アウェイ': 'D',
                'スコア': '中止',
                'インターネット中継・TV放送': 'NHK',
                '入場者数': 20000,
            },
        ]
    )
    csv_path = tmp_path / '2020.csv'
    src.to_csv(csv_path)

    result = make_each_csv(str(csv_path), 0)

    season = result['2020']
    assert 'status' in season.columns
    assert season['status'].tolist() == ['試合終了', '試合中止']
    assert season.columns.tolist()[:10] == [
        'match_date',
        'section_no',
        'match_index_in_section',
        'start_time',
        'stadium',
        'home_team',
        'home_goal',
        'away_goal',
        'away_team',
        'status',
    ]


def test_make_each_csv_marks_future_blank_score_as_vs(tmp_path: Path) -> None:
    future = date.today() + timedelta(days=30)
    src = pd.DataFrame(
        [
            {
                '年度': future.year,
                '大会': 'Ｊ１',
                '試合日': future.strftime('%m/%d(日)'),
                '節': '第1節',
                'K/O時刻': '14:00',
                'スタジアム': '埼玉',
                'ホーム': 'C',
                'アウェイ': 'D',
                'スコア': '',
                'インターネット中継・TV放送': 'NHK',
                '入場者数': 20000,
            },
        ]
    )
    csv_path = tmp_path / 'future.csv'
    src.to_csv(csv_path)

    result = make_each_csv(str(csv_path), 0)

    season = result[str(future.year)]
    assert season['status'].tolist() == ['ＶＳ']
