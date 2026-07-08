# ADR: JLeagueCup `season_map.yaml` Design Intent

**作成日**: 2026-03-14
**状態**: Active

---

## 1. スコープと正本の分離

この ADR は、JLeagueCup の公式情報を `season_map.yaml` と Tournament View 設計へどう変換したかの判断を記録する。

- **事実の正本**: プロジェクトの GitHub Wiki — 制度変遷、正式名称、stage 名、出典
- **設計の正本**: この ADR — 事実から metadata への変換基準

同じ内容を二重管理しない。Wiki には制度史と出典を、この ADR には採用判断だけを置く。

---

## 2. 基本原則: metadata は描画と判定に必要な差分に限定する

JLeagueCup 1992-2025 の調査で、tournament chart による KO 並び順、catalog による大会名・stage 名、年度ごとの H&A 方式差分、特殊年度の構造など多くの事実が得られた。しかし全てを `season_map.yaml` に写すと、設定ファイルの責務が崩れる。

**採用基準**:

- View の並びや切り替えに必要 → metadata 化する
- 勝者判定を公式と一致させるために必要 → metadata 化する
- 上記以外 (Wiki を読めば十分で描画・判定に影響しない) → metadata 化しない

この基準で `season_map.yaml` に持たせるもの:

- `bracket_blocks`, `bracket_order`, `bracket_round_start`, `round_start_options`
- `shown_groups`, `group_team_count`
- `aggregate_tiebreak_order`
- `note`

**metadata 化を見送った具体例**:

| 候補 | 判断 | 理由 |
| --- | --- | --- |
| `away_goal_rule: boolean` | 不採用 → `aggregate_tiebreak_order` 配列に統合 | AGR 有無だけでなく 2024-2025 の勝利数優先など複数パターンがあり、boolean では表現しきれない。順序配列なら 1 つの軸で全差分を扱える |
| H&A ラウンド名マッピング (第1戦/第2戦/1st Leg 等) | 不採用 → コードで正規化 | 年度ごとの表記揺れは `normalizeBracketRoundLabel()` で吸収できる。season_map にマッピング表を持つと年度追加のたびに設定が膨張する |
| ACL 免除チーム一覧 (2003, 2005-2010) | 不採用 → `note` に概要のみ | 描画・判定に影響しない付加情報。CSV のチーム構成から事実は読み取れる |
| Bye 構造の詳細 (1999, 2000-2001) | 不採用 → `bracket_order` 内の `null` で表現 | 専用キーを設けなくても既存の配列表現で十分 |
| catalog の全 section 名一覧 | 不採用 → Wiki に残す | 描画に必要な stage 名は `round_filter` 等で個別指定済み。全量リストは参照用であり設定ファイルの責務外 |

---

## 3. 具体的な設計意図

### 3.1 KO 並び順の正本は tournament chart

`bracket_order` / `bracket_blocks` は CSV の並びではなく `data.j-league.or.jp` tournament chart を正本として再現させるためのもの

- CSV の 試合記載順序 はスクレイピング取得順やデータソースの記載順であり、公式トーナメント図の上段 (upper) / 下段 (lower) とは一致しない。`bracket_order` で正しい位置を指定しないと、描画時の `needsSwap` 判定が狂い、対戦カードの H&A 並びやスコアが反転する
- 2007 のように準々決勝と準決勝で山の組み合わせが変わる年度や、2024-2025 のように独立した複数グループ (各グループ固有の bracket_order) を持つ年度では、CSV の登場順だけではトーナメントの山の順序を再現できず、公式を見慣れた利用者を迷わせる

### 3.2 stage 名の正本は catalog

大会名や stage 名は `SFRT01/competitionSection` catalog を優先する。

- 公式図は視覚レイアウトに強いが、名称の表記ゆれ整理には不向き
- 将来 GS View を足すとき、catalog に揃えた方が round / stage 名の照合を再利用しやすい

### 3.3 H&A 判定差分は `aggregate_tiebreak_order` で持つ

年度により AGR なし / AGR あり / 勝利数優先 (2024-2025) / 例外年 (2015) など差分があるが、boolean ではなく順序配列で表現する。

- 年度差分を 1 つの軸で表現できる
- 他大会の aggregate 判定へ拡張しやすい
- 「適用する判定順」は単一フラグより仕様と実装が対応しやすい

### 3.4 mixed season は 1 competition 内で View を分ける

GS と KO を併せ持つ年度は、competition を分裂させず 1 season entry 内で league/bracket を切り替える。

- competition 分裂を抑えられる
- 公式名称の連続性を保てる
- GS 対応時も metadata 拡張で吸収しやすい

### 3.5 特殊年度は section で吸収する

2007, 2020, 2024, 2025 のような特殊構造は、汎用 tree builder を壊さず `bracket_blocks` と `round_filter` で表現する。

- 汎用性を考慮し、年度固有の分岐ロジックを renderer/builder に埋め込まない
- `season_map` 上の差分として閉じ込めた方が年ごとの変化にも対応が容易

---

## 4. 今後の利用と移管

### この ADR を参照する場面

- JLeagueCup GS View 追加時
- 勝敗判定、試合間bracket構造構築などのロジック見直し時
- `season_map.yaml` を再設計するとき
- 他大会で「公式調査 → metadata 設計」への変換規則が必要になったとき

新しい年度差分を足すときは、まず Wiki 側で事実を確認し、セクション 2 の採用基準で「metadata にするか」「実装デフォルトで吸収するか」を判断する。均等な `group_team_count` は shorthand を使い、共通の count 系は Competition 階層へ引き上げる。

### 移管方針

`docs/dev/` に置く (2026-07-08、公開向け設計資料として移管済み)。
