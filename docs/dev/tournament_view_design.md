# Tournament View 設計ガイド

**作成日**: 2026-03-15
**目的**: Tournament View の設計意図、データ構造、拡張方針を明文化する

---

## 1. スコープ

本書は `frontend/src/tournament-app.ts` と `frontend/src/bracket/` を対象に、次を定義する。

- 画面の責務分離
- `season_map.yaml` metadata の使い方
- KO ツリー生成・日付マスク・描画の流れ
- v1.2.1 で追加した拡張要素の役割

本書は設計意図に集中し、関数レベルの詳細 API はコード (`frontend/src/bracket/` 各モジュール) を正とする。

---

## 2. 設計原則

1. 年度差分はコード分岐ではなく metadata 差分で吸収する
2. データ構築 (`bracket-data.ts`) と描画 (`bracket-renderer.ts`) を分離する
3. UI 制御 (`tournament-app.ts`) は状態管理とパイプライン接続に集中する
4. 同一ロジックを block ごとに複製しない (共通 build → mask → render 経路)
5. H&A 判定は `aggregate_tiebreak_order` を唯一の入力として解決する

---

## 3. 主要モジュールの責務

| モジュール | 責務 |
| --- | --- |
| `tournament-app.ts` | 入力選択、状態管理、CSV 読込、各処理のオーケストレーション |
| `bracket-data.ts` | CSV 行から `BracketNode` ツリーを構築し、勝者判定・日付マスクを行う |
| `bracket-renderer.ts` | `BracketNode` を DOM + SVG へ描画し、ツールチップとレイアウト補正を担当 |
| `round-filter-inference.ts` | `bracket_order` と CSV 時系列から `round_filter` を自動推定 |
| `round-label.ts` | round 名の正規化 |
| `types/season.ts` | `bracket_blocks` など metadata の型定義 |
| `types/bracket-types.ts` | 描画・判定に使う中間表現 (`BracketNode`, `DecidedBy`) の定義 |

---

## 4. データフロー

```text
season_map 読込
  → Competition/Season 選択
  → CSV 読込
  → KO 対象行抽出 (block/round_filter 反映)
  → buildBracket() で full tree 構築
  → round 候補計算 (round_start 用)
  → targetDate に応じて maskBracketForDate()
  → renderBracket() + adjustBracketPositions() + drawBracketConnectors()
```

`controlState` は次を保持する。

- `layout`
- `scale`
- `futureOpacity`
- `selectedDate`
- `roundStart`

状態は `localStorage` に保存し、再訪時に復元する。

描画時の分岐は次の 2 系統として読む。

- multi 表示: `bracket_blocks` を block ごとに独立描画する
- 包括表示: 1 つのブラケットツリーとして描画し、`roundStart` に応じて表示開始位置だけを調整する

---

## 5. metadata の役割 (v1.2.1 の拡張)

### 5.1 `bracket_blocks`

Tournament 構造の**正本** (#287)。1 ブロック season でも必ずこれで書く。

- 各 block は `label` (必須) と `bracket_order` を持つ
- 必要なら `round_filter` で対象試合を限定する
- `matchup_pairs: true` の場合は elimination tree ではなく対戦カード単位で描画する
- `inclusive_tree: true` は包括ツリーの主 block を指すマーカー
  (非 matchup block が複数あるときのみ必要)
- authored 構造を持たない season (EmperorsCup) は `bracket_blocks` ごと省略し、
  CSV (`match_number` 参照) から全構造を推定する

### 5.2 `bracket_order` (block 内)

block のブラケット上の初期配置 (上から下) を定義する。

- CSV の並び順ではなく、表示上の位置順を明示する
- `null` (`~`) は bye slot を表す
- エントリレベル `bracket_order` と `teams` によるトーナメント順指定は廃止済み
  (#287)。`teams` は tournament では派生値 (block 順から bye 除去)
- シーズン全体の包括ツリー順の解決 (`resolveMainBlockOrder`):
  非 matchup block が 1 つならその `bracket_order`、複数なら
  `inclusive_tree: true` の block、どちらもなければ CSV 推定 →
  それも無ければ multi-section 表示のみ

### 5.3 `round_filter`

CSV から block ごとの対象行を選ぶフィルタ。

- raw round 名または正規化 round 名で一致判定する
- block 間の重複行はキー合成で排除する
- **省略可**: 未指定時は `bracket_order` のチーム集合と CSV 時系列から自動推定する (`inferRoundFilter`)
  - 通常 block: `bracket_order` の全チームが出場する候補試合を抽出し、時系列の末尾 K ラウンド (K = ceil(log2(チーム数))) 以降を返す
  - `matchup_pairs` block: 候補試合数が最多のラウンドを選択する
- フォールバック順: 明示 `round_filter` > `default_round_filter` > 自動推定 > 全行

### 5.4 `round_start_options` / `bracket_round_start`

round 起点切替 UI の制御。

- `round_start_options`: プルダウン候補を明示
- `bracket_round_start`: 初期選択の既定値
- 包括表示では `roundStart` に応じて実効 `bracket_order` を再計算する
- `MULTI_SECTION_VALUE` 選択時は包括表示をやめ、block ごとの独立描画へ切り替える
- 未指定時は構築ツリーから候補を生成する
- **`round_start_options: [__multi_section__]`**(multi-section 専用)= 包括ツリーを持たない大会
  (例: 独立ペアのみで単一の2冪ツリーを成さない `matchup_pairs` 主体の大会)。この場合 `activate()` は
  inclusive `fullRoot` の `buildBracket` をスキップしてプレースホルダを使う (各 block を個別構築するため fullRoot 不要)。
  スキップしないと非2冪順序で `buildNode` が undefined ノードを参照してクラッシュする (Issue #246 で追加)
- #287 以降は主 block が解決できない season (matchup のみ / 複数 tree block で
  `inclusive_tree` 未指定) も自動的に multi-section 専用として扱う。
  `round_start_options: [__multi_section__]` はプルダウン表示の制御として引き続き有効

---

## 6. 勝者判定モデル

`buildBracket()` は対戦カードごとに `BracketNode` を作る。

- 1試合なら `nodeFromMatch`
- 複数 leg なら `nodeFromAggregate`

`DecidedBy` で判定種別を保持し、表示と説明に使う。

- 単試合: `score` / `extra_time` / `penalties`
- H&A: `aggregate_score` / `aggregate_wins` / `aggregate_away_goals` / `aggregate_extra_time` / `aggregate_penalties`
- 未確定: `pending`

H&A 判定の入力順は `aggregate_tiebreak_order` を尊重する。

---

## 7. 日付スライダーと未来マスク

`maskBracketForDate()` は targetDate より未来の試合情報を非表示化する。

- スコア・勝者はマスク
- 日付・会場は保持
- 子ノードが未確定になった場合、親の対戦カードも `TBD` へ伝播
- H&A は leg 日付を使って部分マスクを適用

UI 側は `futureOpacity` で未来カードの視認性を調整する。

---

## 8. 拡張時のルール

### 8.1 metadata 追加の判断

追加条件:

- 描画構造または勝者判定が変わる
- 複数 season で再利用できる
- 既存 key の組み合わせで表現できない

非追加条件:

- 単年の表示文言だけの都合
- 実装メモや調査ログ

### 8.2 変更時の必須確認

- `frontend/src/types/season.ts` の型更新
- `src/match_utils.py` の `KNOWN_OPTION_KEYS` 更新
- Tournament View が metadata で吸収できているか (年度分岐を増やしていないか)
- `cd frontend && npm run typecheck`
- `cd frontend && npm test`
- `cd frontend && npm run build`

---

## 9. よくある改修パターン

- block 追加: `bracket_blocks` に定義追加 (`round_filter` は通常自動推定されるため、推定が合わない場合のみ明示)
- KO 起点変更: `round_start_options` と `bracket_round_start` を調整
- H&A 判定変更: `aggregate_tiebreak_order` を season 単位で指定
- 並び順修正: `bracket_order` / `bracket_pairing_orders` を優先して修正する

原則として、まず metadata 側で解決を試み、最後の手段としてコード変更を行う。metadata 記法上は Competition 既定値と shorthand を優先し、同じ意味の冗長記述を season ごとに繰り返さない。
