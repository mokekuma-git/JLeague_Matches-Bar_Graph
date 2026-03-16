import pandas as pd

from match_utils import assign_bracket_section_no, normalize_round_label


def test_normalize_round_label_removes_leg_suffixes():
    assert normalize_round_label('準々決勝　第1戦') == '準々決勝'
    assert normalize_round_label('1回戦第2戦') == '1回戦'
    assert normalize_round_label('Round 1 1st Leg') == 'Round 1'
    assert normalize_round_label('第1節第1日') == '第1節第1日'


def test_assign_bracket_section_no_mixes_group_stage_and_knockout_depths():
    df = pd.DataFrame([
        {
            'match_date': '2025/03/05',
            'round': '第1節第1日',
            'home_team': 'A',
            'away_team': 'B',
            'match_index_in_section': 4,
        },
        {
            'match_date': '2025/03/05',
            'round': '第1節第2日',
            'home_team': 'C',
            'away_team': 'D',
            'match_index_in_section': 9,
        },
        {
            'match_date': '2025/06/01',
            'round': '準決勝　第1戦',
            'home_team': 'A',
            'away_team': 'C',
            'leg': '1',
            'match_index_in_section': 7,
        },
        {
            'match_date': '2025/06/08',
            'round': '準決勝　第2戦',
            'home_team': 'C',
            'away_team': 'A',
            'leg': '2',
            'match_index_in_section': 3,
        },
        {
            'match_date': '2025/07/01',
            'round': '決勝',
            'home_team': 'A',
            'away_team': 'D',
            'match_index_in_section': 8,
        },
    ])

    actual = assign_bracket_section_no(df)

    assert actual['section_no'].tolist() == [1, 1, -2, -2, -1]
    assert actual['match_index_in_section'].tolist() == [1, 2, 1, 1, 1]


def test_assign_bracket_section_no_recalculates_single_leg_round_order():
    df = pd.DataFrame([
        {
            'match_date': '2025/03/20',
            'round': '1回戦',
            'home_team': 'B',
            'away_team': 'C',
            'match_index_in_section': 2,
        },
        {
            'match_date': '2025/03/20',
            'round': '1回戦',
            'home_team': 'A',
            'away_team': 'D',
            'match_index_in_section': 1,
        },
        {
            'match_date': '2025/04/09',
            'round': '準決勝',
            'home_team': 'A',
            'away_team': 'B',
            'match_index_in_section': 5,
        },
        {
            'match_date': '2025/04/20',
            'round': '決勝戦',
            'home_team': 'A',
            'away_team': 'C',
            'match_index_in_section': 6,
        },
    ])

    actual = assign_bracket_section_no(df)

    assert actual['section_no'].tolist() == [-3, -3, -2, -1]
    assert actual['match_index_in_section'].tolist() == [2, 1, 1, 1]
