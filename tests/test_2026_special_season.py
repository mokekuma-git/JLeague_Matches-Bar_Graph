"""Tests for 2026 special season data parsing.

2026 has a unique structure:
- J1: Split into East/West groups (10 teams each)
- J2/J3: Merged into 4 groups (EastA/EastB/WestA/WestB, 10 teams each)
  with URL path 'j2j3' instead of 'j2'
"""
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

from read_jleague_matches import read_match_from_web


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

    def test_section_no_parsed_from_special_title(self):
        """Section number should be parsed from '...第1節' title format."""
        for m in self.matches:
            self.assertEqual(m['section_no'], 1)


class TestGetSubSeasons(unittest.TestCase):
    """Test get_sub_seasons with 2026 season_map data."""

    def setUp(self):
        with open(SEASON_MAP_PATH, 'r', encoding='utf-8') as f:
            self.season_map = json.load(f)

    def test_j1_sub_seasons(self):
        from read_jleague_matches import get_sub_seasons
        with patch('read_jleague_matches.load_season_map', return_value=self.season_map):
            subs = get_sub_seasons(1)
        self.assertEqual(len(subs), 2)
        self.assertEqual(subs[0]['name'], '2026East')
        self.assertEqual(subs[1]['name'], '2026West')
        self.assertEqual(subs[0]['group'], 'East')
        self.assertEqual(subs[1]['group'], 'West')
        self.assertEqual(subs[0]['group_display'], 'EAST')
        self.assertEqual(subs[1]['group_display'], 'WEST')
        self.assertNotIn('url_category', subs[0])
        self.assertNotIn('url_category', subs[1])

    def test_j2_sub_seasons(self):
        from read_jleague_matches import get_sub_seasons
        with patch('read_jleague_matches.load_season_map', return_value=self.season_map):
            subs = get_sub_seasons(2)
        self.assertEqual(len(subs), 4)
        names = [s['name'] for s in subs]
        self.assertEqual(names, ['2026EastA', '2026EastB', '2026WestA', '2026WestB'])
        for s in subs:
            self.assertEqual(s['url_category'], '2j3')
        displays = [s['group_display'] for s in subs]
        self.assertEqual(displays, ['EAST-A', 'EAST-B', 'WEST-A', 'WEST-B'])


if __name__ == '__main__':
    unittest.main()
