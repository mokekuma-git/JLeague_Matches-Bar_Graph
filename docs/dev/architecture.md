# アーキテクチャ概要

**目的**: リポジトリのディレクトリ構造とデプロイモデルのリファレンス。

---

## ディレクトリ構造

```text
JLeague_Matches-Bar_Graph/
├── frontend/                        # TypeScript フロントエンド (Vite)
│   ├── src/
│   │   ├── matches-app.ts          #   統合Viewエントリポイント
│   │   ├── matches.html            #   HTMLテンプレート (Vite input)
│   │   ├── league-view.ts          #   リーグView lifecycle
│   │   ├── bracket-view.ts         #   トーナメントView lifecycle
│   │   ├── config/season-map.ts    #   season_map.yaml 読み込み・ユーティリティ
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
│   ├── read_openfootball_wc.py     #   WC2026 日次スコア補完 (openfootball/worldcup.json)
│   └── ...                         #   ACL, WEリーグ, cron生成等
├── config/                          #   YAML設定 (jleague.yaml, jfamatch.yaml, openfootball.yaml等)
├── tests/                           #   pytest テストコード + test_data/
├── docs/                            # GitHub Pages 公開ディレクトリ
│   ├── matches.html, assets/       #   ★ ビルド生成物 (gitignore対象)
│   ├── *.css                       #   スタイル (チームカラー定義含む)
│   ├── csv/                        #   処理済みCSV
│   ├── yaml/                       #   season_map.yaml
│   └── dev/                        #   このディレクトリ (公開開発者向け設計文書)
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

## デプロイモデル

- **GitHub Pages は GitHub Actions 経由** (`deploy-pages.yaml`): main push 時に TS ビルド → `docs/` を artifact としてアップロード → デプロイ
- **ビルド生成物 (`docs/matches.html`, `docs/assets/`) は git 管理外** (`.gitignore` に記載)
- `docs/` 内の CSV, YAML, CSS, `docs/dev/` の設計文書はそのまま git 管理 (直接更新)
- `check-build-artifacts.yaml` が PR 時にビルド生成物の誤コミットを検出
