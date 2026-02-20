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
- URL パラメータ (`?category=1&season=2026`) で状態を共有可能
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
│   └── call_update_csv.sh          #   CI/CD実行スクリプト
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

`docs/json/season_map.json` はカテゴリ別・シーズン別のチーム構成を定義する。

```json
{
  "カテゴリ": {
    "シーズン名": [チーム数, 昇格枠, 降格枠, [チームリスト], {順位プロパティ}, {シーズン固有情報}]
  }
}
```

### 配列要素

| Index | 内容 | 必須 | 例 |
| ----- | ---- | ---- | -- |
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
| ---- | --- | -- |
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
- **`get_sub_seasons(category)` の戻り値で更新動作が決まる**
  - `None`: そのカテゴリに `config.season` のエントリが season_map にない → スキップ (何もしない)
  - `[]`: 通常の単一シーズン → `update_all_matches()` で従来通り更新
  - `[...]`: マルチグループシーズン → `update_sub_season_matches()` で各サブシーズン CSV に振り分け
  - season_map に新しい年のエントリを追加しない限り、そのカテゴリ・年は自動的にスキップされる

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
