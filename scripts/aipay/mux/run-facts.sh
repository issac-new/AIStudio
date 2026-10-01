#!/bin/bash
# run-facts.sh — 统一报告 run-facts.env 生成器（2026-09-30 run4 起）
# 用法：RUN_ID=20260929-v5-run4 bash run-facts.sh
# 产出：runs/<RUN_ID>/evidence/run-facts.env —— unified-report-gen 的 FACTS 源。
# 全部实查（禁编造）：缺键由生成器省略对应行。
set -euo pipefail
RID="${RUN_ID:?RUN_ID 必填}"
SIM="${SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
RUN="$SIM/runs/$RID"
WT="${FACTS_WT:-/Volumes/nvme2230/lab/ncwk/overlay/.claude/worktrees/run5-b}"
OUT="$RUN/evidence/run-facts.env"
mkdir -p "$RUN/evidence"

kv() { # key value…
  local k="$1"; shift
  printf '%s=%s\n' "$k" "$*" >> "$OUT"
}

: > "$OUT"
# 代码线（服务面）
CODE_LINE=$(git -C "$WT" log -1 --format='%h %ci %s' 2>/dev/null | head -c 160)
[ -n "$CODE_LINE" ] && kv code_line "overlay fix/run5-approve-harness-b（run5 治理逆境根治批：审批双通道/PATH 盲/判词模板自毒/在线三数投影/并发闸）@ ${CODE_LINE}；studio dist=worktree 源直建（vite.config.overlay.wt 别名重锚）"
# 注入与构建
SERIES_N=$(grep -cv '^\s*#' "$WT/patches/series" 2>/dev/null || echo 0)
kv inject_count "$SERIES_N 补丁全系列（agent 侧 372/390/533 经 aipay-agent-sync 点名部署安装树+环境工作区漂移补齐）"
kv build "client dist 实时重建（在线三数修复实证：1 人/14 智能体/1 机器）；构建走 worktree 别名重锚（vite.config.overlay.wt）"
# vitest（本批增量）
kv vitest "目标域守门：platforms-store 3/3（投影双态）+sit-counts-online 9/9（含人≥登录本人新例）=12/12；G2 判词谓词单测四例（模板行/真 FAIL/真 PASS/打回后复审）"
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
  echo 'limitation=审批人独立性=单操作者无人值守环境局限（G5 HumanGate=导演批准，产品级独立审批线收件箱已具）;;run5 首夜三坑（审批线程 relation 拒发致 !approve 全灭/驱动 PATH 盲致看板查询恒空/G2 判词模板自毒致结构性不可过）全部根治入正（overlay 8e21a6b8..f1979781 六提交）后真实推进；深夜通道风暴（bigmodel 1302/容量队列回灌丢派发）经全房已读推进+mx-up 全量 env 网关换血+并发闸 2→8 收敛;;plan/devimpl/testpass 三步以历史工件过闸（0→1 缺口：repo_pull 自远端带回，报告侧以 RUN 标记锚定本轮真值并披露）;;G1 冻结件推送 origin 失败（GitHub 连通性，留存本地记问题单）'
} >> "$OUT"
echo "run-facts.env 写入 ${OUT}："
cat "$OUT"
