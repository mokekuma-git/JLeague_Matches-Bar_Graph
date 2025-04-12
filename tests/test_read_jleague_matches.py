import unittest
import pandas as pd
from datetime import datetime, timezone, timedelta
import sys
from pathlib import Path

# モジュールのインポートパスを追加
sys.path.append(str(Path(__file__).parent.parent / 'src'))

# テスト対象の関数をインポート
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
        self.assertEqual(result['date'][0], datetime(2023, 1, 2, tzinfo=timezone.utc))  # 新しい日付が残る

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

if __name__ == '__main__':
    unittest.main()