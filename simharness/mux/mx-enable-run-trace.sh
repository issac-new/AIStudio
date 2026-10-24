#!/bin/bash
# mx-enable-run-trace.sh — run-trace 轨迹插件 fleet 部署（2026-10-17 A7 数据面供给）。
# 三件事（全部幂等）：
#   1. run-trace 插件部署到 SIM 根 home + 全部 profile home 的 plugins/
#      （源=overlay custom/hermes-agent-plugins/run-trace，含 2026-10-17 调用约定修复）
#   2. 各 home enable 插件（plugins 门禁默认关——不 enable=装而不活，631 份零 span 教训）
#   3. trace 目录就位（span 由网关 env HERMES_RUN_TRACE_DIR 指到 SIM 树，本脚本只建目录核验）
# 前置：网关需带 HERMES_RUN_TRACE_DIR 重启（mx-up 已注入；现场网关不带时插件回落
# 默认 ~/.hermes/traces——检查网关 env 或重启）。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

PLUGIN_SRC="${MX_RUN_TRACE_SRC:-$NCWK_ROOT/overlay/custom/hermes-agent-plugins/run-trace}"
[[ -d "$PLUGIN_SRC" ]] || fail "插件源不存在：$PLUGIN_SRC（overlay 仓位置）"
[[ -f "$PLUGIN_SRC/plugin.yaml" ]] || fail "插件源缺 plugin.yaml"

# ── 1. 部署（根 home + 全部 profile home）──
n=0
deploy_one() {
  local home="$1"
  local dst="$home/plugins/run-trace"
  mkdir -p "$dst"
  cp "$PLUGIN_SRC/__init__.py" "$PLUGIN_SRC/plugin.yaml" "$dst/"
  if [[ -f "$PLUGIN_SRC/otel_formatter.py" ]]; then cp "$PLUGIN_SRC/otel_formatter.py" "$dst/"; fi
  n=$((n+1))
}
deploy_one "$HERMES_ROOT"
for prof in "$HERMES_ROOT"/profiles/*/; do
  [[ -d "$prof" ]] || continue
  deploy_one "${prof%/}"
done
log "run-trace 已部署到 $n 个 home（含根 home）"

# ── 2. enable（幂等：已 enabled 时 hermes CLI 自身静默）──
HB_BIN="${HERMES_BIN:-$(command -v hermes || echo "$HOME/.hermes/hermes-agent/venv/bin/hermes")}"
# 判定含 already-enabled（幂等语义：CLI 对已启用返回非零退出码但 stdout 明示
# already enabled——2026-10-17 实锤：只看退出码会把 43 home 全判失败）
e=0
enroll_one() {
  local home="$1" out
  out=$(HERMES_HOME="$home" "$HB_BIN" plugins enable run-trace 2>&1) || true
  if printf '%s' "$out" | grep -qE 'enabled|already'; then e=$((e+1)); fi
}
enroll_one "$HERMES_ROOT"
for prof in "$HERMES_ROOT"/profiles/*/; do
  [[ -d "$prof" ]] || continue
  enroll_one "${prof%/}"
done
log "run-trace 已 enable（$e 个 home）"

# ── 3. trace 目录就位 ──
mkdir -p "$HERMES_ROOT/traces"
log "trace 目录就位：$HERMES_ROOT/traces（span 落点=网关 env HERMES_RUN_TRACE_DIR；现场网关需带此 env 重启生效）"
log "完成。新会话即写 span（header+llm_span+tool_span+trailer）"
