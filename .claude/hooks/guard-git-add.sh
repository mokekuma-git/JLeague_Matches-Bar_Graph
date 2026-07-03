#!/usr/bin/env bash
# PreToolUse (Bash) フック: git add -f / --force をブロックする。
# plan/, local_data/, ビルド生成物 (docs/matches.html, docs/assets/) は .gitignore
# 対象のため、force-add さえ塞げば誤コミットの侵入経路がない (CLAUDE.md 開発プラクティス参照)。
set -u

cmd=$(jq -r '.tool_input.command // empty')

# -f/--force は `git add` と同一コマンドセグメント内 (同一行かつ &&・;・| まで) のみ検査する。
# コミットメッセージ等の無関係な文字列に反応しないようにするための制限 (完全なシェル解析はしない)。
if echo "$cmd" | grep -qE 'git[[:space:]]+add[^&|;]*[[:space:]](-f|--force)([[:space:]]|$)'; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git add -f / --force は禁止です。plan/, local_data/, ビルド生成物 (docs/matches.html, docs/assets/) は git 管理外のまま維持してください (CLAUDE.md 開発プラクティス)。"}}
JSON
fi
exit 0
