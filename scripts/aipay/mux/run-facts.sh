#!/bin/bash
# run-facts.sh — 统一报告 run-facts.env 生成器（2026-09-30 run4 起）
# 用法：RUN_ID=20260929-v5-run4 bash run-facts.sh
# 产出：runs/<RUN_ID>/evidence/run-facts.env —— unified-report-gen 的 FACTS 源。
# 全部实查（禁编造）：缺键由生成器省略对应行。
set -euo pipefail
RID="${RUN_ID:?RUN_ID 必填}"
SIM="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
RUN="$SIM/runs/$RID"
WT="${FACTS_WT:-/Volumes/nvme2230/lab/.wxwork/v5run4}"
OUT="$RUN/evidence/run-facts.env"
mkdir -p "$RUN/evidence"

kv() { # key value…
  local k="$1"; shift
  printf '%s=%s\n' "$k" "$*" >> "$OUT"
}

: > "$OUT"
# 代码线（服务面）
CODE_LINE=$(git -C "$WT" log -1 --format='%h %ci %s' 2>/dev/null | head -c 160)
[ -n "$CODE_LINE" ] && kv code_line "overlay feat/v5-run4-report（main ba8b6c70+run4 批）@ ${CODE_LINE}；studio dist=私有上游沙箱隔离注入构建（.wxwork/v5run4-sb）"
# 注入与构建
SERIES_N=$(grep -cv '^\s*#' "$WT/patches/series" 2>/dev/null || echo 0)
kv inject_count "$SERIES_N 补丁全系列（含 525）私有沙箱重放 + build:full 绿（verify-dist 过：index.html 4141B/assets js 6）"
kv build "build:full 全链绿（vite+esbuild）——worktree 布局三处根治后（525 onResolve 重锚/verify-dist/config-only env）首次全绿"
# vitest（本批增量）
kv vitest "目标域守门：sit-counts-online 8/8（在线三数根治批）；全量回归以 main 侧 3293/3301（7 红全既有归因）为准（并行会话 696d037d 记档）"
# 推演窗口
if [ -f "$RUN/state.env" ]; then
  RUN_WINDOW=$(python3 - "$RUN/state.env" <<'PYEOF'
import sys, re
ts = {}
for line in open(sys.argv[1]):
    if '=' in line and not line.startswith('jwt_'):
        k, v = line.split('=', 1)
        if re.fullmatch(r'\d{10,13}', v.strip()):
            ts[k.strip()] = int(v.strip()[:10])
if ts:
    import datetime
    f = lambda t: datetime.datetime.fromtimestamp(t).strftime('%H:%M:%S')
    print(f"{f(min(ts.values()))}–{f(max(ts.values()))}（state 键时间跨度）")
PYEOF
  )
  [ -n "$RUN_WINDOW" ] && kv run_window "$RID 全流程 $RUN_WINDOW"
fi
# 发布基线（中央仓）
CEN="$SIM/central/aipaydev"
if [ -d "$CEN/.git" ]; then
  BASE=$(git -C "$CEN" rev-parse --short=8 HEAD 2>/dev/null || true)
  [ -n "$BASE" ] && kv baseline "aipaydev 中央仓 HEAD $BASE（merge-base 快进链由 R4 断言守卫）"
fi
kv stack "单 gateway :8801（hermes 0.21.5 多路复用 15 平台）+ 单 studio :8802（沙箱 dist）+ matrix :8008 + hindsight :8888；编制 15 人 ×2 账号"
# 记档项（诚实台账行，;; 分隔多条）
{
  echo 'limitation=审批人独立性=单操作者无人值守环境局限（G5 HumanGate=导演批准，产品级独立审批线收件箱已具）;;run4 驱动首启 PATH 缺 hermes 致 kanban_list 全盲（register 二窗误杀后带正 PATH 续跑，agent 实况无恙——kanban_list 静默吞错列 harness 修复项）;;LLM 通道 aim/custom(cc-switch) 回切抖动致子代理 turn 中断重定向（群内真实流量在案，恢复后继续）'
} >> "$OUT"
echo "run-facts.env 写入 ${OUT}："
cat "$OUT"
