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


# ---- SeasonEntry bracket_topology validation --------------------------------

def test_season_entry_accepts_valid_bracket_topology(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_blocks': [
            {'label': '決勝トーナメント',
             'bracket_order': ['A', 'B', 'C', 'D'],
             'bracket_topology': [[73, 74], [89]]},
        ]})
    assert caplog.text == ''


def test_season_entry_rejects_bracket_topology_round_not_halving():
    with pytest.raises(ValueError, match='expected 1'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'bracket_topology': [[73, 74], [89, 90]]},
        ]})


def test_season_entry_rejects_bracket_topology_without_single_final():
    with pytest.raises(ValueError, match='must end with a single match'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'bracket_topology': [[73, 74, 75, 76], [89, 90]]},
        ]})


def test_season_entry_rejects_duplicated_match_numbers():
    with pytest.raises(ValueError, match='repeats match numbers'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'bracket_topology': [[73, 74], [73]]},
        ]})


def test_season_entry_rejects_bracket_topology_mismatching_bracket_order():
    with pytest.raises(ValueError, match='entry round has 2 matches'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X',
             'bracket_order': ['A', 'B'],
             'bracket_topology': [[73, 74], [89]]},
        ]})


def test_season_entry_rejects_non_int_match_numbers():
    with pytest.raises(TypeError, match='only int match numbers'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'bracket_topology': [['73', '74'], [89]]},
        ]})


def test_season_entry_rejects_empty_bracket_topology():
    with pytest.raises(TypeError, match='non-empty list'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'bracket_topology': []},
        ]})


def test_season_entry_accepts_known_topology_source(caplog):
    with caplog.at_level(logging.WARNING, logger='match_utils'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'bracket_order': ['A', 'B'],
             'topology_source': 'feeder_reference'},
        ]})
    assert caplog.text == ''


def test_season_entry_rejects_unknown_topology_source():
    with pytest.raises(ValueError, match='unknown topology_source'):
        _bracket_entry({'bracket_blocks': [
            {'label': 'X', 'topology_source': 'wc_ko'},
        ]})


# ---------------------------------------------------------------------------
# matches_differ (#316)
# ---------------------------------------------------------------------------
_MATCH_COLUMNS = ['match_date', 'section_no', 'match_index_in_section', 'start_time',
                  'stadium', 'home_team', 'home_goal', 'away_goal', 'away_team',
                  'status', 'home_pk_score', 'away_pk_score', 'broadcast']


def _match_row(home='横浜FM', away='鹿島', home_goal='1', away_goal='0'):
    return {'match_date': '2026/08/07', 'section_no': 1, 'match_index_in_section': 1,
            'start_time': '19:00', 'stadium': '日産ス', 'home_team': home,
            'home_goal': home_goal, 'away_goal': away_goal, 'away_team': away,
            'status': '試合終了', 'home_pk_score': '', 'away_pk_score': '',
            'broadcast': 'DAZN'}


def _as_fetched(rows):
    """Build a frame the way a fetch does: pages with no match return an empty frame.

    Concatenating one of those drops the string columns back to object dtype,
    which is what used to make every fetch look like a change.
    """
    return pd.concat([pd.DataFrame(rows), pd.DataFrame(columns=_MATCH_COLUMNS)])


def _as_read_back(rows, tmp_path):
    """Build a frame the way the CSV round trip does."""
    path = tmp_path / 'matches.csv'
    pd.DataFrame(rows).to_csv(path, lineterminator='\n')
    return pd.read_csv(path, index_col=0, dtype=str, na_values='')


def test_matches_differ_ignores_the_dtype_a_fetch_ends_up_with(tmp_path):
    """Same matches, different dtypes, must not count as a change (#316)."""
    from match_utils import mu

    rows = [_match_row(), _match_row(home='町田', away='柏')]
    fetched = _as_fetched(rows)
    stored = _as_read_back(rows, tmp_path)

    assert fetched['home_team'].dtype != stored['home_team'].dtype
    assert mu.matches_differ(fetched, stored) is False


def test_matches_differ_still_sees_a_changed_score(tmp_path):
    from match_utils import mu

    stored = _as_read_back([_match_row()], tmp_path)
    fetched = _as_fetched([_match_row(home_goal='2')])

    assert mu.matches_differ(fetched, stored) is True


def test_matches_differ_still_sees_an_added_match(tmp_path):
    from match_utils import mu

    stored = _as_read_back([_match_row()], tmp_path)
    fetched = _as_fetched([_match_row(), _match_row(home='町田', away='柏')])

    assert mu.matches_differ(fetched, stored) is True


def test_matches_differ_ignores_match_index_and_row_order(tmp_path):
    from match_utils import mu

    rows = [_match_row(), _match_row(home='町田', away='柏')]
    stored = _as_read_back(rows, tmp_path)
    shuffled = [dict(row, match_index_in_section=9) for row in reversed(rows)]

    assert mu.matches_differ(_as_fetched(shuffled), stored) is False
