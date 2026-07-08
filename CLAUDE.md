# JLeague_Matches-Bar_Graph

Jリーグ・各種サッカー大会の試合結果を勝ち点積み上げグラフなどで可視化するWebアプリケーション。
GitHub Pages で公開: <https://mokekuma-git.github.io/JLeague_Matches-Bar_Graph/>

チーム固有カラーの積み上げバーグラフで勝ち点推移を一望でき、日時スライダーで任意時点の順位を再現する。

## ドキュメント構成

このファイルは横断的な大方針と日常的に必要な最小限の情報だけを持つ。詳細は次のいずれかが正本。

- **`docs/dev/`**: CSV形式、season_map設計、Tournament View設計、E2Eガイド、設計決定事項一覧など、公開するソフトウェア仕様
- **ディレクトリ構造・デプロイモデル**: [docs/dev/architecture.md](docs/dev/architecture.md)
- **CSVカラム仕様**: [docs/dev/csv_format.md](docs/dev/csv_format.md)
- **season_map.yaml 設計**: [docs/dev/season_map_design.md](docs/dev/season_map_design.md) (JLeagueCup固有判断は [adr_jleaguecup_season_map_design.md](docs/dev/adr_jleaguecup_season_map_design.md))
- **Tournament View 設計**: [docs/dev/tournament_view_design.md](docs/dev/tournament_view_design.md)
- **E2Eテストガイド**: [docs/dev/e2e_testing_guide.md](docs/dev/e2e_testing_guide.md)
- **プロジェクト全体の設計決定事項一覧**: [docs/dev/design_decisions.md](docs/dev/design_decisions.md) (勝ち点システム、View不変条件、Python↔TS型同期など)

新しいドキュメントを書く際、公開してよいか (`docs/dev/`) 迷ったら、ユーザーに相談する。

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
uv run python src/read_openfootball_wc.py        # WC2026 スコア補完 (--dry-run/--source 可)

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

## 開発プラクティス

- **リファクタリング時のビルド確認**: テスト (`vitest`) だけでなく `npm run build` も確認する。CI は typecheck + vitest のみでビルドは PR 時に自動検証されない
- **season_map.yaml**: YAML 形式のためカスタムフォーマッタ不要。直接編集可能
- **バージョニング**: semver (`vMAJOR.MINOR.PATCH`) を v1.0.0 以降で使用。v1.0.0 より前のタグは日付式 `vYYMM.N` 形式 (例: `v2602.2`)。タグは注釈付き+署名必須 (`git tag -s`、軽量タグ不可)。最新 semver タグは `git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+' | head -1` で確認 (lexical sort では日付式タグが後ろに来るため注意)

## Python ↔ TypeScript 型同期

Python と TypeScript で共有する型定義 (CSVカラム、SeasonEntryオプション、PointSystem値) のドリフトを CI (`scripts/check_type_sync.py`) で検出する。対応表・運用ルールは [docs/dev/design_decisions.md](docs/dev/design_decisions.md#python--typescript-型同期) を参照。

```bash
uv run python scripts/check_type_sync.py
```
