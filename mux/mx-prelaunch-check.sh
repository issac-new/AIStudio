#!/bin/bash
# mx-prelaunch-check.sh — run15 开跑前九项核验（一条命令收口，run15 前置 P3-8）。
# 全绿才建议开跑；任一 FAIL 给出修复指引。幂等可重跑。
set -u
LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SR="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
source "$HERE/mux/mx-platform.sh"   # 独立进程：pgrep/sqlite 走平台层（Git Bash 兼容）
PASS=0; FAIL=0
ck() { # <名> <命令串> <失败指引>
  local name="$1" cmd="$2" hint="$3" out
  if out=$(eval "$cmd" 2>&1); then
    echo "✓ ${name}"; PASS=$((PASS+1))
  else
    echo "✗ ${name}——${hint}"; echo "  输出: $(printf '%s' "$out" | head -3)"; FAIL=$((FAIL+1))
  fi
}

echo "=== run15 开跑前核验（$(date '+%F %T')）==="

# ① 守门测试全绿（jargon/门禁/隔离三件套）
ck "① 门禁测试套件" "bash '$HERE/tests/run-gates.sh' >/dev/null 2>&1" "跑 bash tests/run-gates.sh 看 FAIL 明细"

# ② 主脚本 bash 语法
ck "② 驱动主脚本语法" "bash -n '$HERE/aipay-scenario.sh'" "定位最近改动（bash -n 只查语法）"

# ③ 新接线静态断言（三段卡/缺陷环/预检/安全前置/采集告警在驱动源内）
ck "③ V8.8/V8.9 新接线在位" "grep -q 'uc_dispatched' '$HERE/aipay-scenario.sh' && grep -q 'int_dispatched' '$HERE/aipay-scenario.sh' && grep -q 'quality_dispatched' '$HERE/aipay-scenario.sh' && grep -q 'defect_cards_assignee_check' '$HERE/aipay-scenario.sh' && grep -q 'capture_preflight_ok' '$HERE/aipay-scenario.sh' && grep -q 'security_review_done' '$HERE/aipay-scenario.sh' && grep -q 'domains/run' '$HERE/aipay-scenario.sh' && grep -q 'npm audit --omit=dev' '$HERE/aipay-scenario.sh'" "grep 对应符号确认接线在 aipay-scenario.sh"

# ④ 双仓干净（simharness+overlay 无已跟踪未提交改动；未跟踪目录如 scratch/ 不计）
ck "④ 双仓工作区干净" "[ -z \"\$(git -C '$HERE' status --porcelain --untracked-files=no | head -1)\" ] && [ -z \"\$(git -C '$HERE/../overlay' status --porcelain --untracked-files=no 2>/dev/null | head -1)\" ]" "提交或暂存未提交改动"

# ⑤ 网关+studio 健康
ck "⑤ 服务健康（8801+8802）" "curl -sf -m 5 http://127.0.0.1:8801/health >/dev/null && curl -sf -m 5 http://127.0.0.1:8802/health/ready >/dev/null" "bash mux/mx-up.sh 拉起"

# ⑥ 中央仓谱系（本地=远端或线性领先）
ck "⑥ 中央仓 main 谱系" "git -C '$SR/central/aipaydev' fetch -q origin 2>/dev/null; _lb=\$(git -C '$SR/central/aipaydev' rev-list --count main..origin/main 2>/dev/null || echo 0); [ \"\$_lb\" = \"0\" ]" "中央仓本地 main 落后 origin N 提交：git -C central/aipaydev merge --ff-only origin/main 收敛"

# ⑦ 采集链就绪（playwright 依赖在 devDependencies+模块可解析）
ck "⑦ 采集链依赖（playwright）" "cd '$HERE' && node -e \"require.resolve('playwright')\"" "cd simharness && npm install（playwright 已在 devDependencies）"

# ⑧ 上轮报告四查（最近轮 evidence 在位且审计零 FAIL）
LAST_RUN=$(ls -1d "$SR"/runs/*/ 2>/dev/null | grep -E '/[0-9]{8}-v[0-9]+-run[0-9]+/$' | sort | tail -1)
# runs/ 已清场（mx-clean 后首跑）=无上轮在位，跳过该项判绿（首个新轮自身就是被检对象）
if [ -n "${LAST_RUN:-}" ]; then
  ck "⑧ 上轮报告审计零 FAIL" "python3 '$HERE/mux/mx-report-audit.py' --run \"\$(basename '${LAST_RUN}')\" 2>/dev/null | grep -q '四查全过'" "重跑 mx-report-audit --run <上轮> 看 FAIL"
else
  echo "✓ ⑧ 上轮报告审计零 FAIL（runs/ 已清场——无上轮在位，新轮首跑）"; PASS=$((PASS+1))
fi

# ⑨ run 间干净（无在途驱动/监督器/陈锁）
ck "⑨ 无在途推演进程" "! mxp_pgrep_f 'aipay-scenario.sh' | grep -q . && ! mxp_pgrep_f 'run-driver-supervisor' | grep -q ." "有残留驱动/监督器：确认后 touch stop 文件+kill（见独立监控手册）"

# ⑩ 推演域分支无上轮残留（run15 根治：run13 遗留 feat/DEV-PAYCORE-S 使 branch_fresh 恒假，
#    devimpl 等待环盲转 150min——锚读数也把陈旧提交当本路进展）。feat/DEV-* 是每轮开发
#    交付域分支，上轮未清=本轮真值锚必踩同坑；integration/* 是设计内跨轮续建不在清理面。
ck "⑩ 推演域分支无上轮残留" "[ -z \"\$(git -C '$SR/central/aipaydev' for-each-ref --format='%(refname:short)' refs/remotes/origin/feat/DEV-* 2>/dev/null | head -1)\" ]" "git -C central/aipaydev push origin --delete <分支>（或并入 mx-clean 清理面）"

echo "=== 结果：${PASS} 过 / ${FAIL} 败 ==="
[ "$FAIL" -eq 0 ] && echo "全绿——run15 可开跑" || { echo "有红项——修复后再跑"; exit 1; }
