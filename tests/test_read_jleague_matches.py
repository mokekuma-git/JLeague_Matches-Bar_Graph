import unittest
import pandas as pd
from datetime import datetime, timezone
import sys
from pathlib import Path
from bs4 import BeautifulSoup

sys.path.append(str(Path(__file__).parent.parent / 'src'))
from read_jleague_matches import read_teams_from_web
from read_jleague_matches import read_match_from_web
from read_jleague_matches import drop_duplicated_indexes


class TestDropDuplicatedIndexes(unittest.TestCase):

    def test_basic_duplicate_removal(self):
        """基本的な重複除去のテスト - 古い日付のエントリが除去されることを確認"""
        # テスト用データ作成
        data = {
            'date': [
                datetime(2023, 1, 1, tzinfo=timezone.utc),  # 古い日付
                datetime(2023, 1, 2, tzinfo=timezone.utc)   # 新しい日付
            ]
        }
        index = ['file1.csv', 'file1.csv']  # 同じファイル名
        df = pd.DataFrame(data, index=index)
        df.index.name = 'file'

        # 関数実行
        result = drop_duplicated_indexes(df)

        # 検証
        self.assertEqual(len(result), 1)  # 1行だけ残る
        self.assertEqual(result.index[0], 'file1.csv')
        self.assertEqual(result['date'].iloc[0], datetime(2023, 1, 2, tzinfo=timezone.utc))  # 新しい日付が残る

    def test_multiple_files_with_duplicates(self):
        """複数のファイルがあり、それぞれに重複がある場合のテスト"""
        # テスト用データ作成
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

        # 関数実行
        result = drop_duplicated_indexes(df)

        # 検証
        self.assertEqual(len(result), 2)  # 各ファイルにつき1行ずつ残る
        self.assertEqual(result.loc['file1.csv', 'date'], datetime(2023, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(result.loc['file2.csv', 'date'], datetime(2023, 2, 5, tzinfo=timezone.utc))

    def test_no_duplicates(self):
        """重複がない場合のテスト - データに変化がないことを確認"""
        # テスト用データ作成
        data = {
            'date': [
                datetime(2023, 1, 1, tzinfo=timezone.utc),
                datetime(2023, 2, 1, tzinfo=timezone.utc)
            ]
        }
        index = ['file1.csv', 'file2.csv']  # 異なるファイル名
        df = pd.DataFrame(data, index=index)
        df.index.name = 'file'

        # 関数実行
        result = drop_duplicated_indexes(df)

        # 検証
        self.assertEqual(len(result), 2)  # 全ての行が残る
        pd.testing.assert_frame_equal(result, df)  # 元のDataFrameと同じ

    def test_additional_columns(self):
        """日付以外の列がある場合のテスト"""
        # テスト用データ作成
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

        # 関数実行
        result = drop_duplicated_indexes(df)

        # 検証
        self.assertEqual(len(result), 1)
        self.assertEqual(result.loc['file1.csv', 'date'], datetime(2023, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(result.loc['file1.csv', 'size'], 200)


class HtmlLoadingTestCase(unittest.TestCase):
    def _load_html_file(self, filename):
        """HTMLファイルを読み込みBeautifulSoupオブジェクトを返す"""
        file_path = self.test_data_dir / filename
        with open(file_path, 'rb') as f:
            content = f.read()
            return BeautifulSoup(content.decode('utf-8', errors='ignore'), 'lxml')


class TestReadTeamsFromWeb(HtmlLoadingTestCase):
    def setUp(self):
        """テストで使用するHTMLファイルを読み込む"""
        self.test_data_dir = Path(__file__).parent / 'test_data'
        # 各カテゴリーのHTMLファイルを読み込み、BeautifulSoupオブジェクトを作成
        self.j1_soup = self._load_html_file('j1_standing.html')
        self.j2_soup = self._load_html_file('j2_standing.html')
        self.j3_soup = self._load_html_file('j3_standing.html')

    def test_read_j1_teams(self):
        """J1チームの読み込みテスト"""
        teams = read_teams_from_web(self.j1_soup, 1)

        # J1のチームが適切に読み込まれていることを確認
        self.assertIsInstance(teams, list)
        self.assertTrue(len(teams) > 0)  # チーム数はシーズンによって変わる可能性があるので一般的なチェック

        # J1チームのサンプルチェック (必要に応じて実際のチーム名で更新)
        expected_teams = ['アビスパ福岡', '京都サンガF.C.', '川崎フロンターレ', 'ＦＣ町田ゼルビア', 'ファジアーノ岡山',
                          '柏レイソル', 'サンフレッチェ広島', '鹿島アントラーズ', '湘南ベルマーレ', 'ガンバ大阪',
                          '清水エスパルス', 'セレッソ大阪', 'ヴィッセル神戸', '横浜ＦＣ', '浦和レッズ', '東京ヴェルディ',
                          'ＦＣ東京', '横浜Ｆ・マリノス', '名古屋グランパス', 'アルビレックス新潟']
        for team in expected_teams:
            self.assertIn(team, teams, f"{team}がJ1チームリストに含まれていません")

    def test_read_j2_teams(self):
        """J2チームの読み込みテスト"""
        teams = read_teams_from_web(self.j2_soup, 2)

        # J2のチームが適切に読み込まれていることを確認
        self.assertIsInstance(teams, list)
        self.assertTrue(len(teams) > 0)

        # J2チームのサンプルチェック
        expected_teams = ['ジェフユナイテッド千葉', 'ＦＣ今治', 'ＲＢ大宮アルディージャ', 'ジュビロ磐田', 'ベガルタ仙台',
                          'Ｖ・ファーレン長崎', '水戸ホーリーホック', 'モンテディオ山形', '徳島ヴォルティス', '藤枝ＭＹＦＣ',
                          '大分トリニータ', 'カターレ富山', 'ロアッソ熊本', 'ヴァンフォーレ甲府', 'サガン鳥栖',
                          'ブラウブリッツ秋田', '北海道コンサドーレ札幌', 'レノファ山口ＦＣ', 'いわきＦＣ', '愛媛ＦＣ']
        for team in expected_teams:
            self.assertIn(team, teams, f"{team}がJ2チームリストに含まれていません")

    def test_read_j3_teams(self):
        """J3チームの読み込みテスト"""
        teams = read_teams_from_web(self.j3_soup, 3)

        # J3のチームが適切に読み込まれていることを確認
        self.assertIsInstance(teams, list)
        self.assertTrue(len(teams) > 0)

        # J3チームのサンプルチェック
        expected_teams = ['ＦＣ大阪', '鹿児島ユナイテッドＦＣ', 'ギラヴァンツ北九州', 'テゲバジャーロ宮崎',
                          '栃木シティ', '福島ユナイテッドＦＣ', '奈良クラブ', 'ツエーゲン金沢', 'ヴァンラーレ八戸',
                          'カマタマーレ讃岐', '高知ユナイテッドＳＣ', 'ＡＣ長野パルセイロ', 'ＦＣ琉球', '栃木ＳＣ',
                          'ザスパ群馬', 'ＳＣ相模原', 'アスルクラロ沼津', '松本山雅ＦＣ', 'ＦＣ岐阜', 'ガイナーレ鳥取']
        for team in expected_teams:
            self.assertIn(team, teams, f"{team}がJ3チームリストに含まれていません")

    def test_invalid_category(self):
        """存在しないカテゴリでの処理テスト"""
        # 存在しないカテゴリ (例: J4) で関数を呼び出し
        teams = read_teams_from_web(self.j1_soup, 4)

        # 空リストが返されることを確認
        self.assertEqual(teams, [])


class TestReadMatchFromWeb(HtmlLoadingTestCase):
    def setUp(self):
        """テストで使用するHTMLファイルを読み込む"""
        self.test_data_dir = Path(__file__).parent / 'test_data'
        self.j1_soup = self._load_html_file('j1_section1.html')
        self.j2_soup = self._load_html_file('j2_section2.html')
        self.j3_soup = self._load_html_file('j3_section3.html')

    def test_read_match_from_j1_data(self):
        """有効なHTMLデータから試合情報を正しく読み込むテスト"""
        matches = read_match_from_web(self.j1_soup)

        # 試合情報が正しく読み込まれていることを確認
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
        """J2のHTMLデータから試合情報を正しく読み込むテスト"""
        matches = read_match_from_web(self.j2_soup)

        # 試合情報が正しく読み込まれていることを確認
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
        """J3のHTMLデータから試合情報を正しく読み込むテスト"""
        matches = read_match_from_web(self.j3_soup)

        # 試合情報が正しく読み込まれていることを確認
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
        """試合情報が存在しないHTMLデータのテスト"""
        empty_soup = BeautifulSoup('<html></html>', 'lxml')
        matches = read_match_from_web(empty_soup)

        # 空のリストが返されることを確認
        self.assertEqual(matches, [])

    def test_read_match_from_web_partial_data(self):
        """部分的なデータが欠けている場合のテスト"""
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

        # データが部分的に欠けていても処理が続行されることを確認
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['stadium'], "")
        self.assertEqual(matches[0]['home_team'], "ホームチーム")
        self.assertEqual(matches[0]['home_goal'], "2")
        self.assertEqual(matches[0]['away_goal'], "1")
        self.assertEqual(matches[0]['away_team'], "アウェイチーム")
        self.assertEqual(matches[0]['status'], "終了")


if __name__ == '__main__':
    unittest.main()
