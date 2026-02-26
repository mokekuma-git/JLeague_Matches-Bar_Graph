# JLeague_Matches-Bar_Graph

Jリーグ・各種サッカー大会の勝ち点積み上げグラフを可視化するWebアプリケーション。
GitHub Pages で公開: <https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/>

## ビューアが提供する体験

このプロジェクトの核心は「リーグ戦の勝ち点推移を、チーム固有カラーで一望できる積み上げバーグラフ」にある。

### 積み上げバーグラフ

- 各チームを1本の縦棒で表現し、試合ごとの勝ち点 (勝ち=3pt / 引き分け=1pt / 負け=0ptなど) を色分けして積み上げる
- 未実施の試合も半透明で勝ち点上限まで描画し、「今後取り得る最大勝ち点」を視覚化する
- チームカラーは CSS で定義 (`team_style.css` / `national_team_style.css`)。マウスオーバーで試合詳細のツールチップを表示

### 日時スライダーによる時間遡行

- スライダーまたは日付指定で任意の日付時点の状態を再現する
- 指定日以降の試合は未実施扱いとなり、その時点での順位・勝ち点がグラフと順位表に反映される

### ソート

- **チームソート**: 勝ち点 (表示日時点 / 最新)、最大勝ち点 (表示日時点 / 最新) の4軸
- **試合ソート**: 積み上げ方向を「古い試合が下 / 新しい試合が下 / 第1節が下 / 最終節が下」から選択

### 順位表

- SortableTable (CDN) でソート可能な順位表を自動生成
- 優勝確定・昇格圏・降格圏・プレーオフ圏をライン表示で示す
- 勝ち点・得失点差・得点・勝敗数などの統計値を集計

### カテゴリ・シーズン切り替え

- ドロップダウンで J1/J2/J3 とシーズン (1993年〜) を切り替え
- URL パラメータ (`?competition=J1&season=2026East`) で状態を共有可能
- ユーザー設定 (カテゴリ・シーズン・ソート・表示日・外観) は localStorage に保存し、再訪時に復元

### 外観カスタマイズ

- グラフ縮小率・未実施試合の透明度・余白色を調整可能

## ディレクトリ構造

```text
JLeague_Matches-Bar_Graph/
├── frontend/                        # TypeScript フロントエンド (Vite)
│   ├── src/
│   │   ├── app.ts                  #   統合ビューア エントリポイント
│   │   ├── j_points.html           #   HTMLテンプレート (Vite input)
│   │   ├── config/
│   │   │   └── season-map.ts       #   season_map.json 読み込み・ユーティリティ
│   │   ├── core/
│   │   │   ├── csv-parser.ts       #   CSV→TeamMap 変換
│   │   │   ├── point-calculator.ts #   勝ち点計算ロジック
│   │   │   ├── prepare-render.ts   #   レンダ前データ準備 (純粋関数)
│   │   │   ├── sorter.ts           #   チーム・試合ソート
│   │   │   └── date-utils.ts       #   日付ユーティリティ
│   │   ├── graph/
│   │   │   ├── renderer.ts         #   バーグラフ描画
│   │   │   ├── bar-column.ts       #   各チームの棒グラフ生成
│   │   │   ├── tooltip.ts          #   ツールチップ生成
│   │   │   └── css-utils.ts        #   CSS変数操作 (スケール等)
│   │   ├── ranking/
│   │   │   ├── rank-table.ts       #   順位表HTML生成
│   │   │   └── stats-calculator.ts #   チーム統計集計
│   │   ├── storage/
│   │   │   └── local-storage.ts    #   ユーザー設定の永続化
│   │   ├── types/
│   │   │   ├── match.ts            #   試合データ型定義
│   │   │   ├── season.ts           #   シーズン設定型定義
│   │   │   └── config.ts           #   カテゴリ設定型定義
│   │   └── __tests__/              #   Vitest テスト
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts              #   ビルド → docs/ に出力
│   └── vitest.config.ts
├── config/                          # YAML設定ファイル (Python用)
│   ├── jfamatch.yaml               #   JFA系大会設定
│   ├── jleague.yaml                #   Jリーグ設定
│   └── old_matches.yaml            #   過去データ設定
├── src/                             # Pythonスクリプト (データ取得・変換)
│   ├── set_config.py               #   設定管理モジュール (YAML読み込み)
│   ├── match_utils.py              #   共有ユーティリティ (CSV I/O, season_map読み込み, 日付計算)
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
│   ├── test_2026_special_season.py #   2026特別シーズン対応テスト
│   ├── check_j_scores_homeaway.py
│   └── test_data/                  #   テスト用HTMLファイル
├── docs/                            # GitHub Pages公開ディレクトリ
│   ├── index.html                  #   → j_points.html へリダイレクト
│   ├── j_points.html               #   ★ ビルド生成物 (gitignore対象)
│   ├── assets/                     #   ★ ビルド生成物 (gitignore対象)
│   ├── j_points.css                #   Jリーグ用スタイル (手動管理)
│   ├── j_points_legacy.{html,js}  #   旧JS版 Jリーグページ (レガシー)
│   ├── olympic_points.{html,js,css}#  オリンピック用 (旧JS)
│   ├── wc2022_points.{html,js}    #   W杯用 (旧JS)
│   ├── wcafc_fq_points.{html,js}  #   W杯予選用 (旧JS)
│   ├── prince_points.{html,js}    #   プリンスリーグ用 (旧JS)
│   ├── aclgl_points.{html,js}     #   ACL用 (旧JS)
│   ├── team_style.css              #   チームカラー定義 (国内)
│   ├── national_team_style.css     #   チームカラー定義 (代表)
│   ├── csv/                        #   処理済みCSV
│   └── json/                       #   メタデータ
│       ├── season_map.json         #     シーズン設定 (全カテゴリ共通)
│       └── aclgl_points.json       #     ACL試合データ (独自JSON構造)
├── csv/                             # 年次アーカイブCSV (元データ保管)
├── scripts/
│   ├── call_update_csv.sh          #   CI/CD実行スクリプト
│   └── format_season_map.py        #   season_map.json カスタムフォーマッタ
├── image/                           # favicon等の画像素材
├── .github/workflows/
│   ├── deploy-pages.yaml           #   GitHub Pages デプロイ (TS build + upload)
│   ├── upadate-match-csv.yaml     #   CSV定期更新 (試合時刻連動cron)
│   ├── test-python.yaml            #   Python テスト (PR/push)
│   ├── test-typescript.yaml        #   TypeScript typecheck + vitest (PR/push)
│   ├── build-typescript.yaml       #   TypeScript ビルド (手動実行)
│   └── check-build-artifacts.yaml  #   ビルド生成物の誤コミット検出 (PR)
├── pyproject.toml                   # Python依存関係 (uv管理)
├── uv.lock                          # uvロックファイル
├── setup.cfg                        # flake8等の設定
├── pytest.ini                       # pytest設定
└── .pylintrc                        # pylint設定
```

## 技術スタック

- **バックエンド (データ取得):** Python 3.12+ / BeautifulSoup4, requests, pandas, PyYAML, pytz, lxml
- **パッケージ管理 (Python):** uv (`pyproject.toml` + `uv.lock`)
- **フロントエンド (TypeScript版):** TypeScript + Vite / PapaParse (CSV解析), SortableTable (CDN)
- **フロントエンド (旧JS版):** Vanilla JavaScript (ACL, W杯, オリンピック, プリンスリーグ等。未TS化)
- **パッケージ管理 (Frontend):** npm (`frontend/package.json` + `package-lock.json`)
- **Node.js:** 22 (CI/CD・ローカル開発共通)
- **ホスティング:** GitHub Pages (GitHub Actions でビルド&デプロイ)
- **CI/CD:** GitHub Actions (CSV定期更新 + TSビルド&デプロイ + テスト)
- **テスト (Python):** pytest
- **テスト (TypeScript):** vitest (環境: node, DOM テストは happy-dom)

## 主要コマンド

```bash
# === Python (データ取得) ===
uv run pytest                                    # Python テスト実行
uv run python src/read_jleague_matches.py        # Jリーグデータ取得 (差分更新)
uv run python src/read_jleague_matches.py -f     # Jリーグデータ取得 (全更新)
uv run python src/read_jfamatch.py <大会名>       # JFAデータ取得

# === TypeScript フロントエンド (frontend/ で実行) ===
npm test                  # vitest 実行 (npx vitest run)
npm run typecheck         # tsc --noEmit
npm run build             # tsc && vite build → docs/ に出力
npm run dev               # Vite開発サーバー起動
```

## デプロイモデル

- **GitHub Pages は GitHub Actions 経由** (`deploy-pages.yaml`): main push 時に TS ビルド → `docs/` を artifact としてアップロード → デプロイ
- **ビルド生成物 (`docs/j_points.html`, `docs/assets/`) は git 管理外** (`.gitignore` に記載)
- `docs/` 内の CSV, JSON, CSS, 旧JS ページ等はそのまま git 管理 (Python 側が直接更新)
- `check-build-artifacts.yaml` が PR 時にビルド生成物の誤コミットを検出

## TypeScript 移行状況

| ページ | 状態 | 備考 |
| ------ | ---- | ---- |
| Jリーグ (`j_points`) | TS版稼働中 | `frontend/src/app.ts` → `docs/j_points.html` (ビルド生成) |
| Jリーグ (レガシー) | 旧JS維持 | `docs/j_points_legacy.{html,js}` |
| ACL | 旧JS | `docs/aclgl_points.{html,js}` — 独自JSON (`aclgl_points.json`) |
| W杯2022 | 旧JS | `docs/wc2022_points.{html,js}` — 固定データ |
| W杯AFC予選 | 旧JS | `docs/wcafc_fq_points.{html,js}` |
| オリンピック | 旧JS | `docs/olympic_points.{html,js,css}` |
| プリンスリーグ | 旧JS | `docs/prince_points.{html,js}` — JFA JSON API |

## CSV形式

`docs/csv/*.csv` のカラム:
`match_date, section_no, match_index_in_section, start_time, stadium, home_team, home_goal, away_goal, away_team, status`

- `status`: "試合終了" (完了) / "ＶＳ" (未実施)
- `home_goal`/`away_goal`: 空 = 未実施
- `group`: グループ名 (2026特別シーズン等、グループ分けがある場合のみ)
- `home_pk_score`/`away_pk_score`: PK得点 (省略可能。PK戦あり試合のみ値あり、それ以外は空。JFA JSONの命名に倣った)

## season_map.json 構造

`docs/json/season_map.json` は4階層構造: **Group → Competition → Seasons → Entry**。

```json
{
  "jleague": {
    "display_name": "Jリーグ",
    "css_files": ["team_style.css"],
    "season_start_month": 1,
    "competitions": {
      "J1": {
        "league_display": "J1リーグ",
        "seasons": {
          "2026East": [10, 1, 0,
            ["鹿島", "柏", ...],
            {"group_display": "EAST"}],
          "2025": [20, 3, 3,
            ["神戸", "広島", ...]]
        }
      }
    }
  }
}
```

### 階層別のプロパティ

**Group 階層** (`jleague` 等): `display_name`, `css_files?`, `season_start_month?`

**Competition 階層** (`J1` 等): `league_display?`, `css_files?`, `point_system?`, `team_rename_map?`, `tiebreak_order?`, `season_start_month?`, `seasons`

**Season Entry** (配列): シーズンごとのチーム構成

| Index | 内容 | 必須 | 例 |
| ----- | ---- | ---- | -- |
| 0 | チーム数 | 必須 | `10` |
| 1 | 昇格枠数 | 必須 | `1` |
| 2 | 降格枠数 | 必須 | `0` |
| 3 | チームリスト (前年度成績順) | 必須 | `["鹿島", "柏", ...]` |
| 4 | SeasonEntryOptions | 省略可 | `{"group_display": "EAST", "rank_properties": {"3": "promoted_playoff"}}` |

### プロパティカスケード

TS 版 `resolveSeasonInfo()` が Group → Competition → Season Entry の3階層をマージして `SeasonInfo` を生成する。スカラ値は下位が上書き、配列 (`css_files`) は和集合、オブジェクト (`team_rename_map`) はマージ。

### チームリスト (index 3) の存在理由

順位ソートのための情報がすべて一致している同順位のチームを並べる際のベース優先順位とする。
仮にここに出てこないチームが取得されてCSVなどに書き込まれた場合は、Warningを出しつつ、CSVでの登場順にこのリストに追加するものと考えて仮に動作させる。

### SeasonEntryOptions の主要キー

| キー | 説明 | 例 |
| ---- | --- | -- |
| `group_display` | HTML上の表示グループ名 (groupHeadテキスト)。スクレイピング結果の `group` 列でフィルタしてCSVに振り分ける | `"EAST"`, `"EAST-A"` |
| `url_category` | スクレイピングURL `{category}/{sec}/` のカテゴリ部分を上書き (デフォルト: competition key を小文字化。例: `J1` → `j1`) | `"j2j3"` → URL `j2j3/{sec}/` |
| `rank_properties` | 順位→CSSクラスのマッピング | `{"3": "promoted_playoff"}` |
| `season_start_month` | シーズン開始月 (1-12)。Group→Competition→SeasonEntry でカスケード。コードデフォルト: `7` (秋春制) | `1` (暦年), `7` (秋春制) |

### シーズン命名規則

- **カテゴリ番号 (1, 2, 3) は不変** — 東西・グループの区別はシーズン名の追番で行う (カテゴリを増やさない)
- シーズン名 = 年号 + 任意の追番
  - 年号: 4桁数値 (`2026` 等) または `26-27` のような2桁年ハイフン形式 (秋春制)
  - 追番: `A`/`B` (前後期)、`East`/`West` (地域)、`EastA`/`WestB` (地域+組) 等
  - 追番なし (素の年号) = 該当シーズンの全サブシーズンを結合した仮想結果
- `get_season_from_date(season_start_month=N)` がシーズン文字列を自動算出。`season_start_month=1` → `"YYYY"` (暦年)、それ以外 → `"YY-YY"` (跨年)。`resolve_season_start_month()` が season_map.json のカスケードから開始月を解決する
- CSVファイル名: `{シーズン名}_allmatch_result-J{カテゴリ}.csv`
- 順序は辞書順 (`East` < `West`, `EastA` < `EastB` < `WestA` < `WestB`)
- CSVファイル検索の正規表現: `r"(\d{4}[A-Za-z]*|\d{2}-\d{2}[A-Za-z]*)_allmatch_result-J(\d+).csv"`

## 開発プラクティス

- **リファクタリング時のビルド確認**: テスト (`vitest`) 通過だけでなく `npm run build` (`vite build`) も各段階で確認する。CI の `test-typescript.yaml` は typecheck + vitest のみで、ビルド自体は PR 時に自動検証されないため、ローカルでの確認を習慣とする
- **season_map.json 編集後のフォーマット**: `python scripts/format_season_map.py` でカスタム整形を実行する (標準 `json.dump` では1シーズンが縦に長くなりすぎるため)

## 設計上の決定事項

- **JFA JSON APIはCSVカラム設計の重要な参考情報源** — 新カラムを追加する際はJFA JSON構造を参照して名称を決める
- **スクレイピング時のシーズン文字列は `config.season` (YAML) が正** — HTMLから読み取ったシーズン情報で上書きしない。不一致時は警告のみ (別途シーズン検証ロジックを設けることはあり得る)
- **`get_sub_seasons(category)` の戻り値で更新動作が決まる**
  - `None`: そのカテゴリに `config.season` のエントリが season_map にない → スキップ (何もしない)
  - `[]`: 通常の単一シーズン → `update_all_matches()` で従来通り更新
  - `[...]`: マルチグループシーズン → `update_sub_season_matches()` で各サブシーズン CSV に振り分け
  - season_map に新しい年のエントリを追加しない限り、そのカテゴリ・年は自動的にスキップされる
- **`match_utils.py` が共通ライブラリ** — CSV I/O (`update_if_diff`, `read_allmatches_csv`), season_map 読み込み (`load_season_map`, `get_sub_seasons`, `get_csv_path`), 日付計算 (`get_season_from_date`, `to_datetime_aspossible`) などの共通関数を提供。他スクリプト (`read_jfamatch`, `read_aclgl`, `read_we_league`) がインポートして使う。`read_jleague_matches.py` は J-League 固有のスクレイピングと URL 構築 (`competition.lower()` で URL セグメント生成) のみを担当
- **勝ち点システム (PointSystem)** — `'standard'` (勝3/PK勝2/PK負1/分1/負0) と `'old-two-points'` (勝2/分1/負0) の2種類。season_map.json の Competition 階層で `point_system` として指定可能 (デフォルト: `'standard'`)
- **SeasonEntry のバリデーション方針** — season_map.json は手動編集ファイルのため、読み込み時にバリデーションを行う。必須フィールド (配列 index 0〜3) の型不正・欠落はエラーで即停止。SeasonEntryOptions (index 4) の未知キーは Warning を出して無視する (新しい reader 向けオプションの試行錯誤を妨げない)

## aclgl_points.json 構造

`docs/json/aclgl_points.json` は ACL 専用の試合データ JSON。`season_map.json` とは異なる構造を持つ。

```json
{
  "グループ名": {
    "チーム名": {
      "df": [
        { "match_date": "04/16", "section_no": "1", "opponent": "...",
          "goal_get": "2", "goal_lose": "2", "point": 1,
          "has_result": true, "is_home": false, "group": "A",
          "match_status": "試合終了", "stadium": "...", "start_time": "04:00:00" }
      ]
    }
  }
}
```

旧JS版 (`aclgl_points.js`) が直接このJSONを読み込んで表示する。
CSV 経由ではなく、Python 側で JSON を直接生成している点が他の大会と異なる。
