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
