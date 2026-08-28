#!/bin/bash

# Runs every reader for the current schedule.
#
# Each reader is run even if an earlier one fails, so that a single broken data
# source does not stop the healthy ones from updating.  The exit status of every
# reader is remembered and the script exits non-zero if any of them failed, so a
# broken source surfaces as a red CI run instead of passing silently.

echo Called by schedule $1
DAILY=Daily
ONGAME=OnGame
TRIGGER=$(echo $1 | awk '{if($3 == "*" && $4 == "*") {print "'$DAILY'"} else {print "'$ONGAME'"}}')

RUNNING_HOUR=`TZ=Asia/Tokyo date "+%H"`
TZ=Asia/Tokyo date
echo $RUNNING_HOUR
echo $TRIGGER

FAILED=()

# Run one reader, recording its name if it fails.
run_reader() {
  echo "--- Running: $* ---"
  if ! "$@"; then
    echo "::error::Reader failed: $*"
    FAILED+=("$*")
  fi
}

if [ $RUNNING_HOUR -eq 1 ]; then
# if [ $TRIGGER = $DAILY]; then
  # 日ごと深夜自動実行 ⇒ 全CSVのアップデートを実行
  run_reader uv run python src/read_jleague_matches.py -f
  run_reader uv run python src/read_jfamatch.py PrincePremierE PrincePremierW PrinceKanto WC2026 WC2026KO
  # JFAでスケジュール生成後、openfootballで日次スコアを上書き (JFA反映遅延の補完)
  run_reader uv run python src/read_openfootball_wc.py
  run_reader uv run python src/read_we_league.py
  # run_reader uv run python src/read_aclgl_matches.py
else
  # 試合時間ごとの自動実行では、Jリーグと開催中のWC2026を更新
  run_reader uv run python src/read_jleague_matches.py
  run_reader uv run python src/read_jfamatch.py WC2026 WC2026KO
  # JFAでスケジュール生成後、openfootballで日次スコアを上書き (JFA反映遅延の補完)
  run_reader uv run python src/read_openfootball_wc.py
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "::error::${#FAILED[@]} reader(s) failed:"
  for reader in "${FAILED[@]}"; do
    echo "  - $reader"
  done
  exit 1
fi

echo "All readers completed successfully"
