"""Tests for read_jleague_matches.py"""
from datetime import datetime
from datetime import timezone
from pathlib import Path
import unittest

from bs4 import BeautifulSoup
import pandas as pd

from match_utils import drop_duplicated_indexes
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
    """Test for read_teams_from_web function"""

    def setUp(self):
        """Read HTML files for each competition"""
        self.test_data_dir = Path(__file__).parent / 'test_data'
        # Read HTML files for each competition and create BeautifulSoup objects
        self.j1_soup = self._load_html_file('j1_standing.html')
        self.j2_soup = self._load_html_file('j2_standing.html')
        self.j3_soup = self._load_html_file('j3_standing.html')

    def test_read_j1_teams(self):
        """Test for reading J1 teams"""
        teams = read_teams_from_web(self.j1_soup, 'J1')

        self.assertIsInstance(teams, list)
        self.assertTrue(len(teams) > 0)  # Should check the length of the list

        expected_teams = ['アビスパ福岡', '京都サンガF.C.', '川崎フロンターレ', 'ＦＣ町田ゼルビア', 'ファジアーノ岡山',
                          '柏レイソル', 'サンフレッチェ広島', '鹿島アントラーズ', '湘南ベルマーレ', 'ガンバ大阪',
                          '清水エスパルス', 'セレッソ大阪', 'ヴィッセル神戸', '横浜ＦＣ', '浦和レッズ', '東京ヴェルディ',
                          'ＦＣ東京', '横浜Ｆ・マリノス', '名古屋グランパス', 'アルビレックス新潟']
        for team in expected_teams:
            self.assertIn(team, teams, f"{team} is not in the J1 team list")

    def test_read_j2_teams(self):
        """Test for reading J2 teams"""
        teams = read_teams_from_web(self.j2_soup, 'J2')

        self.assertIsInstance(teams, list)
        self.assertTrue(len(teams) > 0)

        expected_teams = ['ジェフユナイテッド千葉', 'ＦＣ今治', 'ＲＢ大宮アルディージャ', 'ジュビロ磐田', 'ベガルタ仙台',
                          'Ｖ・ファーレン長崎', '水戸ホーリーホック', 'モンテディオ山形', '徳島ヴォルティス', '藤枝ＭＹＦＣ',
                          '大分トリニータ', 'カターレ富山', 'ロアッソ熊本', 'ヴァンフォーレ甲府', 'サガン鳥栖',
                          'ブラウブリッツ秋田', '北海道コンサドーレ札幌', 'レノファ山口ＦＣ', 'いわきＦＣ', '愛媛ＦＣ']
        for team in expected_teams:
            self.assertIn(team, teams, f"{team} is not in the J2 team list")

    def test_read_j3_teams(self):
        """Test for reading J3 teams"""
        teams = read_teams_from_web(self.j3_soup, 'J3')

        self.assertIsInstance(teams, list)
        self.assertTrue(len(teams) > 0)

        expected_teams = ['ＦＣ大阪', '鹿児島ユナイテッドＦＣ', 'ギラヴァンツ北九州', 'テゲバジャーロ宮崎',
                          '栃木シティ', '福島ユナイテッドＦＣ', '奈良クラブ', 'ツエーゲン金沢', 'ヴァンラーレ八戸',
                          'カマタマーレ讃岐', '高知ユナイテッドＳＣ', 'ＡＣ長野パルセイロ', 'ＦＣ琉球', '栃木ＳＣ',
                          'ザスパ群馬', 'ＳＣ相模原', 'アスルクラロ沼津', '松本山雅ＦＣ', 'ＦＣ岐阜', 'ガイナーレ鳥取']
        for team in expected_teams:
            self.assertIn(team, teams, f"{team} is not in the J3 team list")

    def test_invalid_competition(self):
        """Test for non-existing competition"""
        # Call the function with a non-existing competition (e.g., J4)
        teams = read_teams_from_web(self.j1_soup, 'J4')

        # Check that an empty list is returned
        self.assertEqual(teams, [])


class TestReadMatchFromWeb(HtmlLoadingTestCase):
    """Test for read_match_from_web function"""

    def setUp(self):
        """Read HTML files for each competition"""
        self.test_data_dir = Path(__file__).parent / 'test_data'
        self.j1_soup = self._load_html_file('j1_section1.html')
        self.j2_soup = self._load_html_file('j2_section2.html')
        self.j3_soup = self._load_html_file('j3_section3.html')

    def test_read_match_from_j1_data(self):
        """Test for reading match information from valid HTML data for J1"""
        matches = read_match_from_web(self.j1_soup)

        self.assertIsInstance(matches, list)

        assert len(matches) == 10
        assert matches[0]['match_date'] == '2025/02/14'
        assert matches[0]['start_time'] == '19:03'
        assert matches[0]['section_no'] == 1
        assert matches[0]['match_index_in_section'] == 1
        assert matches[0]['stadium'] == 'パナスタ'
        assert matches[0]['home_team'] == 'Ｇ大阪'
        assert matches[0]['home_goal'] == '2'
        assert matches[0]['away_goal'] == '5'
        assert matches[0]['away_team'] == 'Ｃ大阪'
        assert matches[0]['status'] == '試合終了'

        assert matches[9]['match_date'] == '2025/02/16'
        assert matches[9]['start_time'] == '14:03'
        assert matches[9]['section_no'] == 1
        assert matches[9]['match_index_in_section'] == 10
        assert matches[9]['stadium'] == 'Ｇスタ'
        assert matches[9]['home_team'] == '町田'
        assert matches[9]['home_goal'] == '1'
        assert matches[9]['away_goal'] == '2'
        assert matches[9]['away_team'] == '広島'
        assert matches[9]['status'] == '試合終了'

    def test_read_match_from_j2_data(self):
        """Test for reading match information from valid HTML data for J2"""
        matches = read_match_from_web(self.j2_soup)

        self.assertIsInstance(matches, list)

        assert len(matches) == 10
        assert matches[0]['match_date'] == '2025/02/22'
        assert matches[0]['start_time'] == '14:03'
        assert matches[0]['section_no'] == 2
        assert matches[0]['match_index_in_section'] == 1
        assert matches[0]['stadium'] == 'ＮＡＣＫ'
        assert matches[0]['home_team'] == '大宮'
        assert matches[0]['home_goal'] == '1'
        assert matches[0]['away_goal'] == '0'
        assert matches[0]['away_team'] == '甲府'
        assert matches[0]['status'] == '試合終了'
        assert matches[9]['match_date'] == '2025/02/23'
        assert matches[9]['start_time'] == '15:03'
        assert matches[9]['section_no'] == 2
        assert matches[9]['match_index_in_section'] == 10
        assert matches[9]['stadium'] == 'ニンスタ'
        assert matches[9]['home_team'] == '愛媛'
        assert matches[9]['home_goal'] == '1'
        assert matches[9]['away_goal'] == '2'
        assert matches[9]['away_team'] == '秋田'
        assert matches[9]['status'] == '試合終了'

    def test_read_match_from_j3_data(self):
        """Test for reading match information from valid HTML data for J3"""
        matches = read_match_from_web(self.j3_soup)

        self.assertIsInstance(matches, list)

        assert len(matches) == 10
        assert matches[0]['match_date'] == '2025/03/01'
        assert matches[0]['start_time'] == '14:03'
        assert matches[0]['section_no'] == 3
        assert matches[0]['match_index_in_section'] == 1
        assert matches[0]['stadium'] == 'ＣＦＳ'
        assert matches[0]['home_team'] == '栃木Ｃ'
        assert matches[0]['home_goal'] == '0'
        assert matches[0]['away_goal'] == '0'
        assert matches[0]['away_team'] == '沼津'
        assert matches[0]['status'] == '試合終了'
        assert matches[9]['match_date'] == '2025/03/02'
        assert matches[9]['start_time'] == '14:03'
        assert matches[9]['section_no'] == 3
        assert matches[9]['match_index_in_section'] == 10
        assert matches[9]['stadium'] == '春野陸'
        assert matches[9]['home_team'] == '高知'
        assert matches[9]['home_goal'] == '1'
        assert matches[9]['away_goal'] == '2'
        assert matches[9]['away_team'] == 'FC大阪'
        assert matches[9]['status'] == '試合終了'

    def test_read_match_from_web_no_matches(self):
        """Test for no match information - check that an empty list is returned"""
        empty_soup = BeautifulSoup('<html></html>', 'lxml')
        matches = read_match_from_web(empty_soup)

        # 空のリストが返されることを確認
        self.assertEqual(matches, [])

    def test_read_match_from_web_partial_data(self):
        """Test for partial data - check that the function can handle missing data"""
        partial_soup = BeautifulSoup("""
        <section class="matchlistWrap">
            <div class="timeStamp">
                <h4>2023年3月1日(水)</h4>
            </div>
            <div class="leagAccTit">
                <h5>第1節</h5>
            </div>
            <tr>
                <td class="stadium"></td>
                <td class="clubName leftside">ホームチーム</td>
                <td class="point leftside">2</td>
                <td class="point rightside">1</td>
                <td class="clubName rightside">アウェイチーム</td>
                <td class="status">終了</td>
            </tr>
        </section>
        """, 'lxml')
        matches = read_match_from_web(partial_soup)

        # Check if the function can continue processing even if the data is partially missing
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['stadium'], "")
        self.assertEqual(matches[0]['home_team'], "ホームチーム")
        self.assertEqual(matches[0]['home_goal'], "2")
        self.assertEqual(matches[0]['away_goal'], "1")
        self.assertEqual(matches[0]['away_team'], "アウェイチーム")
        self.assertEqual(matches[0]['status'], "終了")


if __name__ == '__main__':
    unittest.main()
