"""Tests for read_jleague_matches.py"""
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import unittest

from bs4 import BeautifulSoup
import pandas as pd

from match_utils import drop_duplicated_indexes
from read_jleague_matches import CSV_COLUMNS
from read_jleague_matches import derive_status
from read_jleague_matches import keep_unlisted_matches
from read_jleague_matches import read_sections_from_web
from read_jleague_matches import season_periods
from read_jleague_matches import get_match_dates_of_section
from read_jleague_matches import get_sections_to_update
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
    """Test for read_match_from_web function (jleague.jp schedule pages)"""

    def setUp(self):
        self.test_data_dir = Path(__file__).parent / 'test_data'
        self.live = read_match_from_web(self._load_html_file('jleague_match_live.html'), 'J1')
        self.finished = read_match_from_web(
            self._load_html_file('jleague_match_finished.html'), 'J1')
        self.mixed = read_match_from_web(self._load_html_file('jleague_match_mixed.html'), 'J1')

    def test_returns_dataframe_with_csv_columns(self):
        self.assertIsInstance(self.live, pd.DataFrame)
        self.assertEqual(list(self.live.columns), CSV_COLUMNS)

    def test_finished_match_is_parsed(self):
        row = self.finished.iloc[0]

        self.assertEqual(row['match_date'], '2026/08/07')
        self.assertEqual(row['section_no'], 1)
        self.assertEqual(row['home_team'], '横浜FM')
        self.assertEqual(row['away_team'], '鹿島')
        self.assertEqual(row['home_goal'], '3')
        self.assertEqual(row['away_goal'], '4')
        self.assertEqual(row['status'], '試合終了')
        self.assertEqual(row['stadium'], 'MUFG国立')

    def test_live_match_keeps_running_score_and_elapsed_time(self):
        """A match in progress carries the live marker plus the elapsed time."""
        row = self.live.iloc[0]

        self.assertEqual(row['home_team'], '水戸')
        self.assertEqual(row['home_goal'], '1')
        self.assertEqual(row['away_goal'], '0')
        self.assertTrue(row['status'].startswith('速報中'))
        self.assertIn('前半', row['status'])

    def test_scheduled_match_keeps_kickoff_time(self):
        """Before kick-off the card shows the time instead of a score."""
        row = self.live[self.live['home_team'] == '浦和'].iloc[0]

        self.assertEqual(row['start_time'], '19:00')
        self.assertEqual(row['home_goal'], '')
        self.assertEqual(row['away_goal'], '')
        self.assertEqual(row['status'], 'ＶＳ')

    def test_started_match_has_no_kickoff_time_left(self):
        """Once a match starts the slot is replaced by the score."""
        self.assertEqual(self.live.iloc[0]['start_time'], '')

    def test_team_names_use_the_short_form(self):
        """The CSV vocabulary is the short name, not the full club name."""
        self.assertIn('Ｇ大阪', set(self.live['home_team']))
        self.assertNotIn('ガンバ大阪', set(self.live['home_team']))

    def test_section_is_joined_by_date(self):
        """Headers are not interleaved with cards, so the date is the join key."""
        self.assertEqual(set(self.mixed['section_no']), {5, 6, 7})

    def test_other_competitions_are_filtered_out(self):
        """Cup and continental fixtures share the page and must be dropped."""
        as_j2 = read_match_from_web(self._load_html_file('jleague_match_mixed.html'), 'J2')

        self.assertTrue(as_j2.empty)
        # The mixed fixture holds one non-J1 fixture among its cards.
        self.assertEqual(len(self.mixed), 9)

    def test_broadcast_is_captured(self):
        self.assertEqual(self.finished.iloc[0]['broadcast'], 'DAZN・フジテレビ系列')

    def test_page_without_matches_returns_empty_frame(self):
        empty = read_match_from_web(BeautifulSoup('<html></html>', 'lxml'), 'J1')

        self.assertTrue(empty.empty)
        self.assertEqual(list(empty.columns), CSV_COLUMNS)


class TestReadSectionsFromWeb(HtmlLoadingTestCase):
    """Test for read_sections_from_web function"""

    def setUp(self):
        self.test_data_dir = Path(__file__).parent / 'test_data'

    def test_only_league_headers_are_kept(self):
        """Cup rounds ('1回戦') carry no section number and must not appear."""
        sections = read_sections_from_web(self._load_html_file('jleague_match_mixed.html'))

        self.assertEqual(sections['2026/09/02'], 5)
        self.assertEqual(sections['2026/09/12'], 7)
        self.assertTrue(all(isinstance(v, int) for v in sections.values()))


class TestDeriveStatus(unittest.TestCase):
    """Test for derive_status function"""

    def test_finished_match(self):
        self.assertEqual(derive_status(['3', '4'], '', '試合終了'), '試合終了')

    def test_live_match_keeps_elapsed_time(self):
        status = derive_status(['1', '0'], '前半 30分', '')

        self.assertTrue(status.startswith('速報中'))
        self.assertIn('前半 30分', status)

    def test_scheduled_match(self):
        self.assertEqual(derive_status([], '', ''), 'ＶＳ')

    def test_cancelled_match(self):
        self.assertEqual(derive_status([], '', '試合中止'), '試合中止')

    def test_score_without_wording_counts_as_finished(self):
        self.assertEqual(derive_status(['2', '1'], '', ''), '試合終了')


class TestSeasonPeriods(unittest.TestCase):
    """Test for season_periods function"""

    def test_covers_twelve_months_from_season_start(self):
        periods = season_periods(start_month=7)

        self.assertEqual(len(periods), 12)
        for (start, end) in periods:
            self.assertLess(start, end)

    def test_periods_are_contiguous(self):
        periods = season_periods(start_month=7)

        for (_, end), (start, _) in zip(periods, periods[1:]):
            gap = (datetime.strptime(start, '%Y-%m-%d')
                   - datetime.strptime(end, '%Y-%m-%d')).days
            self.assertEqual(gap, 1)


class TestKeepUnlistedMatches(unittest.TestCase):
    """Test for keep_unlisted_matches function"""

    def _row(self, section, home, away, **kw):
        base = {'match_date': '2026/12/19', 'section_no': section,
                'match_index_in_section': 1, 'start_time': '14:00', 'stadium': 'X',
                'home_team': home, 'home_goal': '', 'away_goal': '', 'away_team': away,
                'status': 'ＶＳ', 'home_pk_score': '', 'away_pk_score': '', 'broadcast': ''}
        base.update(kw)
        return base

    def test_undated_fixture_is_carried_over(self):
        """A fixture with no settled date is missing from the schedule page."""
        fetched = pd.DataFrame([self._row(20, 'A', 'B')])
        current = pd.DataFrame([self._row(20, 'A', 'B'),
                                self._row(20, '京都', '岡山', match_date=None)])

        result = keep_unlisted_matches(fetched, current)

        self.assertEqual(len(result), 2)
        self.assertIn('京都', set(result['home_team']))

    def test_nothing_added_when_the_page_is_complete(self):
        fetched = pd.DataFrame([self._row(20, 'A', 'B')])

        result = keep_unlisted_matches(fetched, pd.DataFrame([self._row(20, 'A', 'B')]))

        self.assertEqual(len(result), 1)

    def test_only_the_named_sections_are_considered(self):
        fetched = pd.DataFrame([self._row(20, 'A', 'B')])
        current = pd.DataFrame([self._row(20, 'A', 'B'), self._row(21, 'C', 'D')])

        result = keep_unlisted_matches(fetched, current, sections={20})

        self.assertEqual(len(result), 1)


class TestUndecidedDateIsUsableDownstream(unittest.TestCase):
    """A fixture with no settled date must not break the incremental update path.

    get_match_dates_of_section() drops undecided rows via dropna(); a literal
    '未定' would instead reach pd.to_datetime and raise ValueError, which is what
    broke the scheduled CSV update after the Data Site migration.
    """

    def _frame(self, match_date, start_time):
        return pd.DataFrame([{
            'match_date': match_date, 'section_no': 20, 'match_index_in_section': 1,
            'start_time': start_time, 'home_team': '京都', 'away_team': '岡山',
        }])

    def test_undecided_date_row_yields_no_section(self):
        """An undecided fixture must be ignored, not raise."""
        frame = self._frame(None, '')
        now = datetime(2026, 8, 29, 18, 0, tzinfo=ZoneInfo('Asia/Tokyo'))

        sections = get_sections_to_update(frame, now - timedelta(days=1), now)

        self.assertEqual(sections, set())

    def test_settled_date_without_kickoff_time_is_kept(self):
        """SFMS01 leaves K/O時刻 blank until it is fixed, but the date may be set."""
        result = get_match_dates_of_section(self._frame('2027/02/13', ''))

        self.assertEqual(list(result), [20])
        self.assertEqual(result[20][0].strftime('%Y/%m/%d %H:%M'), '2027/02/13 00:00')

    def test_settled_date_and_time(self):
        result = get_match_dates_of_section(self._frame('2026/08/29', '18:00'))

        self.assertEqual(result[20][0].strftime('%Y/%m/%d %H:%M'), '2026/08/29 18:00')


if __name__ == '__main__':
    unittest.main()
