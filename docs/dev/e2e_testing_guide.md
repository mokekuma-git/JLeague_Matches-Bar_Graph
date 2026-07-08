# E2E テストガイド

**作成日**: 2026-03-07
**最終更新**: 2026-07-01 (統合Viewer移行)
**目的**: Playwright E2E テストの構成・実行方法・拡張手順のリファレンス

---

## このガイドの役割

この文書は UI 変更時の E2E 正本とする。Issue の進め方は `issue_workflow.md`、実装分割と検証ゲートは `development_process.md`、文書配置は `document_hierarchy.md` を参照する。

---

## 構成概要

```text
frontend/
├── e2e/
│   ├── helpers/
│   │   ├── test-base.ts          # 拡張 test fixture (pageerror 自動検出)
│   │   └── invariants.ts         # View Invariants ヘルパー (I1/I2/I4)
│   ├── basic-render.spec.ts      # T1: 基本描画
│   ├── dropdown.spec.ts          # T2: プルダウン操作
│   ├── url-params.spec.ts        # T3: URL パラメータ
│   ├── date-slider.spec.ts       # T4: 日付スライダー
│   ├── rank-table.spec.ts        # T5: 順位表
│   ├── multi-group.spec.ts       # T6: マルチグループ
│   ├── special-seasons.spec.ts   # T7/T8: 特殊ポイントシステム + メタデータ表示
│   ├── bracket-render.spec.ts    # ブラケット描画・レイアウト
│   ├── bracket-tooltip.spec.ts   # ブラケットtooltip操作
│   ├── unified-viewer.spec.ts    # リーグ/ブラケットView切替・共有状態
│   └── full-render.spec.ts       # 全シーズン巡回 (@full-render)
└── playwright.config.ts
```

---

## テストベース

### test-base.ts

`@playwright/test` の `test` を拡張し、**ページエラー自動検出** fixture を追加。

```typescript
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(errors);
    expect(errors, 'Uncaught JavaScript errors detected').toEqual([]);
  }, { auto: true }],
});
```

- `auto: true` → 全テストで自動的に有効
- テスト完了時に未キャッチの JS エラーがあればテスト失敗
- **全 spec ファイルは `'./helpers/test-base'` から `test`, `expect` をインポートする** (`@playwright/test` から直接インポートしない)

### invariants.ts

CLAUDE.md で定義された **View Invariants** を検証するヘルパー関数群。

| 関数 | 検証内容 | 対応する不変条件 |
| ---- | -------- | ---------------- |
| `waitForRender(page)` | `#league_status_msg` の読み込み完了 + チーム列の出現を待機 | (前提) |
| `assertInvariants(page)` | I1 + I2 + I4 を一括実行 | — |
| `assertBarHeightEquality(page)` | 全チーム列と勝ち点列の高さが等しいか | I1 |
| `assertFutureBoxOrdering(page)` | `.future` ボックスが実施済みの間に混在しないか | I2 |
| `assertRankTableMatchesGraph(page)` | 順位表の上→下とグラフの左→右の順序が一致するか | I4 |

- I3 (チームカラー未定義警告) は invariants.ts に含まず、各 spec で `#warning_msg` の表示/非表示を直接アサート
- マルチグループ対応: `assertBarHeightEquality` と `assertRankTableMatchesGraph` は `.group_wrapper` の有無で自動分岐

---

## Playwright 設定

`frontend/playwright.config.ts` の要点:

| 設定 | 値 | 備考 |
| ---- | -- | ---- |
| `testDir` | `'./e2e'` | spec ファイルの探索ディレクトリ |
| `baseURL` | `http://localhost:4173` | Vite preview サーバー |
| `projects` | chromium, webkit | 2ブラウザでテスト |
| `webServer.command` | `npm run build && npx vite preview --port 4173` | テスト前に自動ビルド+起動 |
| `reuseExistingServer` | `!process.env.CI` | ローカルでは既存サーバーを再利用 |
| `retries` | CI: 1, ローカル: 0 | CI は1回リトライ |
| `workers` | CI: 1, ローカル: auto | CI はシリアル実行 |
| `reporter` | CI: `github` + `html`, ローカル: `list` | |

---

## テストファイル一覧

### T1: basic-render.spec.ts — 基本描画

統合ページ `matches.html` のデフォルト（League View）ロードを検証。

- グラフとランキングテーブルが描画されるか
- ステータスメッセージに行数が表示されるか
- 日付スライダーが初期化されるか
- タイムスタンプが表示されるか
- I3: チームカラー警告が出ないか

### T2: dropdown.spec.ts — プルダウン操作

大会・シーズン切り替え時の再描画を検証。

- 大会変更でシーズン選択肢が更新されるか
- シーズン変更でグラフが再描画されるか (チーム構成が変わる)
- ソートキー変更後も invariants が維持されるか

### T3: url-params.spec.ts — URL パラメータ

URL ↔ UI の双方向同期を検証。

- `?competition=J1&season=2024` でプルダウンが正しく初期化されるか
- プルダウン操作で URL パラメータが更新されるか
- 不正パラメータでエラーなくフォールバックするか

### T4: date-slider.spec.ts — 日付スライダー

時間軸操作による表示変化を検証。

- スライダー操作で target_date が変化するか
- up/down ボタンがスライダー値を ±1 するか
- 早い日付で `.future` ボックスが出現するか
- リセットボタンで最新日付に戻るか

### T5: rank-table.spec.ts — 順位表

順位表の構造・ソート・スタイルを検証。

- 必須ヘッダー列 (rank, name, all_game, point, win, loss) の存在
- ヘッダークリックでソート順が変わるか
- 昇格/降格行のスタイル (`.promoted`, `.relegated`) が存在するか
- PK 列: PK 対応シーズン (1995A) では表示、standard (2024) では非表示

### T6: multi-group.spec.ts — マルチグループ

グループ分けがある大会の描画を検証。

- WE Cup 25-26 で3グループ (A/B/C) が `.group_wrapper` + `.group_label` で描画されるか
- 各グループにチーム列が存在するか
- 単一グループシーズンでは `.group_wrapper` が存在しないか

### T7/T8: special-seasons.spec.ts — 特殊ポイントシステム + メタデータ

非 standard な `point_system` とメタデータ表示を検証。

**T7: ポイントシステム:**

- `victory-count` (1993A): ボックス高さが 75px (25px × 3 スケール)
- `standard` (2024): ボックス高さが 25px
- `graduated-win` (1997A): PK 列あり + invariants
- `pk-win2-loss1` (2026East): PK 列 (pk_win, pk_loss) あり + invariants

**T8: メタデータ表示:**

- `data_source` リンクの表示 (J1 → jleague.jp)
- 非 standard ポイントシステムの自動生成ルールノート (`/\d+点/`)
- 手動ノート (J3 2021 宮崎)
- standard + デフォルト tiebreak ではルールノートなし

### @full-render: full-render.spec.ts — 全シーズン巡回

`season_map.yaml` の全エントリをパラメタライズして巡回。

- 各 `competition/season` を URL パラメータで読み込み → `waitForRender` → `assertInvariants` → I3 チェック
- CSV データが存在しないシーズンは `test.skip()` でスキップ
- **CI のデフォルト実行には含まれない** (`--grep-invert @full-render`)
- 手動実行: `npx playwright test --grep @full-render`

### 統合Viewer・Bracket View

- 全specは `matches.html?competition=...&season=...` を開く
- League View固有controlは `#league_*`、Bracket View固有controlは `#bracket_*` を使う
- `unified-viewer.spec.ts` は、ページ遷移なしのView往復、`data-active`、URL同期、
  `scale` / `futureOpacity` / canonical `targetDate` の共有を検証する
- `bracket-render.spec.ts` はconnector、縦横layout、multi-sectionを検証する
- `bracket-tooltip.spec.ts` はpin/unpin、Escape、再描画時の解除を検証する

---

## 実行方法

### ローカル実行

```bash
cd frontend

# 全テスト (full-render 除外)
npx playwright test --grep-invert @full-render

# 全テスト (full-render 含む)
npx playwright test

# full-render のみ
npx playwright test --grep @full-render

# 特定ファイル
npx playwright test e2e/basic-render.spec.ts

# 特定ブラウザのみ
npx playwright test --project=chromium

# UI モード (デバッグ用)
npx playwright test --ui

# テストレポート表示
npx playwright show-report
```

### CI ワークフロー (test-e2e.yaml)

- **トリガー**: `push`/`pull_request` (main, feature/**) で `frontend/**` に変更があった場合 + `workflow_dispatch`
- **デフォルト実行**: `--grep-invert @full-render` (full-render 除外)
- **full-render**: `workflow_dispatch` で `full_render: true` を指定した場合のみ追加実行
- **ブラウザ**: chromium + webkit
- **レポート**: `playwright-report/` を artifact として 7日間保持

---

## View Invariants の定義

CLAUDE.md の不変条件との対応:

| 不変条件 | 内容 | E2E 検証方法 |
| -------- | ---- | ------------ |
| I1 | バーグラフ高さ一致 | `assertBarHeightEquality`: 全列の `getBoundingClientRect().height` を比較 |
| I2 | 未実施ボックスの順序 | `assertFutureBoxOrdering`: `.future.bg` の出現位置の遷移回数 ≤ 1 |
| I3 | チームカラー未定義の警告 | 各 spec で `#warning_msg` の可視性を直接アサート |
| I4 | 順位表とグラフの順序一致 | `assertRankTableMatchesGraph`: 列 ID とテーブル行のクラス名を比較 |

---

## テスト追加パターン

### 新シーズン・大会を追加した場合

1. `full-render.spec.ts` が `season_map.yaml` を動的に読むため、**追加作業なしで自動的にカバーされる**
2. ただし特殊な `point_system` や `group_display` がある場合は `special-seasons.spec.ts` や `multi-group.spec.ts` に個別テストを追加

### 新しい UI 機能を追加した場合

1. 既存の spec カテゴリ (T1〜T8) に該当するものがあればそこに追加
2. 新カテゴリが必要な場合は `e2e/xxx.spec.ts` を新規作成
3. **必ず以下を守る**:
   - `import { test, expect } from './helpers/test-base'` を使用 (pageerror 検出のため)
   - 描画後に `await assertInvariants(page)` を呼ぶ
   - `waitForRender(page)` でレンダリング完了を待ってからアサーション

---

## カバレッジ備考

### Bracket View

Bracket Viewは統合 `matches.html` 上でE2E対象になっている。

- connector・layout・multi-section・WC KO構造: `bracket-render.spec.ts`
- tooltip操作と日付変更時の解除: `bracket-tooltip.spec.ts`
- League Viewとの切替と共有viewer state: `unified-viewer.spec.ts`
- 全大会・全シーズンの網羅巡回はLeague View用 `full-render.spec.ts` と分け、
  大規模なBracketケースは `bracket-render.spec.ts` の `@full-render` testで扱う
