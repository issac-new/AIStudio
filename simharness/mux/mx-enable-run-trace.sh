#!/bin/bash
# mx-enable-run-trace.sh — 轨迹/动作账双插件 fleet 部署（2026-10-17 A7 数据面供给；
# 2026-11-12 handbook 清债批扩为双插件：run-trace schema 1.2＋action-ledger 三态账）。
# 四件事（全部幂等）：
#   1. run-trace 与 action-ledger 插件部署到 SIM 根 home + 全部 profile home 的 plugins/
#      （源=overlay custom/hermes-agent-plugins/<名>）
#   2. 各 home enable 两插件（plugins 门禁默认关——不 enable=装而不活，631 份零 span 教训）
#   3. trace 目录就位（span 由网关 env HERMES_RUN_TRACE_DIR 指到 SIM 树，本脚本只建目录核验）
#   4. 动作账目录就位（HERMES_ACTION_LEDGER_DIR 未设时插件落默认 ~/.hermes/action-ledger；
#      guard 默认关（HERMES_ACTION_LEDGER_GUARD=1 才拦），enable 后新会话即记账）
# 前置：网关需带 HERMES_RUN_TRACE_DIR 重启（mx-up 已注入；现场网关不带时插件回落
# 默认 ~/.hermes/traces——检查网关 env 或重启）。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

PLUGINS_SRC_ROOT="${MX_PLUGINS_SRC_ROOT:-$NCWK_ROOT/overlay/custom/hermes-agent-plugins}"
PLUGIN_NAMES=(run-trace action-ledger)
PLUGIN_SRC="${MX_RUN_TRACE_SRC:-$PLUGINS_SRC_ROOT/run-trace}"
[[ -d "$PLUGIN_SRC" ]] || fail "插件源不存在：$PLUGIN_SRC（overlay 仓位置）"
[[ -f "$PLUGIN_SRC/plugin.yaml" ]] || fail "插件源缺 plugin.yaml"

# ── 1. 部署（根 home + 全部 profile home）──
n=0
deploy_one() {
  local home="$1" name src dst f
  for name in "${PLUGIN_NAMES[@]}"; do
    src="$PLUGINS_SRC_ROOT/$name"
    [[ -f "$src/plugin.yaml" ]] || { log "跳过 $name（源缺 plugin.yaml）"; continue; }
    dst="$home/plugins/$name"
    mkdir -p "$dst"
    for f in "$src"/*.py "$src"/plugin.yaml; do
      [[ -f "$f" ]] && cp "$f" "$dst/"
    done
  done
  n=$((n+1))
}
deploy_one "$HERMES_ROOT"
for prof in "$HERMES_ROOT"/profiles/*/; do
  [[ -d "$prof" ]] || continue
  deploy_one "${prof%/}"
done
log "双插件（run-trace＋action-ledger）已部署到 $n 个 home（含根 home）"

# ── 2. enable（幂等：已 enabled 时 hermes CLI 自身静默）──
HB_BIN="${HERMES_BIN:-$(command -v hermes || echo "$HOME/.hermes/hermes-agent/venv/bin/hermes")}"
# 判定含 already-enabled（幂等语义：CLI 对已启用返回非零退出码但 stdout 明示
# already enabled——2026-10-17 实锤：只看退出码会把 43 home 全判失败）
e=0
enroll_one() {
  local home="$1" name out
  for name in "${PLUGIN_NAMES[@]}"; do
    [[ -d "$home/plugins/$name" ]] || continue
    out=$(HERMES_HOME="$home" "$HB_BIN" plugins enable "$name" 2>&1) || true
    if printf '%s' "$out" | grep -qE 'enabled|already'; then e=$((e+1)); fi
  done
}
enroll_one "$HERMES_ROOT"
for prof in "$HERMES_ROOT"/profiles/*/; do
  [[ -d "$prof" ]] || continue
  enroll_one "${prof%/}"
done
log "双插件已 enable（$e home·插件计）"

# ── 3. trace/动作账目录就位 ──
mkdir -p "$HERMES_ROOT/traces"
log "trace 目录就位：$HERMES_ROOT/traces（span 落点=网关 env HERMES_RUN_TRACE_DIR；现场网关需带此 env 重启生效）"
# 动作账：guard 默认关（HERMES_ACTION_LEDGER_GUARD=1 才拦同键未结算）；
# 目录由插件自建（append 前 mkdir），此处只提示可覆盖项，不预写运行态。
log "action-ledger：默认只记账（guard 关）；账本目录可用 HERMES_ACTION_LEDGER_DIR 覆盖"
log "完成。新会话即写 span（schema 1.2：span_kind/Context Manifest/step/compaction/hitl）＋动作账"
