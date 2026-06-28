"""Tests for the openfootball WC2026 score patcher."""
from pathlib import Path

from match_utils import mu
import pandas as pd
import read_openfootball_wc as reader

REPO_ROOT = Path(__file__).resolve().parents[1]
WC_GS_CSV = REPO_ROOT / 'docs/csv/2026_allmatch_result-WC_GS.csv'


def _gs_row(**overrides) -> dict:
    base = {
        'match_date': '2026/06/27', 'section_no': 3, 'start_time': '17:00',
        'stadium': 'X', 'home_team': 'パナマ', 'away_team': 'イングランド',
        'status': None, 'match_number': '71', 'round': '第3節',
        'home_goal': None, 'away_goal': None, 'home_pk_score': None,
        'away_pk_score': None, 'match_index_in_section': 5, 'group': 'L',
        'timezone': 'America/New_York',
    }
    base.update(overrides)
    return base


def _ko_row(**overrides) -> dict:
    base = {
        'match_date': '2026/06/28', 'section_no': -6, 'start_time': '12:00',
        'stadium': 'LA', 'home_team': '南アフリカ', 'away_team': '3A/B/C/D/F',
        'status': None, 'match_number': '73', 'round': 'ラウンド32',
        'home_goal': None, 'away_goal': None, 'home_pk_score': None,
        'away_pk_score': None, 'match_index_in_section': 1, 'group': None,
        'timezone': 'America/Los_Angeles',
    }
    base.update(overrides)
    return base


# --- score_updates ---------------------------------------------------------

def test_score_updates_full_time_only() -> None:
    updates = reader.score_updates({'ft': [2, 1], 'ht': [1, 0]})
    assert updates == {'home_goal': '2', 'away_goal': '1', 'status': reader.FINISHED_STATUS}


def test_score_updates_no_score_returns_none() -> None:
    assert reader.score_updates(None) is None
    assert reader.score_updates({}) is None
    assert reader.score_updates({'ht': [0, 0]}) is None


def test_score_updates_extra_time_records_delta_and_inclusive_main() -> None:
    # Main score is extra-time inclusive; score_ex holds only the ET-period goals.
    updates = reader.score_updates({'ft': [1, 1], 'et': [2, 1]})
    assert updates['home_goal'] == '2'
    assert updates['away_goal'] == '1'
    assert updates['home_score_ex'] == '1'
    assert updates['away_score_ex'] == '0'


def test_score_updates_penalties() -> None:
    updates = reader.score_updates({'ft': [2, 2], 'et': [3, 3], 'p': [4, 2]})
    assert updates['home_goal'] == '3'
    assert updates['away_goal'] == '3'
    assert updates['home_score_ex'] == '1'
    assert updates['away_score_ex'] == '1'
    assert updates['home_pk_score'] == '4'
    assert updates['away_pk_score'] == '2'


# --- patch_group_stage -----------------------------------------------------

def test_patch_group_stage_matches_by_team_and_group() -> None:
    df = pd.DataFrame([_gs_row()])
    name_map = {'Panama': 'パナマ', 'England': 'イングランド'}
    matches = [{'group': 'Group L', 'team1': 'Panama', 'team2': 'England',
                'score': {'ft': [0, 2]}}]
    assert reader.patch_group_stage(df, matches, name_map) == 1
    assert df.at[0, 'home_goal'] == '0'
    assert df.at[0, 'away_goal'] == '2'
    assert df.at[0, 'status'] == reader.FINISHED_STATUS


def test_patch_group_stage_skips_unscored_and_preserves_existing() -> None:
    df = pd.DataFrame([_gs_row(home_goal='1', away_goal='1', status='試合終了')])
    name_map = {'Panama': 'パナマ', 'England': 'イングランド'}
    matches = [{'group': 'Group L', 'team1': 'Panama', 'team2': 'England'}]  # no score
    assert reader.patch_group_stage(df, matches, name_map) == 0
    assert df.at[0, 'home_goal'] == '1'  # not blanked out
    assert df.at[0, 'away_goal'] == '1'


def test_patch_group_stage_unmapped_team_is_skipped() -> None:
    df = pd.DataFrame([_gs_row()])
    matches = [{'group': 'Group L', 'team1': 'Panama', 'team2': 'England',
                'score': {'ft': [0, 2]}}]
    assert reader.patch_group_stage(df, matches, {}) == 0  # empty map -> no KeyError
    assert df.at[0, 'home_goal'] is None


def test_patch_group_stage_preserves_authoritative_columns() -> None:
    df = pd.DataFrame([_gs_row()])
    name_map = {'Panama': 'パナマ', 'England': 'イングランド'}
    matches = [{'group': 'Group L', 'team1': 'Panama', 'team2': 'England',
                'score': {'ft': [0, 2]}}]
    reader.patch_group_stage(df, matches, name_map)
    assert df.at[0, 'start_time'] == '17:00'
    assert df.at[0, 'stadium'] == 'X'
    assert df.at[0, 'timezone'] == 'America/New_York'


# --- patch_knockout --------------------------------------------------------

def test_patch_knockout_matches_by_number_ignoring_placeholder_names() -> None:
    # The CSV away_team is a placeholder ('3A/B/C/D/F') but num matching still binds.
    df = pd.DataFrame([_ko_row()])
    matches = [{'round': 'Round of 32', 'num': 73, 'team1': 'South Africa',
                'team2': 'Canada', 'score': {'ft': [1, 0]}}]
    assert reader.patch_knockout(df, matches) == 1
    assert df.at[0, 'home_goal'] == '1'
    assert df.at[0, 'away_goal'] == '0'
    assert df.at[0, 'status'] == reader.FINISHED_STATUS


def test_patch_knockout_creates_extra_time_and_penalty_columns() -> None:
    df = pd.DataFrame([_ko_row(match_number='89')])
    matches = [{'round': 'Round of 16', 'num': 89, 'team1': 'A', 'team2': 'B',
                'score': {'ft': [2, 2], 'et': [3, 3], 'p': [4, 2]}}]
    assert reader.patch_knockout(df, matches) == 1
    assert df.at[0, 'home_goal'] == '3'
    assert df.at[0, 'away_goal'] == '3'
    assert df.at[0, 'home_score_ex'] == '1'
    assert df.at[0, 'away_score_ex'] == '1'
    assert df.at[0, 'home_pk_score'] == '4'
    assert df.at[0, 'away_pk_score'] == '2'


def test_patch_knockout_without_match_number_column_is_noop() -> None:
    df = pd.DataFrame([{'home_team': 'A', 'away_team': 'B', 'home_goal': None}])
    matches = [{'num': 73, 'score': {'ft': [1, 0]}}]
    assert reader.patch_knockout(df, matches) == 0


# --- mapping coverage (real config + real CSV) -----------------------------

def test_team_name_map_covers_all_group_stage_teams() -> None:
    config = mu.init_config(reader.CONFIG_PATH)
    name_map = config.team_name_map.to_dict()
    jp_names = set(name_map.values())
    df = mu.read_allmatches_csv(str(WC_GS_CSV))
    csv_teams = set(df['home_team']) | set(df['away_team'])
    missing = csv_teams - jp_names
    assert not missing, f"team_name_map missing CSV teams: {missing}"
