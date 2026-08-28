"""Tests for read_jleague_matches.py"""
from datetime import datetime
from datetime import timezone
from pathlib import Path
import unittest

from bs4 import BeautifulSoup
import pandas as pd

from match_utils import drop_duplicated_indexes
from read_jleague_matches import CSV_COLUMNS
from read_jleague_matches import convert_datasite_date
from read_jleague_matches import datasite_year
from read_jleague_matches import derive_status
from read_jleague_matches import read_match_from_web
from read_jleague_matches import read_teams_from_web


class TestDropDuplicatedIndexes(unittest.TestCase):
    """Test for drop_duplicated_indexes function"""

    def test_basic_duplicate_removal(self):
        """Basic duplicate removal test - check that older entries are removed"""
        # Test data
        data = {
            'date': [
                datetime(2023, 1, 1, tzinfo=timezone.utc),  # Older date
                datetime(2023, 1, 2, tzinfo=timezone.utc)   # Newer date
            ]
        }
        index = ['file1.csv', 'file1.csv']  # The same file name
        df = pd.DataFrame(data, index=index)
        df.index.name = 'file'

        result = drop_duplicated_indexes(df)

        self.assertEqual(len(result), 1)  # Only one row should remain
        self.assertEqual(result.index[0], 'file1.csv')
        self.assertEqual(result['date'].iloc[0], datetime(2023, 1, 2, tzinfo=timezone.utc))  # Newer date should remain

    def test_multiple_files_with_duplicates(self):
        """Multiple files with duplicates - check that the latest date is kept for each file"""
        # Test data
        data = {
            'date': [
                datetime(2023, 1, 1, tzinfo=timezone.utc),
                datetime(2023, 1, 3, tzinfo=timezone.utc),
                datetime(2023, 2, 1, tzinfo=timezone.utc),
                datetime(2023, 2, 5, tzinfo=timezone.utc),
                datetime(2023, 2, 3, tzinfo=timezone.utc)
            ]
        }
        index = ['file1.csv', 'file1.csv', 'file2.csv', 'file2.csv', 'file2.csv']
        df = pd.DataFrame(data, index=index)
        df.index.name = 'file'

        result = drop_duplicated_indexes(df)

        self.assertEqual(len(result), 2)  # One row for each file remains
        self.assertEqual(result.loc['file1.csv', 'date'], datetime(2023, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(result.loc['file2.csv', 'date'], datetime(2023, 2, 5, tzinfo=timezone.utc))

    def test_no_duplicates(self):
        """No duplicates - check that all rows are kept"""
        # Test data
        data = {
            'date': [
                datetime(2023, 1, 1, tzinfo=timezone.utc),
                datetime(2023, 2, 1, tzinfo=timezone.utc)
            ]
        }
        index = ['file1.csv', 'file2.csv']  # Different file names
        df = pd.DataFrame(data, index=index)
        df.index.name = 'file'

        result = drop_duplicated_indexes(df)

        self.assertEqual(len(result), 2)  # All rows should remain
        pd.testing.assert_frame_equal(result, df)  # As same as original DataFrame

    def test_additional_columns(self):
        """The row has rows other than date - check that the latest date is kept and other columns are preserved"""
        # Test data
        data = {
            'date': [
                datetime(2023, 1, 1, tzinfo=timezone.utc),
                datetime(2023, 1, 3, tzinfo=timezone.utc)
            ],
            'size': [100, 200]
        }
        index = ['file1.csv', 'file1.csv']
        df = pd.DataFrame(data, index=index)
        df.index.name = 'file'

        result = drop_duplicated_indexes(df)

        self.assertEqual(len(result), 1)
        self.assertEqual(result.loc['file1.csv', 'date'], datetime(2023, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(result.loc['file1.csv', 'size'], 200)


class HtmlLoadingTestCase(unittest.TestCase):
    """Base class for loading HTML files for testing"""
    test_data_dir = None

    def _load_html_file(self, filename):
        """Load HTML file and return a BeautifulSoup object"""
        file_path = self.test_data_dir / filename
        with open(file_path, 'rb') as f:
            content = f.read()
            return BeautifulSoup(content.decode('utf-8', errors='ignore'), 'lxml')

class TestReadTeamsFromWeb(HtmlLoadingTestCase):
    """Test for read_teams_from_web function (jleague.jp standings page)"""

    def setUp(self):
        """Read the standings HTML fixture"""
        self.test_data_dir = Path(__file__).parent / 'test_data'
        self.j1_soup = self._load_html_file('j1_standing_2026.html')

    def test_read_j1_teams(self):
        """All 20 J1 clubs are read from the standings table"""
        teams = read_teams_from_web(self.j1_soup, 'J1')

        self.assertIsInstance(teams, list)
        self.assertEqual(len(teams), 20)
        for team in ['鹿島アントラーズ', '浦和レッズ', '横浜Ｆ・マリノス', 'ＦＣ町田ゼルビア']:
            self.assertIn(team, teams, f"{team} is not in the J1 team list")

    def test_skips_skeleton_table(self):
        """The loading skeleton carries the same modifier class but holds no clubs"""
        # Only the wrapper that actually contains club links must be used.
        self.assertNotIn('', read_teams_from_web(self.j1_soup, 'J1'))

    def test_invalid_competition(self):
        """Test for non-existing competition"""
        teams = read_teams_from_web(self.j1_soup, 'J4')

        self.assertEqual(teams, [])


class TestReadMatchFromWeb(HtmlLoadingTestCase):
    """Test for read_match_from_web function (data.j-league.or.jp SFMS01)"""

    def setUp(self):
        """Read the Data Site search result fixture"""
        self.test_data_dir = Path(__file__).parent / 'test_data'
        self.soup = self._load_html_file('jleague_datasite_j1.html')
        self.matches = read_match_from_web(self.soup, 'J1')

    def test_returns_dataframe_with_csv_columns(self):
        """The parsed result carries exactly the published CSV columns"""
        self.assertIsInstance(self.matches, pd.DataFrame)
        self.assertEqual(list(self.matches.columns), CSV_COLUMNS)

    def test_played_match_is_parsed(self):
        """A finished match yields goals, status and attendance"""
        row = self.matches.iloc[0]

        self.assertEqual(row['match_date'], '2026/08/07')
        self.assertEqual(row['section_no'], 1)
        self.assertEqual(row['match_index_in_section'], 1)
        self.assertEqual(row['start_time'], '19:26')
        self.assertEqual(row['stadium'], 'MUFG国立')
        self.assertEqual(row['home_team'], '横浜FM')
        self.assertEqual(row['home_goal'], '3')
        self.assertEqual(row['away_goal'], '4')
        self.assertEqual(row['away_team'], '鹿島')
        self.assertEqual(row['status'], '試合終了')
        self.assertEqual(row['attendance'], '63960')
        self.assertEqual(row['broadcast'], 'ＤＡＺＮ／フジテレビ系列全国ネット')

    def test_scheduled_match_has_no_score(self):
        """An unplayed match keeps empty goals and the ＶＳ status"""
        row = self.matches[self.matches['section_no'] == 38].iloc[0]

        self.assertEqual(row['home_goal'], '')
        self.assertEqual(row['away_goal'], '')
        self.assertEqual(row['status'], 'ＶＳ')
        self.assertEqual(row['attendance'], '')

    def test_section_no_parsed_from_fullwidth_digits(self):
        """節 is rendered with full-width digits (第２１節第１日)"""
        self.assertIn(21, set(self.matches['section_no']))
        self.assertIn(38, set(self.matches['section_no']))

    def test_undecided_stadium_is_normalized(self):
        """The Data Site marks an undecided venue as ●未定●"""
        row = self.matches[self.matches['section_no'] == 21].iloc[0]

        self.assertEqual(row['stadium'], '未定')

    def test_match_index_restarts_each_section(self):
        """match_index_in_section is a 1-based counter within each section"""
        for _, group in self.matches.groupby('section_no'):
            expected = list(range(1, len(group) + 1))
            self.assertEqual(list(group['match_index_in_section']), expected)

    def test_pk_columns_empty_for_league_match(self):
        """League matches never go to a shootout, so the PK columns stay empty"""
        self.assertTrue((self.matches['home_pk_score'] == '').all())
        self.assertTrue((self.matches['away_pk_score'] == '').all())

    def test_other_competition_rows_are_filtered_out(self):
        """Only rows whose 大会 matches the requested competition are kept"""
        matches = read_match_from_web(self.soup, 'J2')

        self.assertTrue(matches.empty)
        self.assertEqual(list(matches.columns), CSV_COLUMNS)

    def test_missing_result_table_raises(self):
        """A response without the result table is an error, not an empty result"""
        empty_soup = BeautifulSoup('<html></html>', 'lxml')

        with self.assertRaises(ValueError):
            read_match_from_web(empty_soup, 'J1')


class TestDeriveStatus(unittest.TestCase):
    """Test for derive_status function"""

    def test_score_means_finished(self):
        self.assertEqual(derive_status('3-4'), '試合終了')

    def test_shootout_score_means_finished(self):
        self.assertEqual(derive_status('1-1(PK4-2)'), '試合終了')

    def test_blank_means_scheduled(self):
        self.assertEqual(derive_status(''), 'ＶＳ')

    def test_vs_means_scheduled(self):
        self.assertEqual(derive_status('vs'), 'ＶＳ')

    def test_cancelled_is_detected(self):
        self.assertEqual(derive_status('中止'), '試合中止')

    def test_not_held_is_detected(self):
        self.assertEqual(derive_status('不実施'), '試合不実施')

    def test_past_date_without_score_stays_scheduled(self):
        """Results are published with a lag; never guess a cancellation."""
        self.assertEqual(derive_status(''), 'ＶＳ')


class TestConvertDatasiteDate(unittest.TestCase):
    """Test for convert_datasite_date function"""

    def test_two_digit_year_is_expanded(self):
        self.assertEqual(convert_datasite_date('26/08/07'), '2026/08/07')

    def test_unparseable_value_is_returned_unchanged(self):
        self.assertEqual(convert_datasite_date('未定'), '未定')


class TestDatasiteYear(unittest.TestCase):
    """Test for datasite_year function"""

    def test_cross_year_season_uses_start_year(self):
        self.assertEqual(datasite_year('26-27'), 2026)

    def test_single_year_season(self):
        self.assertEqual(datasite_year('2025'), 2025)


if __name__ == '__main__':
    unittest.main()
