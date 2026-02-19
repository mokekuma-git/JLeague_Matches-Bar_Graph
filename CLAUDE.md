# JLeague_Matches-Bar_Graph

Jリーグ・各種サッカー大会の勝ち点積み上げグラフを可視化するWebアプリケーション。
GitHub Pages で公開: https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/

## ディレクトリ構造

```
JLeague_Matches-Bar_Graph/
├── config/                          # YAML設定ファイル
│   ├── jfamatch.yaml               #   JFA系大会設定
│   ├── jleague.yaml                #   Jリーグ設定
│   └── old_matches.yaml            #   過去データ設定
├── src/                             # Pythonスクリプト (データ取得・変換)
│   ├── set_config.py               #   設定管理モジュール (YAML読み込み)
│   ├── read_jleague_matches.py     #   Jリーグ公式サイトからスクレイピング (BS4)
│   ├── read_jfamatch.py            #   JFA JSON APIからデータ取得
│   ├── read_older2020_matches.py   #   2020年以前の過去データ取得
│   ├── read_aclgl_matches.py       #   ACLデータ取得
│   ├── read_we_league.py           #   WEリーグデータ取得
│   ├── get_endtime_list.py         #   cron自動生成 (試合日程→GitHub Actions)
│   └── make_old_matches_csv.py     #   過去データCSV変換
├── tests/                           # テストコード (pytest)
│   ├── test_read_jleague_matches.py
│   ├── test_get_endtime_list.py
│   ├── check_j_scores_homeaway.py
│   └── test_data/                  #   テスト用HTMLファイル
├── docs/                            # GitHub Pages公開ディレクトリ
│   ├── index.html                  #   トップページ
│   ├── j_points.{html,js,css}     #   Jリーグ用ページ (メイン)
│   ├── olympic_points.{html,js,css}#  オリンピック用
│   ├── wc2022_points.{html,js}    #   W杯用
│   ├── wcafc_fq_points.{html,js}  #   W杯予選用
│   ├── prince_points.{html,js}    #   プリンスリーグ用
│   ├── aclgl_points.{html,js}     #   ACL用
│   ├── team_style.css              #   チームカラー定義 (国内)
│   ├── national_team_style.css     #   チームカラー定義 (代表)
│   ├── csv/                        #   処理済みCSV (108ファイル, 1993年〜)
│   └── json/                       #   メタデータ
│       ├── season_map.json         #     シーズン設定
│       └── aclgl_points.json       #     ACL設定
├── csv/                             # 年次アーカイブCSV (1993-2024, 元データ保管)
├── scripts/
│   └── call_update_csv.sh          #   CI/CD実行スクリプト
├── notebook/                        # Jupyter notebook (開発・分析用)
├── image/                           # favicon等の画像素材
├── .github/workflows/
│   └── upadate-match-csv.yaml     #   GitHub Actions定義 (定期実行+試合連動)
├── pyproject.toml                   # Python依存関係 (uv管理)
├── uv.lock                          # uvロックファイル
├── setup.cfg                        # flake8等の設定
├── pytest.ini                       # pytest設定
└── .pylintrc                        # pylint設定
```

## 技術スタック

- **バックエンド (データ取得):** Python 3.12+ / BeautifulSoup4, requests, pandas, PyYAML, pytz, lxml
- **パッケージ管理:** uv (`pyproject.toml` + `uv.lock`)
- **フロントエンド:** Vanilla JavaScript, PapaParse (CSV解析), sortable-table
- **ホスティング:** GitHub Pages (完全クライアントサイド)
- **CI/CD:** GitHub Actions (定期実行 + 試合時刻連動cron)
- **テスト:** pytest

## 主要コマンド

```bash
# テスト実行
uv run pytest

# Jリーグデータ取得 (差分更新)
uv run python src/read_jleague_matches.py

# Jリーグデータ取得 (全更新)
uv run python src/read_jleague_matches.py -f

# JFAデータ取得
uv run python src/read_jfamatch.py <大会名>
```

## CSV形式

`docs/csv/*.csv` のカラム:
`match_date, section_no, match_index_in_section, start_time, stadium, home_team, home_goal, away_goal, away_team, status`

- `status`: "試合終了" (完了) / "ＶＳ" (未実施)
- `home_goal`/`away_goal`: 空 = 未実施
- `group`: グループ名 (2026特別シーズン等、グループ分けがある場合のみ)

## season_map.json 構造

`docs/json/season_map.json` はカテゴリ別・シーズン別のチーム構成を定義する。

```
{
  "カテゴリ": {
    "シーズン名": [チーム数, 昇格枠, 降格枠, [チームリスト], {順位プロパティ}, {シーズン固有情報}]
  }
}
```

### 配列要素

| Index | 内容 | 必須 | 例 |
|-------|------|------|-----|
| 0 | チーム数 | 必須 | `10` |
| 1 | 昇格枠数 | 必須 | `1` |
| 2 | 降格枠数 | 必須 | `0` |
| 3 | チームリスト (前年度成績順) | 必須 | `["鹿島", "柏", ...]` |
| 4 | 順位プロパティ (順位→性質) | 省略可 | `{"3": "promoted_playoff"}` |
| 5 | シーズン固有情報 | 省略可 | `{"group_display": "EAST", "url_category": "2j3"}` |

### チームリスト (index 3) の存在理由

順位ソートのための情報がすべて一致している同順位のチームを並べる際のベース優先順位とする
仮にここに出てこないチームが取得されてCSVなどに書き込まれた場合は、Warningを出しつつ、CSVでの登場順にこのリストに追加するものと考えて仮に動作させる

### シーズン固有情報 (index 5) のキー

| キー | 説明 | 例 |
|------|------|-----|
| `group_display` | HTML上の表示グループ名 (groupHeadテキスト)。スクレイピング結果の `group` 列でフィルタしてCSVに振り分ける | `"EAST"`, `"EAST-A"` |
| `url_category` | スクレイピングURL `j{category}/{sec}/` のカテゴリ部分を上書き (デフォルト: カテゴリキーをそのまま使用) | `"2j3"` → URL `j2j3/{sec}/` |

### シーズン命名規則

- **カテゴリ番号 (1, 2, 3) は不変** — 東西・グループの区別はシーズン名の追番で行う (カテゴリを増やさない)
- シーズン名 = 年号 + 任意の追番
  - 年号: 4桁数値 (`2026` 等)、将来は `25-26` のような欧州スタイルも想定
  - 追番: `A`/`B` (前後期)、`East`/`West` (地域)、`EastA`/`WestB` (地域+組) 等
  - 追番なし (素の年号) = 該当シーズンの全サブシーズンを結合した仮想結果
- CSVファイル名: `{シーズン名}_allmatch_result-J{カテゴリ}.csv`
- 順序は辞書順 (`East` < `West`, `EastA` < `EastB` < `WestA` < `WestB`)
- CSVファイル検索の正規表現: `r"(\d{4}[A-Za-z]*|\d{2}-\d{2}[A-Za-z]*)_allmatch_result-J(\d+).csv"`

## 設計上の決定事項

- **JFA JSON APIはCSVカラム設計の重要な参考情報源** — 新カラムを追加する際はJFA JSON構造を参照して名称を決める
- **スクレイピング時のシーズン文字列は `config.season` (YAML) が正** — HTMLから読み取ったシーズン情報で上書きしない。不一致時は警告のみ (別途シーズン検証ロジックを設けることはあり得る)
