#!/bin/bash
# mx-prelaunch-check.sh — 开跑前十五项核验（一条命令收口；run15 前置 P3-8 起，⑩/⑪=run15 复盘补；⑭=2026-10-13 评测门禁三方同步；⑮=2026-10-13 run19 write_file 蛇足行守门）。
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

echo "=== 下一轮开跑前核验（$(date '+%F %T')）==="

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

# ⑪ 按轮叙事注册与骨架兜底在位（run15 复盘：连续两轮漏预写注册的机制化收口——
#    ①上一完成轮已注册进合并器（每轮收官后推进键位，漏注册此处即红）②生成器 R17
#    骨架兜底在位（未注册轮不再一票否决，防报告步失败循环）③骨架工具语法可用）。
ck "⑪ 叙事注册与骨架兜底" "grep -q '20261012-v8-run16' '$HERE/mux/final-report-merge.py' && grep -q '骨架占位·待补注册' '$HERE/mux/mx-report-gen.py' && python3 -m py_compile '$HERE/mux/mx-narrative-skeleton.py'" "上轮 PART1 未注册（进 final-report-merge.py 的 PART1_BY_RUN）或骨架兜底符号缺失——按轮补注册后再跑"
echo "  ↳ 起跑后第一收获窗内用 mx-narrative-skeleton.py 起稿本轮注册（R17 骨架兜底只防拒出报告，不替代真实叙事）"

# ⑫ 账号板供给在位（run16 首跑实锤：mx-clean --apply 归档清走全部账号板，板供给在
#     mx-setup 第 5 段——「clean 后首跑」路径缺供给即驱动步 5 必炸「板元数据缺失」）。
#     判据/供给循环见 mux/mx-board-supply-check.sh 头注释。
ck "⑫ 账号板供给在位" "bash '$HERE/mux/mx-board-supply-check.sh' | grep -q '账号板供给齐'" "缺板/缺围栏——按 mux/mx-board-supply-check.sh 头注释的供给循环补建（mx-setup 第 5 段同款幂等）"

# ⑬ 独立审批环在位（run16 实证：审批臂内嵌驱动，熔断证据等待期修复链审批饿死——
#     两笔 execute_code 被拒实锤。常驻件 mx-approval-proxy.sh 随监督器同刻起：
#     nohup bash mux/mx-approval-proxy.sh --run <RUN_ID> >/dev/null 2>&1 &）
ck "⑬ 独立审批环可启动" "bash -n '$HERE/mux/mx-approval-proxy.sh' && grep -q 'needs your OK' '$HERE/mux/mx-approval-proxy.sh'" "mx-approval-proxy.sh 缺席或语法坏——审批臂独立化的常驻件（run16 事故固化；路径勘误 2026-10-13：grep 面与 bash -n 同为 mux/ 下）"

# ⑭ 评测门禁三方同步在位（2026-10-13 腾讯评测体系轮：test-report 模板评测节 /
#     spec-params 阈值组 / 生成器步 19 核对正则——只修一处=下次生成复发，
#     步 20 模板↔产物双向同步纪律的评测面落地；守门=tests/eval-metrics-template-sync.test.ts）
ck "⑭ 评测门禁三方同步" "grep -q '评测与运行时指标' '$HERE/mux/templates-pending/test-report.md' && grep -q 'EVAL_GATE_TOOL_SUCCESS_MIN' '$HERE/mux/spec-params.env' && grep -q '评测节在场' '$HERE/mux/mx-report-gen.py'" "test-report 模板/spec-params.env/mx-report-gen.py 三处评测面漂移——按 templates-pending/README.md「评测指标节」四同步位对齐（锚勘误 2026-10-13：生成器锚=评测节在场，与 eval-metrics-template-sync.test.ts 同源）"

# ⑮ 运行时树 write_file 链路健康（run19 实锤：宿主树手工部署 Action Fusion 时
#     画蛇添足加 local_config= 实参，撞 _create_configured_env 签名 TypeError——
#     chen/fanfan/hu/xiao 全员 write_file 报错被迫 execute_code 绕行，SIM 树 15:52
#     快照宿主 dirty 态被带入。正本=overlay patches/613 无此行；本检查钉「运行时
#     树无蛇足行」——手工部署再抄歪即起跑前红，不靠人眼）。
ck "⑮ 运行时树 write_file 无蛇足参数" "! grep -q 'local_config=' '$SR/hermes-agent-src/tools/file_tools.py'" "git -C 宿主与 SIM 两树的 tools/file_tools.py 删 local_config= 实参行（正本=overlay patches/613-agent-action-fusion-then-run.patch 无此行；含语义差异：该行默认 persistent=False，lifecycle 内部默认 True，删行即恢复正本语义）"

echo "=== 结果：${PASS} 过 / ${FAIL} 败 ==="
[ "$FAIL" -eq 0 ] && echo "全绿——可开跑（prelaunch 十五项）" || { echo "有红项——修复后再跑"; exit 1; }
