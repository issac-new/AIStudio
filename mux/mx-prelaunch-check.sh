#!/bin/bash
# mx-prelaunch-check.sh — 开跑前二十二项核验（一条命令收口；run15 前置 P3-8 起，⑩/⑪=run15 复盘补；⑭=2026-10-13 评测门禁三方同步；⑮=2026-10-13 run19 write_file 蛇足行守门；⑲=2026-10-17 V8.37 产品 IA 版本检查，2026-10-18 V8.44 扩为左栏/阶段页签/全流程推演/检索四组；⑳=2026-10-18 V8.42 Harness 运行底座编入检查；㉑=2026-10-18 V8.44 IDE 任务工作区端点；㉒=阶段页签与重定向矩阵）。
# 全绿才建议开跑；任一 FAIL 给出修复指引。幂等可重跑。
set -u
LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SR="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
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
ck "⑤ 服务健康（8801+8802，studio 带 OBS_SIM_ROOT）" "curl -sf -m 5 http://127.0.0.1:8801/health >/dev/null && curl -sf -m 5 http://127.0.0.1:8802/health/ready >/dev/null && _pid=\$(lsof -ti :8802 | head -1) && ps eww -p \"\$_pid\" | grep -q 'OBS_SIM_ROOT='" "bash mux/mx-up.sh 拉起；若 studio 已在跑但无 OBS_SIM_ROOT（推演端点会 503），先 bash mux/mx-down.sh 再 mx-up"

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

# ⑰ 监督器健康（run20 教训：监督器 15:31 静默死亡 5h+ 无察觉=run20 末段"全员静默"真因；
#     run21 起跑前清单新增）——脚本在位+语法过+可执行；上轮 supervisor 日志若有"unarmed"残留提示 re-arm。
ck "⑰ 监督器健康" "[ -f '$HERE/mux/run-driver-supervisor.sh' ] && bash -n '$HERE/mux/run-driver-supervisor.sh'" "监督器脚本缺失或语法坏——修复后再跑（run20 5h 静默死亡教训件；启动走 nohup bash 形态，x 位非必需）"

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
ck "⑮ 运行时树 write_file 无蛇足参数" "test -f '$SR/hermes-agent-src/tools/file_tools.py' && ! grep -q 'local_config=' '$SR/hermes-agent-src/tools/file_tools.py'" "git -C 宿主与 SIM 两树的 tools/file_tools.py 删 local_config= 实参行（正本=overlay patches/613-agent-action-fusion-then-run.patch 无此行；含语义差异：该行默认 persistent=False，lifecycle 内部默认 True，删行即恢复正本语义）。文件缺席=树未部署/路径漂移，属更严重配置错误，必须红（grep 对缺失文件 rc=2 被 ! 反转为绿是空真放行）"

# ⑯ 代偿清偿门（V8.29 §2.6.5，用户裁定 2026-10-15：代偿在下一轮推演开跑前必须
#     根治后合入 SwarmStudio 产品能力）。机械执法：读当前锚定轮（var/current-state.env
#     指向的最近一轮）的代偿台账 check-clearance——open 笔存在且未 waive 即红。
#     豁免通道=resolve（对应 PR 落码合入 main，带 commit 锚）或 waive（用户批准理由）。
ck "⑯ 代偿清偿门（上一轮台账 open=0）" "AIPAY_SIM_ROOT='$SR' bash '$HERE/mux/mx-compensation-ledger.sh' check-clearance >/dev/null 2>&1" "上一轮存在未清偿代偿：bash mux/mx-compensation-ledger.sh list --status open 看明细；根治合入产品（对应 PR 编号落码）后逐笔 resolve，或经用户批准 waive（带理由）"

# ⑱ 报告真值三件套在位（run20 复盘 fix/run20-report-truth-trio：4 件往轮产物冒充
#     交付物+13 件死锚+逐步问题单 27 处空渲染，审计四查全过照放）。判据源
#     report_truth.py 三处共用（生成器渲染/审计器查14/驱动 G3 闸证），守门=模块
#     可编译+三侧符号在位+守门测试绿——「修复只落一边」=下次生成复发（模板↔产物
#     双向同步纪律的真值面落地）。
ck "⑱ 报告真值三件套（判据源+三侧接线+守门测试）" "python3 -m py_compile '$HERE/mux/report_truth.py' && grep -q 'import report_truth' '$HERE/mux/mx-report-gen.py' && grep -q 'report-truth-findings.json' '$HERE/mux/mx-report-audit.py' && grep -q 'repo_branch_runtag' '$HERE/aipay-scenario.sh' && bash '$HERE/tests/report-truth-anchor.test.sh' >/dev/null 2>&1" "报告真值件缺位：report_truth.py 不可编译/生成器未接判据/审计器未读侧柜/驱动未接闸证轮次检查/守门测试红——按 docs/specs/2026-10-16-run20-report-truth-trio.md 接线后重跑"

# ⑲ 产品 IA 版本（V8.44 纪律 75：生效 studio dist 必须含左侧导航五组、阶段页签、
#     全流程推演与检索标记，防 V8.44 前旧 dist 上轮——旧 UI 拍出的帧与方案 §2.5 新锚
#     全部错位。生效面判定与 mx-lib 一致：product-dist 有 server 目录用之，否则回落 upstream dist）。
ck "⑲ 产品 IA 版本（左栏+阶段页签+全流程推演+检索在生效 dist）" "_d='$SR/product-dist'; [ -d \"\$_d/server\" ] || _d='$HERE/../upstream/hermes-studio/dist'; grep -rq 'stage/setup' \"\$_d\" 2>/dev/null && grep -rq 'ia2.journey' \"\$_d\" 2>/dev/null && grep -rq 'ia-side-nav' \"\$_d\" 2>/dev/null && grep -rq '五步进度' \"\$_d\" 2>/dev/null && grep -rq '全流程推演' \"\$_d\" 2>/dev/null && grep -rq 'ia2.search' \"\$_d\" 2>/dev/null" "生效 dist 不含左侧栏/阶段页签/全流程推演/检索标记——是 V8.44 前旧构建：cd overlay && npm run inject && npm run build 后刷新 SIM 快照（mux/mx-setup.sh 供给），再重跑本检查"

# ⑳ Harness 运行底座编入生效 dist（V8.42）：九层体检/过程质量/恢复判定/执法决策/
#    运行清单/预算六个新端点必须出现在生效构建里——旧 dist 起跑会让证据面整段缺席，
#    报告第 9 章「Harness 运行面」无数据可引。判据与⑲同源：product-dist 优先，回落 upstream dist。
ck "⑳ Harness 运行底座编入生效 dist" "_d='$SR/product-dist'; [ -d \"\$_d/server\" ] || _d='$HERE/../upstream/hermes-studio/dist'; grep -rq 'nine-layers' \"\$_d\" 2>/dev/null && grep -rq 'process-quality' \"\$_d\" 2>/dev/null && grep -rq 'resume-plan' \"\$_d\" 2>/dev/null && grep -rq 'policy-decisions' \"\$_d\" 2>/dev/null && grep -rq 'run-manifests' \"\$_d\" 2>/dev/null && grep -rq 'budget-status' \"\$_d\" 2>/dev/null" "生效 dist 不含 Harness 运行底座端点（nine-layers/process-quality/resume-plan/policy-decisions/run-manifests/budget-status）——是旧构建：cd overlay && npm run inject && npm run build 后刷新 SIM 快照（mux/mx-setup.sh 供给），再重跑本检查"

# ㉑ IDE 任务工作区端点编入生效 dist（V8.44）：步 18/25 的任务简报依赖
#     GET /api/ide/task-workspace?task=&board=；旧 dist 会让「任务工作区/任务会话」
#     两块整段缺席，报告图注与操作路径对不上。判据与⑲同源。
ck "㉑ IDE 任务工作区端点编入生效 dist" "_d='$SR/product-dist'; [ -d \"\$_d/server\" ] || _d='$HERE/../upstream/hermes-studio/dist'; grep -rq 'task-workspace' \"\$_d\" 2>/dev/null" "生效 dist 不含 /api/ide/task-workspace——是任务工作区批前旧构建：cd overlay && npm run inject && npm run build 后刷新 SIM 快照，再重跑本检查"

# ㉒ 阶段页签与重定向矩阵在位（V8.44）：六阶段页签化后，旧 /app/gov/* 深链必须
#     redirect 到阶段页（书签/通知零断链）；页签注册表缺位会让 ?tab= 全部回落默认签。
ck "㉒ 阶段页签与重定向矩阵在位" "_d='$SR/product-dist'; [ -d \"\$_d/server\" ] || _d='$HERE/../upstream/hermes-studio/dist'; grep -rq 'stage/accept' \"\$_d\" 2>/dev/null && grep -rq 'gov/org-assets' \"\$_d\" 2>/dev/null && grep -rq 'clearance' \"\$_d\" 2>/dev/null" "生效 dist 不含阶段页签或 /app/gov/* 重定向矩阵——按 overlay custom/client/ia2/{stage-tabs.ts,routes.ts} 重建后再试"

echo "=== 结果：${PASS} 过 / ${FAIL} 败 ==="
[ "$FAIL" -eq 0 ] && echo "全绿——可开跑（prelaunch 二十二项）" || { echo "有红项——修复后再跑"; exit 1; }
