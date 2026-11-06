# Jユースカップ26-27の着手可能通知

日次更新で取得する `csv/2026_frame50.csv` を使い、2ndラウンドとノックアウトラウンドの表示追加に着手できるかを検査する。条件を満たした段階で [Issue #352](https://github.com/mokekuma-git/JLeague_Matches-Bar_Graph/issues/352) へ一度だけコメントする。表示実装や自動コーディングの開始、Issueのcloseは行わない。

## 対象と着手条件

SFMS01の `シーズン=2026/27` だけを対象とし、2ndとKOを独立に判定する。[公式大会概要](https://www.jleague.jp/news/article/34898/)では、1st・2ndの日程はチーム間の調整後に順次決定される。全試合・全キックオフ時刻の確定は待たない。

| 段階 | 着手可能とする条件 |
| --- | --- |
| 2ndラウンド | `2ndラウンド` のグループ表記を持つ行に、実チーム同士・有効な開催日を持つカードが1件以上ある。グループ表記は実データから取り、全16組の公表は必須にしない |
| KO | `ノックアウトラウンド` の `ラウンド16` に、重複しない実チーム16件・全8カードが揃い、少なくとも1件の開催日がある。残りの開催日・時刻は未定でもよい |

空欄、未定、TBD／TBA／unknown、`[1]w`、`No.1の勝者`、グループ順位などの未確定枠は実チームとして扱わない。日付は実在する日付として検査する。スコアの有無は条件に含めない。

2025大会の方式は流用しない。26-27の2ndは各チーム3試合の1回戦総当たりで、上位リーグA〜Hの上位2チームがKOへ進む。KOの接続は、通知後の実装時に公式オープンドロー図で確認する。CSV掲載順だけからブラケットの接続を推測しない。

## 日次更新への接続

`scripts/call_update_csv.sh` はframe50 readerの直後に、その回の成否を `jyouth_fetch_succeeded` としてworkflow outputへ渡す。readerが失敗した場合、手元のCSVが古いままでも通知しない。Skipやdry runも通知対象外。他大会のreaderが失敗してもframe50が成功していれば検査する。

`.github/workflows/update-match-csv.yaml` は、キャンセルされておらず、この成功outputが `true` の場合だけ監視を実行する。監視プログラムも通知時には `JYOUTH_FETCH_SUCCEEDED=true` を必須とする。GitHub APIには同workflowの `GITHUB_TOKEN` を使い、既存権限に `issues: write` だけを追加している。

通知失敗はジョブの失敗として報告する。取得済み変更のコミット・デプロイ処理は監視より先に実行するため、通知失敗で健全なデータ更新を捨てない。

## 状態と重複防止

- `waiting`: その段階の対戦行がまだない
- `partial`: 行はあるが、具体的な対戦・開催日の条件を満たしていない
- `ready`: 表示追加の着手材料が公表された。全データの確定を意味しない
- `configured`: `season_map.yaml` に該当段階の26-27が登録済み。その段階への追加通知を終了する

コメントには確認したグループ表記、対象カード数、開催日・時刻・対戦枠の未確定件数、取得元、検出したworkflow run、次に確認する事項を記載する。

コメント内の固定マーカー `<!-- jyouth-readiness:26-27:2nd -->` または `<!-- jyouth-readiness:26-27:KO -->` を、Issueの全コメントページから探す。マーカーがあれば、その段階の日程が後から変更されても再投稿しない。Actions cacheの期限やローカルファイルに通知済み状態を依存させない。

Issueが閉じている場合は投稿も再オープンも行わない。2ndの設定後も、未設定のKOは引き続き監視する。通知は着手材料の案内だけで、Issue全体の完了は変更しない。

## ローカルで判定だけを確認する

ネットワーク取得・Issue投稿は行わない。

```bash
uv run python scripts/monitor_jyouth_readiness.py
uv run python scripts/monitor_jyouth_readiness.py --csv /path/to/2026_frame50.csv
```

`--notify` は日次更新で使用する。試験ではGitHub APIをfakeに置き換え、実Issueへ試験コメントを投稿しない。
