#!/bin/bash
# isolation-boundary.test.sh — 推演/产品隔离边界守门（隔离轮 2026-10-03 立线）
# 三断言（违一即 FAIL，防止边界随时间回蚀）：
#   ①产品零反向依赖：overlay 的运行时代码（custom/、patches/）不得引用 harness
#     （simharness、scripts/aipay）——注释/文档行豁免（溯源注释允许，运行时依赖禁止）。
#   ②harness 对产品仓只读消费：所有 $OVERLAY_ROOT 引用点必须落在白名单
#     （patches/ 读取、deploy-agent-runtime.mjs 调用、custom/ 只读探针、package.json 探测）。
#   ③harness 不写产品/上游树：写原语（rm/mv/cp/rsync/重定向/git 写操作）目标
#     不得为 $OVERLAY_ROOT 或 upstream 树。
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAY="${MX_OVERLAY_ROOT:-$(cd "$HERE/../overlay" 2>/dev/null && pwd)}"
fails=0

# ── ① 产品零反向依赖 ──
bad=$(grep -rn "simharness\|scripts/aipay" "$OVERLAY/custom" "$OVERLAY/patches" 2>/dev/null \
  | grep -vE '^\s*[^:]+:[0-9]+:\s*(\+?(//|/\*|\*|<!--|#))' | grep -vE '\.(md|test)\.' | head -5 || true)
if [[ -n "$bad" ]]; then
  echo "FAIL ① 产品运行时代码反向引用 harness："; echo "$bad"; fails=1
else
  echo "PASS ① 产品零反向依赖（custom/patches 运行时零引用）"
fi

# ── ② harness 消费白名单 ──
# 白名单=只读消费面（run13 复盘补：custom/qgate 只读 CLI 执行〔release-report 证据〕、
# runtime/plugins 只读配置读取〔style-charter〕——均为 harness→产品只读方向，非反向依赖）
wl='patches|deploy-agent-runtime\.mjs|custom/client|custom/server|custom/qgate|runtime/plugins|package\.json|\.overlay-injected|rev-parse'
bad2=$(grep -rn 'OVERLAY_ROOT' "$HERE"/*.sh "$HERE"/mux/*.sh 2>/dev/null \
  | grep -vE "^\S+:\s*#" \
  | grep '\$OVERLAY_ROOT' | grep -vE "$wl" | head -5 || true)
if [[ -n "$bad2" ]]; then
  echo "FAIL ② harness 存在白名单外的产品仓引用："; echo "$bad2"; fails=1
else
  echo "PASS ② harness 对产品仓只读消费（引用全落白名单）"
fi

# ── ③ 不写产品/上游树 ──
bad3=$(grep -rnE '(rm |mv |cp |rsync |tee |git -C )[^#]*\$(OVERLAY_ROOT|NCWK_ROOT)/?(upstream)?' \
  "$HERE"/*.sh "$HERE"/mux/*.sh 2>/dev/null \
  | grep -vE '^\S+:\s*#|git -C [^#]*\b(rev-parse|log|status|diff|ls-files|grep|show)\b|read-only|只读' | head -5 || true)
if [[ -n "$bad3" ]]; then
  echo "FAIL ③ harness 写原语指向产品/上游树："; echo "$bad3"; fails=1
else
  echo "PASS ③ harness 零写原语指向产品/上游树"
fi

[[ $fails = 0 ]] && echo "== 隔离边界三断言全过 ==" || exit 1
