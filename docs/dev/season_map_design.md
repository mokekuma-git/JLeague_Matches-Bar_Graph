# `season_map.yaml` 設計ガイド

**作成日**: 2026-03-15
**目的**: `season_map.yaml` を安全に拡張・更新するために、責務、設計規則、編集手順を内部向けに明文化する

---

## 1. このドキュメントの役割

この文書は「`season_map.yaml` をどう設計・編集するか」の正本とする。

- 公式情報や制度史そのものはプロジェクトの GitHub Wiki を正本とする
- JLeagueCup 固有の設計判断は [adr_jleaguecup_season_map_design.md](./adr_jleaguecup_season_map_design.md) を参照する
- 本書は大会横断で使う実装ルールと編集指針を扱う

---

## 2. `season_map.yaml` の責務

`season_map.yaml` は「描画・集計・データ解決に必要な最小 metadata」を持つ。

持たせるもの:

- Competition / Season の選択と表示に必要な情報
- 勝ち点・タイブレーク・昇降格ラベルなど、表示結果に影響する情報
- Tournament View の構成情報 (`bracket_blocks` を正本とする)

持たせないもの:

- 制度史の長文説明
- 一次資料の全文引用
- 調査ログや作業メモ

原則は「表示や判定に影響する差分だけを metadata 化する」。

---

## 3. データモデル

`season_map.yaml` は 4 階層構造を採る。

- CompetitionFamily
- Competition
- Season key
- Season entry object

Season entry object の count / team 系フィールドは、次の規則で解決される。

| フィールド | 意味 | 必須 |
| --- | --- | --- |
| `team_count` | チーム数 | Competition または Season のどちらかに必須 |
| `promotion_count` | 昇格・進出ライン数 | League view では Competition または Season のどちらかに必須 |
| `relegation_count` | 降格ライン数 | League view では Competition または Season のどちらかに必須 |
| `teams` | チーム一覧 | League view 用。Tournament season では書かない (派生値。書くと警告) |

`src/match_utils.py` の `SeasonEntry` が Python 側の入力検証を担当し、次の不変条件を持つ。

- count 系 3 項目は Season にあればそれを優先し、なければ Competition 既定値を使う
- `team_count` は `teams.length` や bracket 復元結果から補完できる
- bracket competition では `promotion_count` / `relegation_count` を省略時に `0` 扱いできる
- `teams` はあれば `list`
- `group_team_count` は `int` または `dict[str, int]`
- 未知 option key は警告ログ (エラーではない)
- `bracket_blocks` は list of dict で各 block に `label` (str) 必須。未知 block key・
  `inclusive_tree` の重複/矛盾は警告。bracket 専用 season での `teams` 明記も警告

---

## 4. カスケード規則 (実装準拠)

フロントエンドでは `frontend/src/config/season-map.ts` の `resolveSeasonInfo()` が CompetitionFamily → Competition → SeasonEntry の順で解決する。

### 4.1 スカラ値

下位が優先される。

- `team_count`
- `promotion_count`
- `relegation_count`
- `league_display`
- `point_system`
- `tiebreak_order`
- `aggregate_tiebreak_order`
- `season_start_month`
- `shown_groups`
- `cross_group_standing`
- `data_source`
- `promotion_label`
- `timezone`

### 4.2 配列

- `css_files`: 3階層を順序維持で重複除去して結合
- `note`: 3階層を連結し、さらに `generateRuleNotes()` の自動注記を末尾追加
- `view_type`: 3階層を重複除去で結合 (未指定時は `['league']`)

### 4.3 オブジェクト

- `group_team_count`: Competition + Entry をマージ (Entry 優先)。入力は `dict` に加えて scalar shorthand も許容し、`shown_groups` で dict に展開してから解決する
- `team_rename_map`: Competition + Entry をマージ (Entry 優先)

注: 現行実装では `team_rename_map` に Group レベルを適用しない。

---

## 4.5 表示タイムゾーン (`timezone`) の使い方

試合開始時刻はソースTZ付きで内部 UTC 化し、表示先TZ (既定=ブラウザ標準ロケール、UI セレクタ優先) に変換して描画する。ソースTZの解決順序は **CSV 行 `timezone` 列 → season_map `timezone` (カスケード・スカラ) → 無変換 (現地 wall-clock のまま)**。`start_time` 自体は現地時刻のまま据え置く (後方互換)。節グルーピング・日時スライダーは現地 `match_date` 基準で固定し、変換対象は「表示する開始時刻」と「ツールチップ上の日時ラベル」のみ。

設定者が変換を有効化する方法は2通り。**コード変更は不要**。

### ケースA: 大会全体が単一TZ

season_map.yaml の任意の階層 (Family / Competition / Season) に `timezone:` を IANA 名で1行足すだけ。カスケード・スカラなので下位に効く。

```yaml
jleague:
  competitions:
    J1:
      timezone: Asia/Tokyo
```

CSV は変更不要。

### ケースB: 1大会が複数TZにまたがる (例: WC2026)

会場ごとにTZが異なるため、CSV の per-row `timezone` 列 (IANA 名) を埋める。WC2026 では `read_jfamatch.py` の会場→IANA マップ (`config/jfamatch.yaml` の `venue_timezone` + 各大会 `use_venue_timezone: true`) が自動付与する。新規の複数TZ大会を足す場合は、その CSV を生成するリーダーに同様の会場→IANA 変換を組み込む (= ここだけ実装/マップ追加が必要)。

### UI の挙動

- 表示TZ セレクタ (`#display_timezone`) は、現在のシーズンがソースTZを持つ場合 (CSV 行 `timezone` 列がある or season_map `timezone` が解決される) のみ表示し、それ以外は自動的に隠す。
- 既定の表示先TZ = ブラウザ標準ロケール。日本のブラウザなら WC2026 は既定で JST 表示になる (セレクタ未操作でも変換済み)。
- 選択値は viewer prefs (`displayTimezone`) に永続化。

### 注意

- ケースA で「現地TZ = 表示TZ」になる利用者には見た目が変わらない。意味が出るのは「現地TZ ≠ 表示TZ」のとき。
- WC2022 の単一会場は従来の `timezone_diff` 方式を温存しており、本機構 (`timezone` 列 / season_map `timezone`) の対象外。

---

## 5. Tournament View 用 metadata の設計原則

Tournament View 向け key は `options` に集約する。

**Tournament 構造の正本は常に `bracket_blocks`** (#287、設計候補比較の
Candidate C を採用)。1 ブロック season でも `bracket_blocks` で書き、
エントリレベル `bracket_order` は廃止済み (書くと未知キー警告)。
`teams` は tournament では派生値であり season_map に書かない
(書くと警告。block の `bracket_order` から bye `~` を除いて導出できる)。

主要 key:

- `bracket_blocks` — 構造の正本。各 block は `label` (必須) と `bracket_order` を持つ
- `bracket_blocks[].inclusive_tree` — 包括ツリー (single-tree 表示) の主 block を指す
  マーカー。非 matchup block が複数あるときのみ必要 (単独なら暗黙的に主 block)
- `bracket_round_start` (エントリレベル) — 包括表示の開始ラウンド UI 既定
- `round_start_options`
- `bracket_pairing_orders`
- `aggregate_tiebreak_order`

設計指針:

- 並び順や表示分割は `bracket_blocks` で表現する
- 勝者判定差分は `aggregate_tiebreak_order` の順序で表現する
- 年度固有の例外を renderer の分岐に入れず、可能な限り metadata 差分で吸収する

包括ツリー (シーズン全体順) の解決規則:

- `matchup_pairs: true` の block はツリーを構成しないため主 block になれない
- 非 matchup block が 1 つだけならそれが暗黙的に主 block
- 複数あるときは `inclusive_tree: true` の block が主 block
  (例: WC2026 決勝トーナメント、JLeagueCup 2011/2024/2025 の終端 block)
- 主 block が定まらない season は multi-section 表示のみ
  (例: J1PO / J2J3PO / JLeagueCup 2007)

### 5.1 省略してよい metadata

- `team_count`
  - bracket season では CSV / bracket 復元結果のチーム数を使うため省略可
- `promotion_count` / `relegation_count`
  - bracket competition では未指定時に `0` 扱いできるため、基本的に書かない
  - league / group-stage competition では順位表示に影響するため明示する
- `bracket_blocks` 全体
  - EmperorsCup のように `match_number` から構造と参加チーム順を CSV から
    完全復元できる season では、authored 構造そのものを省略できる
- `bracket_blocks[].round_filter`
  - 通常は `bracket_order` と CSV 時系列から自動推定される

### 5.2 明示が必要な metadata

- `bracket_blocks[].bracket_order`
  - authored 構造を持つ全 block で明示する (公式トーナメント図で検証した順序。
    bye は `~` で表す)
- `bracket_blocks[].inclusive_tree`
  - 非 matchup block が複数ある season の主 block
- `bracket_round_start`
  - 実装既定値より season ごとの明示の方が安全な場合

---

## 6. 編集手順 (内部運用)

1. 変更対象 season の事実を確認する
2. 「描画・判定に影響するか」で metadata 追加要否を判定する
3. `docs/yaml/season_map.yaml` を更新する
4. 共通値は Competition 既定値へ引き上げられないかを確認する
5. `group_team_count` が全 group で同値なら scalar shorthand (`group_team_count: 4`) を優先する
6. 型同期チェックを実行する
   - `uv run python scripts/check_type_sync.py`
   - `uv run python scripts/check_point_system_csv.py`
7. フロントエンド検証を実行する
   - `cd frontend && npm run typecheck`
   - `cd frontend && npx vitest run`
   - `cd frontend && npm run build`

---

## 7. 新規 option key を追加する基準

追加してよい条件:

- 複数 season / 複数大会で再利用可能
- 描画または勝者判定に直接影響する
- 既存 key の組み合わせでは表現できない

追加を避ける条件:

- 1回限りの調査メモや表示文言の都合だけ
- コード側の例外分岐で十分吸収できる
- Wiki 側の説明で完結する内容

追加時は必ず以下を同時更新する。

- `src/match_utils.py` の `SeasonEntry.KNOWN_OPTION_KEYS`
- `frontend/src/types/season.ts` の `SeasonEntryOptions`
- 必要に応じて `resolveSeasonInfo()` / Tournament View 側ロジック

---

## 8. レビュー観点

- metadata が「事実」ではなく「表示・判定に必要な差分」へ正規化されているか
- CompetitionFamily/Competition/Entry のどこに置くべき値かが妥当か
- カスケード結果が期待どおりになるか
- 新規 key 追加時に Python ↔ TypeScript の同期が保たれているか
- 特殊年度対応が実装分岐ではなく metadata 側に閉じているか
- shorthand (`group_team_count: 4`) が使える箇所で冗長な dict を残していないか
