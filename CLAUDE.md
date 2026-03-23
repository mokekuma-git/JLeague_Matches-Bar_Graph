# JLeague_Matches-Bar_Graph

Jリーグ・各種サッカー大会の試合結果を勝ち点積み上げグラフなどで可視化するWebアプリケーション。
GitHub Pages で公開: <https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/>

チーム固有カラーの積み上げバーグラフで勝ち点推移を一望でき、日時スライダーで任意時点の順位を再現する。

## ディレクトリ構造

```text
JLeague_Matches-Bar_Graph/
├── frontend/                        # TypeScript フロントエンド (Vite)
│   ├── src/
│   │   ├── app.ts                  #   エントリポイント
│   │   ├── j_points.html           #   HTMLテンプレート (Vite input)
│   │   ├── config/season-map.ts    #   season_map.json 読み込み・ユーティリティ
│   │   ├── config/rule-notes.ts   #   ルール説明ノート自動生成 (i18n準備済)
│   │   ├── core/                   #   CSV解析, 勝ち点計算, ソート, 日付ユーティリティ
│   │   ├── graph/                  #   バーグラフ描画, ツールチップ, CSS操作
│   │   ├── ranking/                #   順位表HTML生成, 統計集計
│   │   ├── storage/                #   localStorage 永続化
│   │   ├── types/                  #   型定義 (match, season, config)
│   │   └── __tests__/              #   Vitest テスト
│   ├── e2e/                        #   Playwright E2E テスト
│   ├── playwright.config.ts
│   ├── vite.config.ts              #   ビルド → docs/ に出力
│   └── vitest.config.ts
├── src/                             # Python スクリプト (データ取得・変換)
│   ├── match_utils.py              #   共有ライブラリ (CSV I/O, season_map, 日付計算)
│   ├── set_config.py               #   設定管理 (YAML読み込み)
│   ├── read_jleague_matches.py     #   Jリーグスクレイピング (BS4)
│   ├── read_jfamatch.py            #   JFA JSON API データ取得
│   └── ...                         #   ACL, WEリーグ, cron生成等
├── config/                          #   YAML設定 (jleague.yaml, jfamatch.yaml等)
├── tests/                           #   pytest テストコード + test_data/
├── docs/                            # GitHub Pages 公開ディレクトリ
│   ├── j_points.html, assets/      #   ★ ビルド生成物 (gitignore対象)
│   ├── *.css                       #   スタイル (チームカラー定義含む)
│   ├── csv/                        #   処理済みCSV
│   └── json/                       #   season_map.json
├── scripts/                         #   CI/CDスクリプト, 運用ユーティリティ
│   ├── check_type_sync.py          #   Python ↔ TS 型同期チェック (CI)
│   ├── check_point_system_csv.py   #   PointSystem ↔ CSV 整合検証 (CI)
│   ├── fetch_match_detail.py       #   旧試合詳細ページ取得 (1回限り)
│   ├── enrich_match_detail.py      #   試合詳細→延長スコア反映 (1回限り)
│   ├── parse_match_detail.py       #   試合詳細 HTML パーサー
│   └── legacy/                     #   旧データ処理スクリプト + config (1993-2020)
├── .github/workflows/               #   Pages デプロイ, CSV更新, テスト, ビルドチェック
└── pyproject.toml                   #   Python依存 (uv管理)
```

## 技術スタック

- **Python 3.12+**: BeautifulSoup4, requests, pandas, PyYAML / パッケージ管理: uv / テスト: pytest
- **TypeScript + Vite**: PapaParse (CSV), SortableTable (CDN) / パッケージ管理: npm / テスト: vitest (DOM: happy-dom), Playwright (E2E) / Node.js 22
- **CI/CD**: GitHub Actions (CSV定期更新 + TSビルド&デプロイ + テスト) → GitHub Pages

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

# === E2E テスト (frontend/ で実行) ===
npx playwright test                              # E2E 全テスト
npx playwright test --grep-invert @full-render   # full-render 除外 (CI デフォルト)
npx playwright test --grep @full-render          # full-render のみ
```

## デプロイモデル

- **GitHub Pages は GitHub Actions 経由** (`deploy-pages.yaml`): main push 時に TS ビルド → `docs/` を artifact としてアップロード → デプロイ
- **ビルド生成物 (`docs/j_points.html`, `docs/assets/`) は git 管理外** (`.gitignore` に記載)
- `docs/` 内の CSV, JSON, CSS はそのまま git 管理 (Python 側が直接更新)
- `check-build-artifacts.yaml` が PR 時にビルド生成物の誤コミットを検出

## CSV形式

`docs/csv/*.csv` のカラム:
`match_date, section_no, match_index_in_section, start_time, stadium, home_team, home_goal, away_goal, away_team, status`

- `section_no`: 正の整数 = リーグ/GS の節番号、負の整数 = KO ブラケット深度 (`-1` = 決勝, `-2` = 準決勝, ...)
- `match_index_in_section`: `section_no` 内の 1-indexed 通番。H&A では同一カードが同じ番号を共有し、`leg` で第1戦/第2戦を区別
- `status`: "試合終了" (完了) / "ＶＳ" (未実施)
- `home_goal`/`away_goal`: 空 = 未実施
- `group`: グループ名 (グループ分けがある場合のみ)
- `home_pk_score`/`away_pk_score`: PK得点 (省略可能。JFA JSONの命名由来)
- `home_score_ex`/`away_score_ex`: 延長戦得点 (省略可能)
- `round`: トーナメントのラウンド名 (省略可能。Tournament View のブラケット構築・ラベル・絞り込みに使用)
- `leg`: H&A の第1戦/第2戦を示す整数 1 or 2 (省略可能。aggregate 合算処理の識別子)
- `match_number`: 公式の試合採番 (省略可能。data.j-league.jpやJFA JSONなどから取得可能な場合に付与)
- その他付加情報 [`broadcast`, `attendance`]

## season_map.json 構造

4階層構造: **Group → Competition → Seasons → Entry**。

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
          "2026East": {"team_count": 10, "promotion_count": 1, "relegation_count": 0,
            "teams": ["鹿島", "柏", ...],
            "group_display": "EAST"},
          "2025": {"team_count": 20, "promotion_count": 3, "relegation_count": 3,
            "teams": ["神戸", "広島", ...]}
        }
      }
    }
  }
}
```

### 階層別プロパティ

- **Group** (`jleague` 等): `display_name`, `css_files?`, `season_start_month?`, `data_source?`, `note?`
- **Competition** (`J1` 等): `league_display?`, `css_files?`, `point_system?`, `team_rename_map?`, `tiebreak_order?`, `season_start_month?`, `data_source?`, `note?`, `seasons`

### Season Entry (オブジェクト)

必須キーとオプショナルキーがフラットに同居するオブジェクト。

| キー | 内容 | 必須 | 例 |
| ---- | ---- | ---- | -- |
| `team_count` | チーム数 | 必須 | `10` |
| `promotion_count` | 昇格枠数 | 必須 | `1` |
| `relegation_count` | 降格枠数 | 必須 | `0` |
| `teams` | チームリスト (前年度成績順 = 同順位時の優先順位) | 必須 | `["鹿島", "柏", ...]` |
| (その他) | カスケード対象のオプショナルキー (下記参照) | 省略可 | `"group_display": "EAST"` |

### プロパティカスケード

`resolveSeasonInfo()` が Group → Competition → Season Entry の3階層をマージ。スカラ値は下位が上書き、配列 (`css_files`, `note`) は和集合、オブジェクト (`team_rename_map`) はマージ。

### オプショナルキー (カスケード対象)

- `group_display`: HTML上の表示グループ名。スクレイピング結果の `group` 列でCSVに振り分ける
- `url_category`: スクレイピングURL のカテゴリ部分を上書き (デフォルト: competition key の小文字化)
- `rank_properties`: 順位→CSSクラスのマッピング (例: `{"3": "promoted_playoff"}`)
- `season_start_month`: シーズン開始月。カスケード対象。コードデフォルト: `7` (秋春制)
- `data_source`: データ参照元。`{label, url}` オブジェクト。カスケード対象 (スカラ: 下位が上書き)。フロントエンドで動的表示
- `note`: 注記テキスト (`string | string[]`)。カスケード対象 (和集合: Group + Competition + Entry を結合)。フロントエンドで動的表示
- `promotion_label`: 昇格枠のラベル文字列 (デフォルト: `'昇格'`)。カスケード対象 (スカラ: 下位が上書き)。HTML 許容 (例: `'昇格<br/>ACL'`)

### シーズン命名規則

- カテゴリ番号 (1, 2, 3) は不変。東西・グループはシーズン名の追番で区別
- シーズン名 = 年号 (`2026` or `26-27`) + 追番 (`East`/`West`/`A`/`B`/`EastA` 等)。追番なし = 全サブシーズン結合の仮想結果
- `get_season_from_date(season_start_month=N)`: `1` → `"YYYY"` (暦年)、それ以外 → `"YY-YY"` (跨年)
- CSVファイル名: `{シーズン名}_allmatch_result-J{カテゴリ}.csv`
- CSV検索正規表現: `r"(\d{4}[A-Za-z]*|\d{2}-\d{2}[A-Za-z]*)_allmatch_result-J(\d+).csv"`

## 開発プラクティス

- **`plan/` と `local_data/` はローカル専用**: どちらも Git 管理しない。`git add` の対象に含めず、ignore 警告が出ても `git add -f` で突破しない。Issue plan や調査メモは作成・更新してよいが、commit / PR / GitHub Issue には載せない
- **リファクタリング時のビルド確認**: テスト (`vitest`) だけでなく `npm run build` も確認する。CI は typecheck + vitest のみでビルドは PR 時に自動検証されない
- **season_map.json 編集後**: `python scripts/format_season_map.py` でカスタム整形を実行

## Python ↔ TypeScript 型同期

Python と TypeScript で共有する型定義のドリフトを CI で検出する。手動での定義保守を前提とし、Python 側を先に変更→TS を合わせる→CI が検証 のワークフローで運用。

### 共有型の対応表

| 共有型 | Python (src/match_utils.py) | TypeScript (frontend/src/types/) |
| ------ | --------------------------- | -------------------------------- |
| CSV カラム定義 | `CSV_COLUMN_SCHEMA` | `RawMatchRow` (match.ts) |
| SeasonEntry オプション | `SeasonEntry.OPTIONAL_KEYS` | `SeasonEntryOptions` (season.ts) |
| PointSystem 値 | `POINT_SYSTEM_VALUES` | `POINT_MAPS` keys (config.ts) |

### ローカル検証

```bash
uv run python scripts/check_type_sync.py
```

### TS 側のみ許容するフィールド

`RawMatchRow` に Python 側にないフィールドがある場合、`check_type_sync.py` 内の `TS_ONLY_CSV_FIELDS` で管理する。現在は空 (全フィールドが Python ↔ TS で同期済み)。

## 設計上の決定事項

- **JFA JSON APIはCSVカラム名の参考情報源** — 新カラム追加時はJFA JSON構造を参照
- **スクレイピング時のシーズン文字列は `config.season` (YAML) が正** — HTML読み取り値で上書きしない
- **`get_sub_seasons(category)` の戻り値で更新動作が決まる**: `None` → スキップ / `[]` → 単一シーズン更新 / `[...]` → マルチグループ振り分け
- **`match_utils.py` が共通ライブラリ** — CSV I/O, season_map 読み込み, 日付計算を提供。各 reader がインポートして使う
- **勝ち点システム**: Competition/Season 階層の `point_system` で指定 (デフォルト: `'standard'`)。有効値は Python `POINT_SYSTEM_VALUES` と TS `POINT_MAPS` で管理し、`check_type_sync.py` で同期検証。非 standard 時は `rule-notes.ts` がルール説明を自動生成して note 欄に表示
  - `'standard'` (2003–): 勝3/分1/負0
  - `'victory-count'` (1993–94): 勝1/他0 (`POINT_HEIGHT_SCALE=3` でボックス高さ3倍)
  - `'win3all-pkloss1'` (1995–96): 全勝3/PK負1/負0
  - `'graduated-win'` (1997–98): 90分勝3/延長勝2/PK勝1/負0
  - `'ex-win-2'` (1999–2002): 90分勝3/延長勝2/分1/負0
  - `'pk-win2-loss1'` (2026特別大会): 勝3/PK勝2/PK負1/負0
- **SeasonEntry バリデーション**: 必須キー (`team_count`, `promotion_count`, `relegation_count`, `teams`) の欠落・型不正は即エラー。未知のオプショナルキーは Warning で無視
- **ルール説明ノート自動生成** (`config/rule-notes.ts`): `pointSystem` が `'standard'` 以外、または `tiebreakOrder` がデフォルト (`['goal_diff', 'goal_get']`) と異なる場合、`resolveSeasonInfo()` が note 配列末尾にルール説明を自動追加。メッセージは辞書オブジェクトで管理し、将来の多言語化に備える (locale 引数 + `Record<Locale, ...>` への拡張で対応可能)
- **スコアアノテーション規則 (リーグ・トーナメント共通)**: メインスコア (`homeGoal`/`awayGoal`) は常に ET 込みの最終結果。`formatScore` が `(PKn)` / `(ETn)` アノテーションを付加。PK がある場合は PK のみ表示 (ET 後も同点なので ET スコアに情報価値なし)。単試合・H&A aggregate 共通ロジック
  - **単試合**: CSV の `home_pk_score`/`away_pk_score`/`home_score_ex`/`away_score_ex` をそのままマッピング
  - **H&A aggregate**: PK → 決定 leg (最終 played leg) の PK スコアを upper/lower にマッピング。ET → 全 leg の ET スコアを upper/lower で合算。合計スコアには ET が含まれるため、ET アノテーションは「合計のうち延長分がいくら」を示す
- **ツールチップ表示規則**: ボックス内スコアは `ET`/`PK` プレフィックスで種別を明示 (`3-2 (ET1-0)`, `1-1 (PK5-3)`)。PKまで行った場合のET情報は省略 (ET後も同点のためスコアに情報価値なし)。チーム名ツールチップの成績は勝/分/敗を1行、延長勝負・PK勝負を各1行で表示
- **描画の不変条件 (View Invariants)**: 以下はどの大会・日程・Preference でも必ず維持する。違反時はできる限り原因を調査し、適切な表示ができないことをユーザーに伝える
  - **(I1) バーグラフ高さ一致**: 全チーム列と勝ち点列の高さが等しい (スペースボックスで差を埋める)
  - **(I2) 未実施ボックスの順序**: `.future` ボックスが実施済みボックスの間に混在しない
  - **(I3) チームカラー未定義の警告**: CSS 未定義のチームがあっても描画は継続するが、ユーザーに警告を表示する (描画ブロッカーではない)
  - **(I4) 順位表とバーグラフの順序一致**: 描画直後のデフォルト状態で、順位表のチーム順とバーグラフの左→右の並びが一致する (ユーザーが順位表ヘッダーをクリックしてソートした場合はこの限りではない)
