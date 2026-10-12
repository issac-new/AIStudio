#!/bin/bash
# flip-governance-enforcement.sh — 长会话治理行为类 report→auto 翻转（A 件，2026-10-12 用户批准）
# 执行时机：run15 report_done 之后（run16 起生效）。幂等可重跑；回退=改回 report。
# 机制：603 会话轮换读 config.yaml session_rotation 节（env HERMES_SESSION_ROTATION 可覆盖）。
# 翻转面：会话轮换（含让位耗尽路径=T05 预算耗尽移交的运行时根治）。
set -eu
SIM="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
CFG="$SIM/hermes/config.yaml"
[ -f "$CFG" ] || { echo "缺 $CFG"; exit 1; }
if grep -q '^session_rotation:' "$CFG"; then
  python3 - "$CFG" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p).read()
s=re.sub(r'(^session_rotation:.*?^\s*mode:).*$', r'\1 auto', s, flags=re.M|re.S)
open(p,'w').write(s)
PY
else
  printf '\nsession_rotation:\n  mode: auto\n  # [A 件 2026-10-12] run15 验证输入：auto-nudge 每发必中、空转形态占比清晰；report→auto\n  # 让位耗尽路径激活（T05 预算耗尽移交根治）。回退=mode: report。\n' >> "$CFG"
fi
grep -A1 '^session_rotation:' "$CFG"
echo "已翻转：session_rotation.mode=auto（下次网关启动生效；回退改 report）"
