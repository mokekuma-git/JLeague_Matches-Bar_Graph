# Legacy Scripts

1993〜2020年の旧Jリーグデータ処理に使用した運用スクリプト群。
data.j-league.or.jp の旧フォーマットからCSVを生成する一連のパイプラインとして使う。

現行スクレイパー (`src/read_jleague_matches.py`) は 2021年以降のデータを対象としており、
過去データの初期整備・再処理に加え、`read_older2020_matches.py` は現行の
ルヴァンカップ・Jユースカップの日次取得にも使用する。

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

`--frame` 指定時は `csv/{season}_frame{frame}.csv` へ保存する。`--year` は取得元の
`competition_years` 検索コードであり、保存名とは独立している。対応は
`old_matches.yaml` の `match_data.frame_seasons` で設定し、未登録の場合は検索コードを保存名に使う。

| 大会 | 検索コード (`--year`) | 保存先 |
| --- | --- | --- |
| Jユースカップ2026 | `1026` | `csv/2026_frame50.csv` |
| Jユースカップ2026/27 | `2026` | `csv/26_27_frame50.csv` |

```bash
# 2026大会
uv run python scripts/legacy/read_older2020_matches.py -y 1026 --frame 50
uv run python scripts/make_old_matches_csv.py --competition JYouthCup -y 1026

# 2026/27大会
uv run python scripts/legacy/read_older2020_matches.py -y 2026 --frame 50
uv run python scripts/make_old_matches_csv.py --competition JYouthCup -y 2026
```

変換処理も同じ対応から中間CSVを選ぶ。公開用CSVのシーズン名は従来どおり `2026`／`26-27` とする。

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
