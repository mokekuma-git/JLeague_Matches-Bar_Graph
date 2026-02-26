"""Tests for 2026 special season data parsing.

2026 has a unique structure:
- J1: Split into East/West groups (10 teams each)
- J2/J3: Merged into 4 groups (EastA/EastB/WestA/WestB, 10 teams each)
  with URL path 'j2j3' instead of 'j2'
"""
from datetime import date
import json
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

import pandas as pd
from bs4 import BeautifulSoup

from match_utils import mu, get_season_from_date
from read_jleague_matches import (
    read_match_from_web,
    _team_count_to_section_range,
    _calc_section_range,
    update_sub_season_matches,
)


TEST_DATA_DIR = Path(__file__).parent / 'test_data'
SEASON_MAP_PATH = Path(__file__).resolve().parent.parent / 'docs' / 'json' / 'season_map.json'


class TestJ1_2026(unittest.TestCase):
    """Test parsing 2026 J1 match data with East/West groups."""

    def setUp(self):
        file_path = TEST_DATA_DIR / 'j1_2026_section1.html'
        with open(file_path, 'rb') as f:
            self.soup = BeautifulSoup(f.read().decode('utf-8', errors='ignore'), 'lxml')
        self.matches = read_match_from_web(self.soup)

    def test_match_count(self):
        """J1 section 1 should have 10 matches (5 East + 5 West)."""
        self.assertEqual(len(self.matches), 10)

    def test_all_matches_have_group(self):
        """Every match in 2026 J1 should have a group field."""
        for m in self.matches:
            self.assertIn('group', m, f"Match {m['home_team']} vs {m['away_team']} has no group")

    def test_group_values(self):
        """Groups should be EAST or WEST."""
        groups = {m['group'] for m in self.matches}
        self.assertEqual(groups, {'EAST', 'WEST'})

    def test_group_distribution(self):
        """Each group should have 5 matches."""
        east = [m for m in self.matches if m['group'] == 'EAST']
        west = [m for m in self.matches if m['group'] == 'WEST']
        self.assertEqual(len(east), 5)
        self.assertEqual(len(west), 5)

    def test_first_match(self):
        m = self.matches[0]
        self.assertEqual(m['section_no'], 1)
        self.assertEqual(m['match_index_in_section'], 1)
        self.assertEqual(m['group'], 'EAST')
        self.assertEqual(m['home_team'], '横浜FM')
        self.assertEqual(m['away_team'], '町田')
        self.assertEqual(m['home_goal'], '2')
        self.assertEqual(m['away_goal'], '3')
        self.assertEqual(m['match_date'], '2026/02/06')
        self.assertEqual(m['status'], '試合終了')

    def test_last_match(self):
        m = self.matches[-1]
        self.assertEqual(m['section_no'], 1)
        self.assertEqual(m['match_index_in_section'], 10)
        self.assertEqual(m['group'], 'WEST')
        self.assertEqual(m['home_team'], '名古屋')
        self.assertEqual(m['away_team'], '清水')

    def test_pk_match_status(self):
        """PK results should appear in status field."""
        pk_matches = [m for m in self.matches if 'PK' in m['status']]
        self.assertGreater(len(pk_matches), 0)
        # Kyoto vs Kobe: 1-1 then PK 1-4
        kyoto_match = next(m for m in self.matches if m['home_team'] == '京都')
        self.assertEqual(kyoto_match['status'], '試合終了(1 PK 4)')
        self.assertEqual(kyoto_match['home_goal'], '1')
        self.assertEqual(kyoto_match['away_goal'], '1')

    def test_pk_score_columns(self):
        """home_pk_score and away_pk_score should be populated for PK matches."""
        # Kyoto vs Kobe: PK 1-4  (home=Kyoto=1, away=Kobe=4)
        kyoto_match = next(m for m in self.matches if m['home_team'] == '京都')
        self.assertEqual(kyoto_match['home_pk_score'], '1')
        self.assertEqual(kyoto_match['away_pk_score'], '4')

    def test_non_pk_match_has_empty_pk_columns(self):
        """Matches without PK should have empty home_pk_score and away_pk_score."""
        non_pk = next(m for m in self.matches if 'PK' not in m['status'])
        self.assertEqual(non_pk['home_pk_score'], '')
        self.assertEqual(non_pk['away_pk_score'], '')


class TestJ2J3_2026(unittest.TestCase):
    """Test parsing 2026 J2/J3 merged match data with 4 groups."""

    def setUp(self):
        file_path = TEST_DATA_DIR / 'j2j3_2026_section1.html'
        with open(file_path, 'rb') as f:
            self.soup = BeautifulSoup(f.read().decode('utf-8', errors='ignore'), 'lxml')
        self.matches = read_match_from_web(self.soup)

    def test_match_count(self):
        """J2J3 section 1 should have 20 matches (5 per group)."""
        self.assertEqual(len(self.matches), 20)

    def test_all_matches_have_group(self):
        """Every match should have a group field."""
        for m in self.matches:
            self.assertIn('group', m, f"Match {m['home_team']} vs {m['away_team']} has no group")

    def test_group_values(self):
        """Groups should be EAST-A, EAST-B, WEST-A, WEST-B."""
        groups = {m['group'] for m in self.matches}
        self.assertEqual(groups, {'EAST-A', 'EAST-B', 'WEST-A', 'WEST-B'})

    def test_group_distribution(self):
        """Each group should have 5 matches."""
        for group_name in ['EAST-A', 'EAST-B', 'WEST-A', 'WEST-B']:
            count = sum(1 for m in self.matches if m['group'] == group_name)
            self.assertEqual(count, 5, f"Group {group_name} has {count} matches, expected 5")

    def test_first_match(self):
        m = self.matches[0]
        self.assertEqual(m['section_no'], 1)
        self.assertEqual(m['match_index_in_section'], 1)
        self.assertEqual(m['group'], 'EAST-A')
        self.assertEqual(m['home_team'], '栃木Ｃ')
        self.assertEqual(m['away_team'], '仙台')
        self.assertEqual(m['home_goal'], '1')
        self.assertEqual(m['away_goal'], '4')
        self.assertEqual(m['match_date'], '2026/02/07')
        self.assertEqual(m['status'], '試合終了')

    def test_last_match(self):
        m = self.matches[-1]
        self.assertEqual(m['section_no'], 1)
        self.assertEqual(m['match_index_in_section'], 20)
        self.assertEqual(m['group'], 'WEST-B')
        self.assertEqual(m['home_team'], '大分')
        self.assertEqual(m['away_team'], '滋賀')
        self.assertEqual(m['status'], 'ＶＳ')

    def test_cancelled_match(self):
        """Cancelled matches should have status '試合中止'."""
        cancelled = [m for m in self.matches if m['status'] == '試合中止']
        self.assertEqual(len(cancelled), 2)
        home_teams = {m['home_team'] for m in cancelled}
        self.assertEqual(home_teams, {'栃木SC', '相模原'})

    def test_pk_match_status(self):
        """PK results should appear in status field."""
        pk_matches = [m for m in self.matches if 'PK' in m['status']]
        self.assertGreater(len(pk_matches), 0)
        # Iwata vs Nagano: 0-0 then PK 4-2
        iwata_match = next(m for m in self.matches if m['home_team'] == '磐田')
        self.assertEqual(iwata_match['status'], '試合終了(4 PK 2)')
        self.assertEqual(iwata_match['group'], 'EAST-B')

    def test_pk_score_columns(self):
        """home_pk_score and away_pk_score should be populated for PK matches."""
        # Iwata vs Nagano: PK 4-2 (home=Iwata=4, away=Nagano=2)
        iwata_match = next(m for m in self.matches if m['home_team'] == '磐田')
        self.assertEqual(iwata_match['home_pk_score'], '4')
        self.assertEqual(iwata_match['away_pk_score'], '2')

    def test_non_pk_match_has_empty_pk_columns(self):
        """Matches without PK should have empty home_pk_score and away_pk_score."""
        non_pk = next(m for m in self.matches if 'PK' not in m['status'])
        self.assertEqual(non_pk['home_pk_score'], '')
        self.assertEqual(non_pk['away_pk_score'], '')

    def test_section_no_parsed_from_special_title(self):
        """Section number should be parsed from '...第1節' title format."""
        for m in self.matches:
            self.assertEqual(m['section_no'], 1)


class TestGetSubSeasons(unittest.TestCase):
    """Test get_sub_seasons with 2026 season_map data (4-tier format)."""

    def setUp(self):
        with open(SEASON_MAP_PATH, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        # Extract jleague competitions as the flattened season_map
        jleague = raw.get('jleague', {}).get('competitions', {})
        self.season_map = {comp_key: comp.get('seasons', {})
                           for comp_key, comp in jleague.items()}

    def test_j1_sub_seasons(self):
        with patch.object(mu, 'load_season_map', return_value=self.season_map):
            subs = mu.get_sub_seasons('J1')
        self.assertEqual(len(subs), 2)
        self.assertEqual(subs[0]['name'], '2026East')
        self.assertEqual(subs[1]['name'], '2026West')
        self.assertEqual(subs[0]['group'], 'East')
        self.assertEqual(subs[1]['group'], 'West')
        self.assertEqual(subs[0]['group_display'], 'EAST')
        self.assertEqual(subs[1]['group_display'], 'WEST')
        self.assertNotIn('url_category', subs[0])
        self.assertNotIn('url_category', subs[1])

    def test_j3_no_2026_entry_returns_none(self):
        """J3 has no 2026 entry -> get_sub_seasons returns None (skip)."""
        with patch.object(mu, 'load_season_map', return_value=self.season_map):
            result = mu.get_sub_seasons('J3')
        self.assertIsNone(result)

    def test_unknown_competition_returns_none(self):
        """Competition not in season_map at all -> None."""
        with patch.object(mu, 'load_season_map', return_value=self.season_map):
            result = mu.get_sub_seasons('J9')
        self.assertIsNone(result)

    def test_j2_sub_seasons(self):
        with patch.object(mu, 'load_season_map', return_value=self.season_map):
            subs = mu.get_sub_seasons('J2')
        self.assertEqual(len(subs), 4)
        names = [s['name'] for s in subs]
        self.assertEqual(names, ['2026EastA', '2026EastB', '2026WestA', '2026WestB'])
        for s in subs:
            self.assertEqual(s['url_category'], 'j2j3')
        displays = [s['group_display'] for s in subs]
        self.assertEqual(displays, ['EAST-A', 'EAST-B', 'WEST-A', 'WEST-B'])


class TestTeamCountToSectionRange(unittest.TestCase):
    """Test _team_count_to_section_range section count formula."""

    def test_even_team_count(self):
        # 10 teams (even): (10-1)*2 = 18 sections
        self.assertEqual(_team_count_to_section_range(10), range(1, 19))

    def test_odd_team_count(self):
        # 11 teams (odd): 11*2 = 22 sections
        self.assertEqual(_team_count_to_section_range(11), range(1, 23))

    def test_standard_j1_18_teams(self):
        # 18 teams (even): (18-1)*2 = 34 sections
        self.assertEqual(_team_count_to_section_range(18), range(1, 35))


class TestCalcSectionRange(unittest.TestCase):
    """Test _calc_section_range uses max team_count across sub-seasons."""

    def test_uses_max_team_count(self):
        # max is 10 (even) -> (10-1)*2 = 18 sections, ignores smaller sub
        subs = [{'team_count': 8}, {'team_count': 10}]
        self.assertEqual(_calc_section_range(subs), range(1, 19))

    def test_single_sub_season(self):
        subs = [{'team_count': 10}]
        self.assertEqual(_calc_section_range(subs), range(1, 19))

    def test_all_same_team_count(self):
        # 4 groups of 10 teams each -> range(1, 19)
        subs = [{'team_count': 10}] * 4
        self.assertEqual(_calc_section_range(subs), range(1, 19))


class TestUpdateSubSeasonMatches(unittest.TestCase):
    """Test update_sub_season_matches distributes fetched data into sub-season CSVs."""

    BASE_ROW = {
        'section_no': 1, 'match_index_in_section': 1,
        'match_date': '2026/02/06', 'start_time': '19:00',
        'stadium': 'Stadium', 'home_goal': '1', 'away_goal': '0',
        'status': '試合終了',
    }

    def _make_match_df(self, group_name, home_teams):
        """Create a fake fetched DataFrame for one group."""
        rows = []
        for i, team in enumerate(home_teams, start=1):
            row = dict(self.BASE_ROW, match_index_in_section=i,
                       home_team=team, away_team=f'Away{i}', group=group_name)
            rows.append(row)
        return pd.DataFrame(rows)

    def _make_sub_seasons(self):
        return [
            {'name': '2026East', 'team_count': 10, 'teams': [], 'group': 'East',
             'group_display': 'EAST'},
            {'name': '2026West', 'team_count': 10, 'teams': [], 'group': 'West',
             'group_display': 'WEST'},
        ]

    @patch.object(mu, 'update_if_diff')
    @patch('read_jleague_matches.read_matches')
    @patch.object(mu, 'get_csv_path')
    def test_force_update_fetches_full_range(self, mock_csv_path, mock_read_range, mock_update):
        """force_update=True should fetch _calc_section_range sections."""
        east_df = self._make_match_df('EAST', ['A1', 'A2', 'A3', 'A4', 'A5'])
        west_df = self._make_match_df('WEST', ['B1', 'B2', 'B3', 'B4', 'B5'])
        mock_read_range.return_value = pd.concat([east_df, west_df], ignore_index=True)
        mock_csv_path.side_effect = lambda comp, season: f'/tmp/{season}.csv'

        update_sub_season_matches('J1', self._make_sub_seasons(), force_update=True)

        # read_matches called once (shared fetch for both sub-seasons)
        mock_read_range.assert_called_once()
        # Section range for 10 even teams = 18 sections
        call_range = mock_read_range.call_args.args[1]
        self.assertEqual(list(call_range), list(range(1, 19)))

    @patch.object(mu, 'update_if_diff')
    @patch('read_jleague_matches.read_matches')
    @patch.object(mu, 'get_csv_path')
    def test_group_filter_distributes_correctly(self, mock_csv_path, mock_read_range, mock_update):
        """Each sub-season CSV should receive only its own group's matches."""
        east_teams = ['A1', 'A2', 'A3', 'A4', 'A5']
        west_teams = ['B1', 'B2', 'B3', 'B4', 'B5']
        east_df = self._make_match_df('EAST', east_teams)
        west_df = self._make_match_df('WEST', west_teams)
        mock_read_range.return_value = pd.concat([east_df, west_df], ignore_index=True)
        mock_csv_path.side_effect = lambda comp, season: f'/tmp/{season}.csv'

        update_sub_season_matches('J1', self._make_sub_seasons(), force_update=True)

        self.assertEqual(mock_update.call_count, 2)
        written = {call.args[1]: call.args[0] for call in mock_update.call_args_list}

        east_written = written['/tmp/2026East.csv']
        self.assertEqual(set(east_written['home_team']), set(east_teams))

        west_written = written['/tmp/2026West.csv']
        self.assertEqual(set(west_written['home_team']), set(west_teams))

    @patch.object(mu, 'update_if_diff')
    @patch('read_jleague_matches.read_matches')
    @patch.object(mu, 'get_csv_path')
    def test_group_column_dropped(self, mock_csv_path, mock_read_range, mock_update):
        """The 'group' column should not appear in written CSVs."""
        east_df = self._make_match_df('EAST', ['A1', 'A2', 'A3', 'A4', 'A5'])
        west_df = self._make_match_df('WEST', ['B1', 'B2', 'B3', 'B4', 'B5'])
        mock_read_range.return_value = pd.concat([east_df, west_df], ignore_index=True)
        mock_csv_path.side_effect = lambda comp, season: f'/tmp/{season}.csv'

        update_sub_season_matches('J1', self._make_sub_seasons(), force_update=True)

        for call in mock_update.call_args_list:
            written_df = call.args[0]
            self.assertNotIn('group', written_df.columns)

    @patch.object(mu, 'update_if_diff')
    @patch('read_jleague_matches.read_matches')
    @patch.object(mu, 'get_csv_path')
    def test_match_index_recalculated_per_sub_season(self, mock_csv_path, mock_read_range, mock_update):
        """match_index_in_section should be 1-based within each sub-season."""
        east_df = self._make_match_df('EAST', ['A1', 'A2', 'A3', 'A4', 'A5'])
        west_df = self._make_match_df('WEST', ['B1', 'B2', 'B3', 'B4', 'B5'])
        # Give original indexes that span both groups (1-10)
        combined = pd.concat([east_df, west_df], ignore_index=True)
        combined['match_index_in_section'] = range(1, 11)
        mock_read_range.return_value = combined
        mock_csv_path.side_effect = lambda comp, season: f'/tmp/{season}.csv'

        update_sub_season_matches('J1', self._make_sub_seasons(), force_update=True)

        written = {call.args[1]: call.args[0] for call in mock_update.call_args_list}
        for path, df in written.items():
            indexes = sorted(df['match_index_in_section'].tolist())
            self.assertEqual(indexes, [1, 2, 3, 4, 5], f"{path}: indexes should be 1-5, got {indexes}")

    @patch.object(mu, 'update_if_diff')
    @patch('read_jleague_matches.read_matches')
    @patch.object(mu, 'get_csv_path')
    def test_need_update_uses_specified_sections(self, mock_csv_path, mock_read_range, mock_update):
        """need_update param should pass the specified sections to read_matches."""
        east_df = self._make_match_df('EAST', ['A1', 'A2', 'A3', 'A4', 'A5'])
        west_df = self._make_match_df('WEST', ['B1', 'B2', 'B3', 'B4', 'B5'])
        mock_read_range.return_value = pd.concat([east_df, west_df], ignore_index=True)
        mock_csv_path.side_effect = lambda comp, season: f'/tmp/{season}.csv'

        # Simulate existing CSVs for the merge path
        existing_east = self._make_match_df('EAST', ['A1', 'A2', 'A3', 'A4', 'A5'])
        existing_east = existing_east.drop(columns=['group'])
        existing_east['match_index_in_section'] = range(1, 6)

        with patch('read_jleague_matches.Path') as mock_path_cls, \
             patch.object(mu, 'read_allmatches_csv', return_value=existing_east), \
             patch.object(mu, 'matches_differ', return_value=True):
            mock_path_cls.return_value.exists.return_value = True

            update_sub_season_matches('J1', self._make_sub_seasons(), need_update={3, 4})

        # Should have fetched only sections {3, 4}
        call_range = mock_read_range.call_args.args[1]
        self.assertEqual(call_range, {3, 4})


class TestGetSeasonFromDate(unittest.TestCase):
    """Test get_season_from_date returns the correct season string for each date."""

    def _d(self, year, month, day=1):
        return date(year, month, day)

    # --- Calendar-year seasons (season_start_month=1) ---

    def test_calendar_year_returns_year_string(self):
        """season_start_month=1 always returns 4-digit year."""
        self.assertEqual(get_season_from_date(self._d(2025, 1), season_start_month=1), '2025')
        self.assertEqual(get_season_from_date(self._d(2024, 12), season_start_month=1), '2024')
        self.assertEqual(get_season_from_date(self._d(2026, 6), season_start_month=1), '2026')
        self.assertEqual(get_season_from_date(self._d(2027, 3), season_start_month=1), '2027')

    # --- Autumn-spring seasons (season_start_month=7, default) ---

    def test_default_start_month_is_7(self):
        """Default season_start_month is 7 (autumn-spring)."""
        self.assertEqual(get_season_from_date(self._d(2026, 7, 1)), '26-27')
        self.assertEqual(get_season_from_date(self._d(2027, 6, 30)), '26-27')

    def test_jul_dec_returns_cross_year(self):
        """Jul-Dec belongs to the season starting this year."""
        self.assertEqual(get_season_from_date(self._d(2026, 7, 1), season_start_month=7), '26-27')
        self.assertEqual(get_season_from_date(self._d(2026, 12), season_start_month=7), '26-27')

    def test_jan_jun_returns_previous_cross_year(self):
        """Jan-Jun belongs to the season that started last year."""
        self.assertEqual(get_season_from_date(self._d(2027, 1), season_start_month=7), '26-27')
        self.assertEqual(get_season_from_date(self._d(2027, 6, 30), season_start_month=7), '26-27')

    def test_next_season_starts_in_jul(self):
        """Jul starts a new season."""
        self.assertEqual(get_season_from_date(self._d(2027, 7, 1), season_start_month=7), '27-28')
        self.assertEqual(get_season_from_date(self._d(2027, 12), season_start_month=7), '27-28')

    def test_boundary_jun_vs_jul(self):
        """June 30 and July 1 should differ."""
        self.assertEqual(get_season_from_date(self._d(2028, 6, 30), season_start_month=7), '27-28')
        self.assertEqual(get_season_from_date(self._d(2028, 7, 1), season_start_month=7), '28-29')

    # --- Custom start month ---

    def test_custom_start_month_8(self):
        """season_start_month=8 for leagues starting in August."""
        self.assertEqual(get_season_from_date(self._d(2025, 8, 1), season_start_month=8), '25-26')
        self.assertEqual(get_season_from_date(self._d(2025, 7, 31), season_start_month=8), '24-25')
        self.assertEqual(get_season_from_date(self._d(2026, 5, 1), season_start_month=8), '25-26')

    def test_defaults_to_today(self):
        """Called without arguments should not raise and return a non-empty string."""
        result = get_season_from_date()
        self.assertIsInstance(result, str)
        self.assertTrue(result)


if __name__ == '__main__':
    unittest.main()
