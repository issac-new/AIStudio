#!/bin/bash
# mx-sim-mautrix-ensure.sh — SIM matrix 能力自愈（2026-10-17 mautrix macOS 门控事故产品化，A 案兜底）
#
# 根因链：上游 pyproject 把 matrix extra 整体门控 linux-only（mautrix[encryption] 连带的
# python-olm 在 macOS 编不过，裸 mautrix 纯 Python 可装却被一并门掉），正规 pm sync 在
# darwin 永不装 mautrix——SIM matrix 能力历来靠旁路注入苟活，pm 迁移/重建代际环境即丢失，
# 网关重启才现形（2026-10-17 17:11 实录：01:14 旧实例靠旧代际 3b3e 苟活 15h，重启全灭）。
# 双保险分流：B 案（正路）= overlay 638 补丁解除 pyproject 门控 + pm lock 重解锁
# （快照 uv.lock 2026-10-17 已刷），新代际环境经 pm install 合法获得 mautrix；
# A 案（本脚本）= 兜底「快照 uv.lock 被再供给覆盖回 linux 门控」等 B 路失效场景。
#
# 坑位备忘：
#   1) 探针必须 import hermes_bootstrap 之后再 import mautrix——bootstrap 会把宿主 .venv
#      的 site-packages 换成 pm 代际 env 的，裸 python -c import 成功≠网关进程内成功；
#   2) pm facts.json 会陈旧谎报 extras 已装（stamp 幂等让 pm install 空转"✓"），别信
#      记录，信物理 import；
#   3) 注入要对 gen 下「全部」环境执行——网关启动时 adopt 哪个 env 由 pm 选择态决定，
#      不可预知（2026-10-17 一个 gen 内并列 4 个 env 实录）。
#
# 用法：
#   mx-sim-mautrix-ensure.sh check   探测（exit 0=matrix 可用；1=缺失）
#   mx-sim-mautrix-ensure.sh fix     旁路注入全部代际环境+重启网关（launchd 形态）+复验
#   mx-sim-mautrix-ensure.sh ensure  check 失败自动 fix（mx-up 挂钩用）
set -uo pipefail
LABEL="ai.hermes.gateway-sim"
SIM="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
# 与 wrapper（bin/hermes-sim，生成于 mx-lib mx_provision_agent_src）同源的解释器解析
PYBIN="$(sed -n 's/^exec "\([^"]*\)".*/\1/p' "$SIM/bin/hermes-sim" 2>/dev/null | head -1)"
[ -x "$PYBIN" ] || { echo "✗ 解析不到 wrapper 解释器（$SIM/bin/hermes-sim）"; exit 2; }
UV_BIN="$(command -v uv || echo "$HOME/.local/bin/uv")"
MAUTRIX_PIN="mautrix==0.21.1"   # 与上游 matrix extra 同版钉

probe() {
  HERMES_HOME="$SIM/hermes" "$PYBIN" -I -c '
import sys; sys.path.insert(0, "'"$SIM"'/hermes-agent-src")
import hermes_bootstrap  # pm 代际 adopt：与网关进程同链换掉宿主 site-packages
import mautrix' >/dev/null 2>&1
}

cmd_check() {
  if probe; then echo "✓ SIM matrix 可用（bootstrap 链 import mautrix OK）"; return 0; fi
  echo "✗ SIM matrix 缺失（网关进程链 import mautrix 失败——网关重启即适配器全灭）"
  return 1
}

cmd_fix() {
  local n=0 vpy
  for vpy in "$SIM"/hermes/installs/*/environments/*/venv/bin/python; do
    [ -x "$vpy" ] || continue
    if "$UV_BIN" pip install --python "$vpy" --reinstall-package mautrix "$MAUTRIX_PIN" >/dev/null 2>&1; then
      n=$((n+1))
    else
      echo "⚠ mautrix 注入失败：$vpy"
    fi
  done
  echo "↻ mautrix 已旁路注入 $n 个 pm 代际环境（${MAUTRIX_PIN}）"
  # 网关 launchd 形态在跑则重启加载（nohup 形态无 label，由 mx-up 自身启动链覆盖）
  if launchctl list 2>/dev/null | awk -v l="$LABEL" '$3 == l {found=1} END {exit !found}'; then
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    echo "↻ 网关已 kickstart 重启，等待就绪…"
    local i
    for i in $(seq 1 18); do  # 90s 就绪窗，与 mx-sim-gateway-service 同量级
      sleep 5
      if curl -sf -m 3 http://127.0.0.1:8801/health >/dev/null 2>&1; then echo "✓ 网关就绪"; break; fi
    done
  fi
  cmd_check
}

case "${1:-ensure}" in
  check) cmd_check ;;
  fix) cmd_fix ;;
  ensure) cmd_check || cmd_fix ;;
  *) echo "用法: $0 check|fix|ensure"; exit 2 ;;
esac
