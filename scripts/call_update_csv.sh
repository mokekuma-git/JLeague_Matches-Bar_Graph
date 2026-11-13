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
# A manual run is always a full update -- that is what the button is for.
# Matches in play belong to the live watcher (live-update-csv.yaml), which
# replaced the per-match slots that used to fetch J-League after each game;
# their branch here went once nothing reached it any more (#330).
#
# `$SCHEDULE` must stay quoted: unquoted, the `*`s glob into repository file
# names.
if [ -z "$SCHEDULE" ] || [ "$DAILY_DONE" != "true" ]; then
  TRIGGER=$DAILY
else
  TRIGGER=$SKIP
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
  LAST_READER_SUCCEEDED=false
  echo "--- Running: $* ---"
  # Set UPDATE_CSV_DRY_RUN to check which readers a schedule selects without
  # reaching the network; the branch tests rely on it.
  if [ -n "${UPDATE_CSV_DRY_RUN:-}" ]; then
    summary_row "$*" "skipped (dry run)"
    return
  fi
  if "$@"; then
    LAST_READER_SUCCEEDED=true
    summary_row "$*" "ok"
  else
    echo "::error::Reader failed: $*"
    FAILED+=("$*")
    summary_row "$*" "**failed**"
  fi
}

# Finished cups leave scheduled updates automatically. A manual full refresh
# still visits them so that corrected official results can be picked up.
should_update_competition() {
  local competition="$1"
  local reason status
  local args=("$competition")
  if [ -z "$SCHEDULE" ]; then
    return 0
  fi
  if [ -n "${COMPETITION_COMPLETION_CONFIG:-}" ]; then
    args+=(--config "$COMPETITION_COMPLETION_CONFIG")
  fi
  if [ -n "${COMPETITION_COMPLETION_NOW:-}" ]; then
    args+=(--now "$COMPETITION_COMPLETION_NOW")
  fi
  if reason=$(uv run python scripts/competition_completion.py "${args[@]}"); then
    echo "Skipping $competition: completed ($reason)"
    summary_row "$competition" "skipped (completed: $reason)"
    return 1
  else
    status=$?
    if [ "$status" -ne 1 ]; then
      echo "::error::Completion check failed for $competition; continuing its readers"
      FAILED+=("completion check: $competition")
      summary_row "$competition completion" "**check failed**; readers will continue"
    else
      summary_row "$competition completion" "active: $reason"
    fi
  fi
  return 0
}

# 1日の最初の実行 ⇒ 全CSVのアップデートを実行 (Skip は上で終了済み)
run_reader uv run python src/read_jleague_matches.py -f
run_reader uv run python src/read_jfamatch.py PrincePremierE PrincePremierW PrinceKanto
run_reader uv run python src/read_we_league.py
if should_update_competition EmperorsCup; then
  run_reader uv run python src/read_jfamatch.py EmperorsCup
fi
# Levain Cup: fetch the cup-only SFMS01 rows (csv/2026_frame11.csv), then build
# the published CSV from them.  Update -y when the next season starts.
if should_update_competition JLeagueCup; then
  run_reader uv run python scripts/legacy/read_older2020_matches.py -y 2026 --frame 11
  run_reader uv run python scripts/make_old_matches_csv.py --competition JLeagueCup -y 2026
fi
# J Youth Cup 26-27: search code 2026, frame 50 (csv/26_27_frame50.csv). Runs until
# the knockout final in June 2027.
run_reader uv run python scripts/legacy/read_older2020_matches.py -y 2026 --frame 50
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "jyouth_fetch_succeeded=$LAST_READER_SUCCEEDED" >> "$GITHUB_OUTPUT"
fi
run_reader uv run python scripts/make_old_matches_csv.py --competition JYouthCup -y 2026
# run_reader uv run python src/read_aclgl_matches.py

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "::error::${#FAILED[@]} CSV update task(s) failed:"
  for reader in "${FAILED[@]}"; do
    echo "  - $reader"
  done
  summary ""
  summary "${#FAILED[@]} CSV update task(s) failed."
  exit 1
fi

echo "All readers completed successfully"
