#!/usr/bin/env bash
# PostToolUse (Edit|Write) フック: Python ↔ TypeScript 共有型定義の編集後に
# scripts/check_type_sync.py を実行し、ドリフトを即時検出して Claude にフィードバックする。
set -u

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$f" in
  "$root"/src/match_utils.py) ;;
  "$root"/frontend/src/types/*.ts) ;;
  *) exit 0 ;;
esac

cd "$root" || exit 0
out=$(uv run python scripts/check_type_sync.py 2>&1)
status=$?
if [ $status -ne 0 ]; then
  echo "Python ↔ TS type sync check failed after editing $f:" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
