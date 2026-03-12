# Legacy Scripts

1993〜2020年の旧Jリーグデータ処理に使用した運用スクリプト群。
data.j-league.or.jp の旧フォーマットからCSVを生成する一連のパイプラインとして使う。

現行スクレイパー (`src/read_jleague_matches.py`) は 2021年以降のデータを対象としており、
これらのスクリプトは過去データの初期整備や再処理が必要な場合にのみ使用する。

## スクリプト

### read_older2020_matches.py

data.j-league.or.jp から指定年度のJリーグ試合データをスクレイピングし、
中間CSV (`csv/{year}.csv`) として保存する。

```bash
uv run python scripts/legacy/read_older2020_matches.py --range 1993 2002
```

- **設定**: `old_matches.yaml` (URL パターン、カラムマッピング)
- **依存**: `src/set_config.py`
- **出力**: `csv/{year}.csv` (中間フォーマット。`docs/csv/` の最終フォーマットではない)

### old_matches.yaml

上記スクリプトの設定ファイル。URL フォーマット、リーグ名パターン (全角日本語)、
カラムリネームマッピング、出力パステンプレートを定義。

## 関連スクリプト (scripts/ 直下)

中間CSV に延長戦スコアを補完する3スクリプトも、このパイプラインと組み合わせて使う:

1. `scripts/fetch_match_detail.py` — 試合詳細HTMLをダウンロード
2. `scripts/parse_match_detail.py` — HTMLから延長戦・PKスコアを抽出
3. `scripts/enrich_match_detail.py` — 抽出結果を中間CSVに反映
4. `scripts/make_old_matches_csv.py` — 中間CSVを標準フォーマットに変換

典型的なワークフロー:

```bash
# 1. 旧データ取得
uv run python scripts/legacy/read_older2020_matches.py --range 1993 1998

# 2. 試合詳細HTML取得 (延長戦スコア補完用)
uv run python scripts/fetch_match_detail.py --range 1993 1998

# 3. 延長戦スコアを中間CSVに反映
uv run python scripts/enrich_match_detail.py --range 1993 1998

# 4. 標準CSVフォーマットに変換
uv run python scripts/make_old_matches_csv.py --range 1993 1998
```
