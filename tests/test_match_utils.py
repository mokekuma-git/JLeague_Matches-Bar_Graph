import logging

import pandas as pd
import pytest

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


# ---- SeasonEntry bracket_blocks validation ---------------------------------

def _bracket_entry(options):
    from match_utils import SeasonEntry
    return SeasonEntry('2026', options, competition_view_types=['bracket'])


def test_season_entry_warns_on_teams_for_tournament_season(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'teams': ['A', 'B']})
    assert 'teams is derived for tournament seasons' in caplog.text


def test_season_entry_allows_teams_for_league_season(caplog):
    from match_utils import SeasonEntry
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        SeasonEntry(
            '2026',
            {'team_count': 2, 'promotion_count': 0, 'relegation_count': 0,
             'teams': ['A', 'B']},
            competition_view_types=['league'])
    assert caplog.text == ''


def test_season_entry_warns_on_entry_level_bracket_order(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_order': ['A', 'B']})
    assert 'unknown option keys' in caplog.text


def test_season_entry_warns_on_unknown_bracket_block_key(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_blocks': [
            {'label': '決勝トーナメント', 'bracket_order': ['A', 'B'], 'typo_key': 1},
        ]})
    assert 'unknown keys' in caplog.text
    assert 'typo_key' in caplog.text


def test_season_entry_warns_on_inclusive_tree_with_matchup_pairs(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'ペア', 'bracket_order': ['A', 'B'],
             'matchup_pairs': True, 'inclusive_tree': True},
        ]})
    assert 'has no effect' in caplog.text


def test_season_entry_warns_on_multiple_inclusive_tree_blocks(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'ブロック1', 'bracket_order': ['A', 'B'], 'inclusive_tree': True},
            {'label': 'ブロック2', 'bracket_order': ['C', 'D'], 'inclusive_tree': True},
        ]})
    assert 'multiple bracket_blocks marked inclusive_tree' in caplog.text


def test_season_entry_accepts_valid_bracket_blocks(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'フィーダー', 'bracket_order': ['A', 'B']},
            {'label': '決勝トーナメント', 'bracket_order': ['A', 'C'],
             'inclusive_tree': True},
        ]})
    assert caplog.text == ''


def test_season_entry_rejects_non_list_bracket_blocks():
    with pytest.raises(TypeError, match='bracket_blocks must be list'):
        _bracket_entry({'bracket_blocks': {'label': 'X'}})


def test_season_entry_rejects_block_without_label():
    with pytest.raises(TypeError, match="dict with a str 'label'"):
        _bracket_entry({'bracket_blocks': [{'bracket_order': ['A', 'B']}]})
