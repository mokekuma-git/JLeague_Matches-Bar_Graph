# CSV 形式リファレンス

**目的**: `docs/csv/*.csv` のカラム仕様を定義する。試合データ取得スクリプト (`src/read_*.py`) の出力形式であり、フロントエンド (`frontend/src/core/`) の入力形式でもある。

---

## カラム一覧

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
- `timezone`: `start_time` のソースTZ (IANA名。省略可能)。複数TZにまたがる CSV (WC2026 GS等) で per-row 指定。解決順序: 行 `timezone` → season_map `timezone` → 無変換 (現地時刻のまま)。`start_time` は現地 wall-clock のまま据え置き
- その他付加情報 [`broadcast`, `attendance`]

## 関連文書

- `season_map.yaml` 側の `timezone` カスケードは [season_map_design.md §4.5](./season_map_design.md#45-表示タイムゾーン-timezone-の使い方) を参照
- Python ↔ TypeScript の型同期は [design_decisions.md](./design_decisions.md#python--typescript-型同期) を参照
