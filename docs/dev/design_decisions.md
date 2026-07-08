# 設計上の決定事項

**目的**: プロジェクト全体に関わる設計判断を一覧として記録する。個別大会・機能の詳細設計は他のガイド (`season_map_design.md`, `tournament_view_design.md` 等) を正本とする。

---

## データ取得・スクレイピング

- **JFA JSON APIはCSVカラム名の参考情報源** — 新カラム追加時はJFA JSON構造を参照
- **WC2026 スコアは openfootball が補完ソース** (`read_openfootball_wc.py`): allmatch CSV の生成 (日程・会場・TZ) は JFA リーダーが正本。`read_openfootball_wc.py` は openfootball/worldcup.json から `home_goal`/`away_goal`/`status` (+KO の延長/PK 列) のみを上書きし、JFA 反映遅延を埋める。照合は **GS=チーム名(EN→JP)+group / KO=openfootball `num`↔CSV `match_number`** (KO はプレースホルダ名に非依存)。EN→JP マッピングは `config/openfootball.yaml`。cron では JFA リーダーの**直後**に実行 (スケジュール生成→スコア上書きの順序)。openfootball スコア schema: `ft`(90分)/`et`(延長後・累積)/`p`(PK)。メインスコアは ET 込み、`home_score_ex`=`et`−`ft` の延長分のみ
- **スクレイピング時のシーズン文字列は `config.season` (YAML) が正** — HTML読み取り値で上書きしない
- **`get_sub_seasons(category)` の戻り値で更新動作が決まる**: `None` → スキップ / `[]` → 単一シーズン更新 / `[...]` → マルチグループ振り分け
- **`match_utils.py` が共通ライブラリ** — CSV I/O, season_map 読み込み, 日付計算を提供。各 reader がインポートして使う

## 勝ち点システム

- **勝ち点システム**: Competition/Season 階層の `point_system` で指定 (デフォルト: `'standard'`)。有効値は Python `POINT_SYSTEM_VALUES` と TS `POINT_MAPS` で管理し、`check_type_sync.py` で同期検証。非 standard 時は `rule-notes.ts` がルール説明を自動生成して note 欄に表示
  - `'standard'` (2003–): 勝3/分1/負0
  - `'victory-count'` (1993–94): 勝1/他0 (`POINT_HEIGHT_SCALE=3` でボックス高さ3倍)
  - `'win3all-pkloss1'` (1995–96): 全勝3/PK負1/負0
  - `'graduated-win'` (1997–98): 90分勝3/延長勝2/PK勝1/負0
  - `'ex-win-2'` (1999–2002): 90分勝3/延長勝2/分1/負0
  - `'pk-win2-loss1'` (2026特別大会): 勝3/PK勝2/PK負1/負0
- **ルール説明ノート自動生成** (`config/rule-notes.ts`): `pointSystem` が `'standard'` 以外、または `tiebreakOrder` がデフォルト (`['goal_diff', 'goal_get']`) と異なる場合、`resolveSeasonInfo()` が note 配列末尾にルール説明を自動追加。メッセージは辞書オブジェクトで管理し、将来の多言語化に備える (locale 引数 + `Record<Locale, ...>` への拡張で対応可能)

## season_map.yaml / Tournament 設定

- **SeasonEntry バリデーション**: 必須キー (`team_count`, `promotion_count`, `relegation_count`, `teams`) の欠落・型不正は即エラー。未知のオプショナルキーは Warning で無視
- **Tournament 設定の正本は `bracket_blocks`** (#287): 1 ブロック season でも `bracket_blocks` で書く。エントリレベル `bracket_order` は廃止。tournament の `teams` は派生値 (block の `bracket_order` から bye `~` を除去) で season_map に書かない (書くと Warning)。包括ツリー (単一ツリー表示) の主 block は「非 matchup block が単独ならそれ、複数なら `inclusive_tree: true` の block」で解決し、主 block がなければ multi-section 表示のみ (J1PO/J2J3PO 等)。authored 構造を持たない大会 (EmperorsCup) は CSV から全推定
- 詳細な設計規則・カスケード規則は [season_map_design.md](./season_map_design.md) を正本とする

## スコア表示 (League View / Tournament View 共通)

- **スコアアノテーション規則**: メインスコア (`homeGoal`/`awayGoal`) は常に ET 込みの最終結果。`formatScore` が `(PKn)` / `(ETn)` アノテーションを付加。PK がある場合は PK のみ表示 (ET 後も同点なので ET スコアに情報価値なし)。単試合・H&A aggregate 共通ロジック
  - **単試合**: CSV の `home_pk_score`/`away_pk_score`/`home_score_ex`/`away_score_ex` をそのままマッピング
  - **H&A aggregate**: PK → 決定 leg (最終 played leg) の PK スコアを upper/lower にマッピング。ET → 全 leg の ET スコアを upper/lower で合算。合計スコアには ET が含まれるため、ET アノテーションは「合計のうち延長分がいくら」を示す
- **ツールチップ表示規則**: ボックス内スコアは `ET`/`PK` プレフィックスで種別を明示 (`3-2 (ET1-0)`, `1-1 (PK5-3)`)。PKまで行った場合のET情報は省略 (ET後も同点のためスコアに情報価値なし)。チーム名ツールチップの成績は勝/分/敗を1行、延長勝負・PK勝負を各1行で表示

## 描画の不変条件 (View Invariants)

以下はどの大会・日程・Preference でも必ず維持する。違反時はできる限り原因を調査し、適切な表示ができないことをユーザーに伝える。

- **(I1) バーグラフ高さ一致**: 全チーム列と勝ち点列の高さが等しい (スペースボックスで差を埋める)
- **(I2) 未実施ボックスの順序**: `.future` ボックスが実施済みボックスの間に混在しない
- **(I3) チームカラー未定義の警告**: CSS 未定義のチームがあっても描画は継続するが、ユーザーに警告を表示する (描画ブロッカーではない)
- **(I4) 順位表とバーグラフの順序一致**: 描画直後のデフォルト状態で、順位表のチーム順とバーグラフの左→右の並びが一致する (ユーザーが順位表ヘッダーをクリックしてソートした場合はこの限りではない)

## テスト

- **進行中大会の生CSV/season_map.yamlを直接読むテストは書かない** — WC2026 KO等、CSV自動更新cronが継続的に結果追加・プレースホルダー解決を行う対象は、`match_number` 等のリテラル値をハードコードしたテストが定期的に壊れる (Issue #279)。フィクスチャとして `frontend/src/__tests__/fixtures/` 配下にスナップショットを固定コピーし、そこから読み込む。完了済み大会 (例: EmperorsCup過去シーズン) は cron 対象外なので生CSVを直接読んでよい

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
