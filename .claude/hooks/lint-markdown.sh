#!/usr/bin/env bash
# PostToolUse (Edit|Write) フック: 編集された Markdown を markdownlint-cli2 で検査する。
# 違反があれば exit 2 + stderr で Claude にフィードバックし、その場で修正させる。
set -u

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$f" in
  *.md) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$f" in
  "$root"/plan/* | "$root"/local_data/* | */node_modules/*) exit 0 ;;
  "$root"/*) ;;
  *) exit 0 ;; # プロジェクト外 (メモリファイル等) は対象外
esac

lint="$root/frontend/node_modules/.bin/markdownlint-cli2"
[ -x "$lint" ] || exit 0

cd "$root" || exit 0
out=$("$lint" --config "$root/.markdownlint-cli2.jsonc" "${f#"$root"/}" 2>&1)
status=$?
if [ $status -ne 0 ]; then
  echo "markdownlint violations in $f:" >&2
  echo "$out" | grep -E 'error MD' >&2
  exit 2
fi
exit 0
