#!/bin/bash
# mx-enable-file-approval.sh — fleet 命令审批 live 链路启用（2026-09-28 演示轮修复）。
# 三件事（全部幂等）：
#   1. 补丁 490 应用到 ~/.hermes/hermes-agent（unattended deny 前先走已选审批传输）
#   2. studio-file-approval 传输插件部署到 sim 全部 profile home 的 plugins/
#   3. 各 profile config.yaml 写 security.approval.transport: studio_file
# 反向（撤销演示态）：DEENABLE=1 → transport 改回 builtin（worker 恢复上游
# fail-closed 硬拒行为；插件与补丁保留不碍事）。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

AGENT_TREE="${HERMES_AGENT_TREE:-$HOME/.hermes/hermes-agent}"
PATCH="$PATCH_DIR/490-agent-unattended-approval-transport.patch"
PLUGIN_SRC="$NCWK_ROOT/overlay/runtime/plugins/studio-file-approval"
TRANSPORT="${FILE_APPROVAL_TRANSPORT:-studio_file}"

[[ -f "$PATCH" ]] || fail "补丁不存在：$PATCH"
[[ -d "$PLUGIN_SRC" ]] || fail "插件源不存在：$PLUGIN_SRC"

# ── 1. 补丁 → 安装树（幂等：已应用则跳过）──
if git -C "$AGENT_TREE" apply --check -R "$PATCH" >/dev/null 2>&1; then
  log "补丁 490 已在安装树（跳过）"
else
  git -C "$AGENT_TREE" apply --check "$PATCH" >/dev/null 2>&1 \
    || fail "补丁 490 无法应用（先 git -C $AGENT_TREE status 查漂移）"
  git -C "$AGENT_TREE" apply "$PATCH" && log "补丁 490 已应用到安装树"
fi

# ── 2. 插件 → 全部 profile home ──
n=0
for prof in "$HERMES_ROOT"/profiles/*/; do
  dst="${prof}plugins/studio-file-approval"
  mkdir -p "$dst"
  cp "$PLUGIN_SRC/__init__.py" "$PLUGIN_SRC/plugin.yaml" "$dst/"
  n=$((n+1))
done
mkdir -p "$HERMES_ROOT/plugins/studio-file-approval"
cp "$PLUGIN_SRC/__init__.py" "$PLUGIN_SRC/plugin.yaml" "$HERMES_ROOT/plugins/studio-file-approval/"
log "插件已部署到 $n 个 profile home + 根 home"

# ── 3. config 写 transport（幂等，python 精确改写）──
if [[ "${DEENABLE:-0}" == "1" ]]; then
  TPTARGET="builtin"
else
  TPTARGET="$TRANSPORT"
fi
m=0
for conf in "$HERMES_ROOT"/profiles/*/config.yaml "$HERMES_ROOT"/config.yaml; do
  [[ -f "$conf" ]] || continue
  TPTARGET="$TPTARGET" python3 - "$conf" <<'PY'
import os, sys
p = sys.argv[1]
val = os.environ["TPTARGET"]
t = open(p, encoding="utf-8").read()
if "\nsecurity:\n" in t or t.startswith("security:\n"):
    import re
    if re.search(r"(?m)^\s*approval:", t):
        if re.search(r"(?m)^\s*transport:", t):
            t = re.sub(r"(?m)^(\s*transport:).*$", lambda m: m.group(1) + " " + val, t, count=1)
        else:
            t = re.sub(r"(?m)^(\s*approval:)$", lambda m: m.group(1) + "\n    transport: " + val, t, count=1)
    else:
        t = re.sub(r"(?m)^(security:)$", lambda m: m.group(1) + "\n  approval:\n    transport: " + val, t, count=1)
else:
    t = t.rstrip("\n") + "\n\nsecurity:\n  approval:\n    transport: " + val + "\n"
open(p, "w", encoding="utf-8").write(t)
PY
  m=$((m+1))
done
log "config 已置 transport: ${TPTARGET}（$m 份）"

# ── 4. 插件启用（plugins 门禁默认关；DEENABLE=1 时 disable）──
HB_BIN="${HERMES_BIN:-$HOME/.hermes/hermes-agent/venv/bin/hermes}"
ACTION="enable"
[[ "${DEENABLE:-0}" == "1" ]] && ACTION="disable"
e=0
for prof in "$HERMES_ROOT"/profiles/*/; do
  HERMES_HOME="${prof%/}" "$HB_BIN" plugins "$ACTION" studio-file-approval >/dev/null 2>&1 && e=$((e+1))
done
HERMES_HOME="$HERMES_ROOT" "$HB_BIN" plugins "$ACTION" studio-file-approval >/dev/null 2>&1 && e=$((e+1))
log "插件已 ${ACTION}（$e 个 home）"
log "完成。新派 worker 即生效（存量 worker 不受影响）"
