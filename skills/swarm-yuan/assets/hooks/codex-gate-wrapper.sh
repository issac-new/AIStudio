#!/usr/bin/env bash
# codex-gate-wrapper.sh — 增量：Codex PreToolUse deny 协议适配
# Claude Code 协议（hookSpecificOutput JSON + exit 0）→ Codex 协议（exit 2 + stderr 原因透传给模型）
# 用法：codex hooks.json 的 command 调用本脚本（stdin 透传给 fail-gate-hook）
set -uo pipefail
HOOK_INPUT=$(cat 2>/dev/null || printf '')
FGH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fail-gate-hook.sh"
[[ -f "$FGH" ]] || FGH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/fail-gate-hook.sh"
[[ -f "$FGH" ]] || exit 0
out=$(printf '%s' "$HOOK_INPUT" | bash "$FGH" 2>/dev/null) || true
if printf '%s' "$out" | grep -q '"permissionDecision":"deny"'; then
  reason=$(printf '%s' "$out" | sed -n 's/.*"permissionDecisionReason":"\([^"]*\)".*/\1/p' | head -1)
  ctx=$(printf '%s' "$out" | sed -n 's/.*"additionalContext":"\([^"]*\)".*/\1/p' | head -1)
  printf '%s\n%s\n' "${reason:-swarm-yuan fail-gate: DENY}" "${ctx:-}" >&2
  exit 2
fi
exit 0
