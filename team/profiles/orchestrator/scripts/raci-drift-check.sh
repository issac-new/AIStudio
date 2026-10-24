#!/bin/bash
# raci-column-restore + kanban-write-guardrail drift watchdog
# 健康静默 exit 0；漂移自动重打（exit 1 告警）；无法干净应用 exit 2 需人工。
# 2026-10-13 raci 注入根治任务的第三件套（patch 三件套见 hermes-source-patch-persistence skill）。
: "${PATCHES:=$HOME/.hermes/patches}"
: "${TREE:=$HOME/.hermes/hermes-agent}"
PATCH="$PATCHES/hermes-raci-column-restore.patch"
EXPECT_KANBAN_DB=10      # swarm:raci-column markers in kanban_db.py
EXPECT_KANBAN=4          # in kanban.py
EXPECT_TOOLS=2           # kanban_tools.py + kanban_tools_schemas.py + kanban_output.py 各 2
GUARDRAIL_MIN=1          # swarm:kanban-write-guardrail blocks in kanban_db_connect.py

[ -f "$PATCH" ] || { echo "ERROR patch missing: $PATCH"; exit 2; }

cd "$TREE" || { echo "ERROR tree missing: $TREE"; exit 2; }

drifted=""
[ "$(grep -c 'swarm:raci-column' hermes_cli/kanban_db.py 2>/dev/null)" -ge "$EXPECT_KANBAN_DB" ] || drifted="$drifted kanban_db.py"
[ "$(grep -c 'swarm:raci-column' hermes_cli/kanban.py 2>/dev/null)" -ge "$EXPECT_KANBAN" ] || drifted="$drifted kanban.py"
[ "$(grep -c 'swarm:raci-column' hermes_cli/kanban_output.py 2>/dev/null)" -ge "$EXPECT_TOOLS" ] || drifted="$drifted kanban_output.py"
[ "$(grep -c 'swarm:raci-column' tools/kanban_tools.py 2>/dev/null)" -ge "$EXPECT_TOOLS" ] || drifted="$drifted kanban_tools.py"
[ "$(grep -c 'swarm:raci-column' tools/kanban_tools_schemas.py 2>/dev/null)" -ge "$EXPECT_TOOLS" ] || drifted="$drifted kanban_tools_schemas.py"
[ "$(grep -c '_arg("--raci"' hermes_cli/kanban_parser.py 2>/dev/null)" -ge 1 ] || drifted="$drifted kanban_parser.py(--raci)"
[ "$(grep -c 'swarm:kanban-write-guardrail' hermes_cli/kanban_db_connect.py 2>/dev/null)" -ge "$GUARDRAIL_MIN" ] || drifted="$drifted kanban_db_connect.py(guardrail)"

if [ -z "$drifted" ]; then
  [ "${1:-}" = "--verbose" ] && echo "ok: raci-column + guardrail intact"
  exit 0
fi

# 漂移：先守卫（update 进行中就跳过，避免竞态重打）。
# 判据（2026-10-13 实证）：进程匹配不可用——launcher 把 "hermes update" 字样
# 嵌在 -c inline python 文本里，19 个 kanban watcher 全被 pgrep -f 误命中。
# 改用锁文件判据：update 启动即写 .git/hermes-update-pull（托管拉取，中断也
# 留存，由 _early_recovery 接管）；该文件在场 = update 在飞或待恢复，都该跳过。
# 兜底：update 执行器模块名 update_cmd_fleet（bracket 防自匹配）。
if [ -f "$TREE/.git/hermes-update-pull" ] || [ -f "$TREE/.git/gitdir" ] ; then
  # .git 是 gitdir 指针时查真实 gitdir 下的托管文件
  GITDIR=$(sed -n 's/^gitdir: //p' "$TREE/.git/gitdir" 2>/dev/null)
  [ -n "$GITDIR" ] && [ -f "$GITDIR/hermes-update-pull" ] && \
    { echo "skip: hermes update in flight (custody file)"; exit 0; }
fi
if [ -f "$TREE/.git/hermes-update-pull" ]; then
  echo "skip: hermes update in flight (custody file); drifted:$drifted"
  exit 0
fi
if pgrep -f "update_cmd_flee[t]" >/dev/null 2>&1; then
  echo "skip: hermes update executor in flight; drifted:$drifted"
  exit 0
fi

echo "DRIFT detected:$drifted — re-applying $PATCH"
if git apply --check "$PATCH" >/dev/null 2>&1; then
  git apply "$PATCH" && echo "REPAIRED: patch re-applied; restart gateway/TUI to load. Review: git status" && exit 1
  echo "ERROR: apply --check passed but apply failed (race?)"
  exit 2
fi
if git apply --3way "$PATCH" >/dev/null 2>&1; then
  echo "REPAIRED(3way): patch re-applied; restart gateway/TUI to load. Review: git status"
  exit 1
fi
echo "ERROR: patch cannot apply cleanly — manual rebuild required (drifted:$drifted)"
exit 2
