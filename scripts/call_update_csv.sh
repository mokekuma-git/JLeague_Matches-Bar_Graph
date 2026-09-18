#!/bin/bash

# Runs every reader for the current schedule.
#
# Each reader is run even if an earlier one fails, so that a single broken data
# source does not stop the healthy ones from updating.  The exit status of every
# reader is remembered and the script exits non-zero if any of them failed, so a
# broken source surfaces as a red CI run instead of passing silently.

SCHEDULE="${1:-}"
echo "Called by schedule: ${SCHEDULE:-<manual run>}"
DAILY=Daily
ONGAME=OnGame
SKIP=Skip

# Whether today's full update has already been done (JST day).  The workflow
# looks this up before calling the script; anything but "true" -- a local run, a
# failed lookup -- counts as not done, which errs towards doing the work.
DAILY_DONE="${DAILY_DONE:-false}"

# The full update runs once per JST day, on whichever run gets there first.
# Neither the hour a run starts nor the cron line that fired it can say that:
# GitHub starts scheduled runs hours late, and picking the branch by the hour
# let every delayed run skip the daily readers for weeks (#309).  Several slots
# may ask for the day's update; only the first one does it (#315).
#
# A manual run is always a full update -- that is what the button is for.  Once
# the day's update is done, a WC2026 entry pinned to a date still takes the
# per-match path, and any other slot has nothing left to do.
#
# `$SCHEDULE` must stay quoted: unquoted, the `*`s glob into repository file
# names and no cron line can ever match.
if [ -z "$SCHEDULE" ]; then
  TRIGGER=$DAILY
elif [ "$DAILY_DONE" != "true" ]; then
  TRIGGER=$DAILY
else
  TRIGGER=$(echo "$SCHEDULE" | awk -v skip="$SKIP" -v ongame="$ONGAME" \
    '{print ($3 == "*" && $4 == "*") ? skip : ongame}')
fi

TZ=Asia/Tokyo date
echo "Trigger: $TRIGGER"
# The workflow records the day as done only after a full update that succeeded.
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "trigger=$TRIGGER" >> "$GITHUB_OUTPUT"
fi

FAILED=()

# The daily branch went unrun for three weeks and nobody noticed: a skipped run
# is indistinguishable from a quiet one unless you open the log.  Report the
# branch and every reader's outcome to the job summary, so which readers ran is
# visible from the run list itself (#309).
summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY"
  else
    printf '%s\n' "$*"
  fi
}

summary_row() {
  summary "| \`$1\` | $2 |"
}

summary "### CSV update: $TRIGGER"
summary ""
if [ "$TRIGGER" = "$SKIP" ]; then
  echo "Today's full update is already done; nothing to do"
  summary "Today's full update is already done; no reader was run."
  exit 0
fi
summary "| Reader | Result |"
summary "| --- | --- |"

# Run one reader, recording its name if it fails.
run_reader() {
  echo "--- Running: $* ---"
  # Set UPDATE_CSV_DRY_RUN to check which readers a schedule selects without
  # reaching the network; the branch tests rely on it.
  if [ -n "${UPDATE_CSV_DRY_RUN:-}" ]; then
    summary_row "$*" "skipped (dry run)"
    return
  fi
  if "$@"; then
    summary_row "$*" "ok"
  else
    echo "::error::Reader failed: $*"
    FAILED+=("$*")
    summary_row "$*" "**failed**"
  fi
}

if [ "$TRIGGER" = "$DAILY" ]; then
  # 1日の最初の実行 ⇒ 全CSVのアップデートを実行
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
  summary ""
  summary "${#FAILED[@]} reader(s) failed."
  exit 1
fi

echo "All readers completed successfully"
