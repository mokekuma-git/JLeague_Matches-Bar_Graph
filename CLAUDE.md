# JLeague_Matches-Bar_Graph

Jリーグ・各種サッカー大会の勝ち点積み上げグラフを可視化するWebアプリケーション。
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
│   │   ├── core/                   #   CSV解析, 勝ち点計算, ソート, 日付ユーティリティ
│   │   ├── graph/                  #   バーグラフ描画, ツールチップ, CSS操作
│   │   ├── ranking/                #   順位表HTML生成, 統計集計
│   │   ├── storage/                #   localStorage 永続化
│   │   ├── types/                  #   型定義 (match, season, config)
│   │   └── __tests__/              #   Vitest テスト
│   ├── vite.config.ts              #   ビルド → docs/ に出力
│   └── vitest.config.ts
├── src/                             # Python スクリプト (データ取得・変換)
│   ├── match_utils.py              #   共有ライブラリ (CSV I/O, season_map, 日付計算)
│   ├── set_config.py               #   設定管理 (YAML読み込み)
│   ├── read_jleague_matches.py     #   Jリーグスクレイピング (BS4)
│   ├── read_jfamatch.py            #   JFA JSON API データ取得
│   └── ...                         #   ACL, WEリーグ, 過去データ, cron生成等
├── config/                          #   YAML設定 (jleague.yaml, jfamatch.yaml等)
├── tests/                           #   pytest テストコード + test_data/
├── docs/                            # GitHub Pages 公開ディレクトリ
│   ├── j_points.html, assets/      #   ★ ビルド生成物 (gitignore対象)
│   ├── *_points.{html,js}          #   旧JS版ページ (ACL, W杯, 五輪等。未TS化)
│   ├── *.css                       #   スタイル (チームカラー定義含む)
│   ├── csv/                        #   処理済みCSV
│   └── json/                       #   season_map.json, aclgl_points.json
├── scripts/                         #   CI/CDスクリプト, season_map.jsonフォーマッタ
├── .github/workflows/               #   Pages デプロイ, CSV更新, テスト, ビルドチェック
└── pyproject.toml                   #   Python依存 (uv管理)
```

## 技術スタック

- **Python 3.12+**: BeautifulSoup4, requests, pandas, PyYAML / パッケージ管理: uv / テスト: pytest
- **TypeScript + Vite**: PapaParse (CSV), SortableTable (CDN) / パッケージ管理: npm / テスト: vitest (DOM: happy-dom) / Node.js 22
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
```

## デプロイモデル

- **GitHub Pages は GitHub Actions 経由** (`deploy-pages.yaml`): main push 時に TS ビルド → `docs/` を artifact としてアップロード → デプロイ
- **ビルド生成物 (`docs/j_points.html`, `docs/assets/`) は git 管理外** (`.gitignore` に記載)
- `docs/` 内の CSV, JSON, CSS, 旧JS ページ等はそのまま git 管理 (Python 側が直接更新)
- `check-build-artifacts.yaml` が PR 時にビルド生成物の誤コミットを検出

## CSV形式

`docs/csv/*.csv` のカラム:
`match_date, section_no, match_index_in_section, start_time, stadium, home_team, home_goal, away_goal, away_team, status`

- `status`: "試合終了" (完了) / "ＶＳ" (未実施)
- `home_goal`/`away_goal`: 空 = 未実施
- `group`: グループ名 (グループ分けがある場合のみ)
- `home_pk_score`/`away_pk_score`: PK得点 (省略可能。JFA JSONの命名に倣った)

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

### 階層別プロパティ

- **Group** (`jleague` 等): `display_name`, `css_files?`, `season_start_month?`
- **Competition** (`J1` 等): `league_display?`, `css_files?`, `point_system?`, `team_rename_map?`, `tiebreak_order?`, `season_start_month?`, `seasons`

### Season Entry (配列)

| Index | 内容 | 必須 | 例 |
| ----- | ---- | ---- | -- |
| 0 | チーム数 | 必須 | `10` |
| 1 | 昇格枠数 | 必須 | `1` |
| 2 | 降格枠数 | 必須 | `0` |
| 3 | チームリスト (前年度成績順 = 同順位時の優先順位) | 必須 | `["鹿島", "柏", ...]` |
| 4 | SeasonEntryOptions | 省略可 | `{"group_display": "EAST"}` |

### プロパティカスケード

`resolveSeasonInfo()` が Group → Competition → Season Entry の3階層をマージ。スカラ値は下位が上書き、配列 (`css_files`) は和集合、オブジェクト (`team_rename_map`) はマージ。

### SeasonEntryOptions の主要キー

- `group_display`: HTML上の表示グループ名。スクレイピング結果の `group` 列でCSVに振り分ける
- `url_category`: スクレイピングURL のカテゴリ部分を上書き (デフォルト: competition key の小文字化)
- `rank_properties`: 順位→CSSクラスのマッピング (例: `{"3": "promoted_playoff"}`)
- `season_start_month`: シーズン開始月。カスケード対象。コードデフォルト: `7` (秋春制)

### シーズン命名規則

- カテゴリ番号 (1, 2, 3) は不変。東西・グループはシーズン名の追番で区別
- シーズン名 = 年号 (`2026` or `26-27`) + 追番 (`East`/`West`/`A`/`B`/`EastA` 等)。追番なし = 全サブシーズン結合の仮想結果
- `get_season_from_date(season_start_month=N)`: `1` → `"YYYY"` (暦年)、それ以外 → `"YY-YY"` (跨年)
- CSVファイル名: `{シーズン名}_allmatch_result-J{カテゴリ}.csv`
- CSV検索正規表現: `r"(\d{4}[A-Za-z]*|\d{2}-\d{2}[A-Za-z]*)_allmatch_result-J(\d+).csv"`

## 開発プラクティス

- **リファクタリング時のビルド確認**: テスト (`vitest`) だけでなく `npm run build` も確認する。CI は typecheck + vitest のみでビルドは PR 時に自動検証されない
- **season_map.json 編集後**: `python scripts/format_season_map.py` でカスタム整形を実行

## 設計上の決定事項

- **JFA JSON APIはCSVカラム名の参考情報源** — 新カラム追加時はJFA JSON構造を参照
- **スクレイピング時のシーズン文字列は `config.season` (YAML) が正** — HTML読み取り値で上書きしない
- **`get_sub_seasons(category)` の戻り値で更新動作が決まる**: `None` → スキップ / `[]` → 単一シーズン更新 / `[...]` → マルチグループ振り分け
- **`match_utils.py` が共通ライブラリ** — CSV I/O, season_map 読み込み, 日付計算を提供。各 reader がインポートして使う
- **勝ち点システム**: `'standard'` (勝3/PK勝2/PK負1/分1/負0) と `'old-two-points'` (勝2/分1/負0)。Competition 階層の `point_system` で指定 (デフォルト: `'standard'`)
- **SeasonEntry バリデーション**: index 0〜3 の型不正は即エラー。index 4 の未知キーは Warning で無視
