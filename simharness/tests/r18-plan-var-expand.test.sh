#!/bin/bash
# r18-plan-var-expand.test.sh — capture-plan.env 规划行 URL 参数展开守门（run23 收官批）
# 六断言（违一即 FAIL），实现单一事实源=mux/r18-plan-vars.mjs（射手与测试共用，禁副本）：
#   ①变量在位：${IDE_TASK} 以 env 值替换。
#   ②未设/空串回落：${IDE_TASK:-锚} 展开为锚（空串视同未设，与 bash ${VAR:-} 语义一致）。
#   ③无变量行原样；无缺省且未设=保留字面量（日志可见未注入，不静默清成空串）。
#   ④多变量与裸 ${VAR} 混排展开正确。
#   ⑤射手接线在位：r18-frames.mjs 必须真的调用共享实现（漏接线=测试测了个孤儿模块）。
#   ⑥capture-plan.env 两行 IDE 拍摄位已参数化（改回写死即红——run23 陈旧任务号复发防线）。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

RUN_NODE() { node --input-type=module -e "$1"; }

T1=$(RUN_NODE "
import { expandPlanVars } from 'file://$HERE/mux/r18-plan-vars.mjs'
process.stdout.write(expandPlanVars('/app/ide?task=\${IDE_TASK:-t_af224933}', { IDE_TASK: 'DEV-CHWX-S1' }))
")
[ "$T1" = "/app/ide?task=DEV-CHWX-S1" ] && echo "PASS ① 变量在位替换" || { echo "FAIL ① 得到：$T1"; fails=$((fails+1)); }

T2A=$(RUN_NODE "
import { expandPlanVars } from 'file://$HERE/mux/r18-plan-vars.mjs'
process.stdout.write(expandPlanVars('/app/ide?task=\${IDE_TASK:-t_af224933}', {}))
")
[ "$T2A" = "/app/ide?task=t_af224933" ] && echo "PASS ②a 未设回落缺省" || { echo "FAIL ②a 得到：$T2A"; fails=$((fails+1)); }
T2B=$(RUN_NODE "
import { expandPlanVars } from 'file://$HERE/mux/r18-plan-vars.mjs'
process.stdout.write(expandPlanVars('/app/ide?task=\${IDE_TASK:-t_af224933}', { IDE_TASK: '' }))
")
[ "$T2B" = "/app/ide?task=t_af224933" ] && echo "PASS ②b 空串视同未设" || { echo "FAIL ②b 得到：$T2B"; fails=$((fails+1)); }

T3A=$(RUN_NODE "
import { expandPlanVars } from 'file://$HERE/mux/r18-plan-vars.mjs'
process.stdout.write(expandPlanVars('/app/stage/accept?tab=g5', {}))
")
[ "$T3A" = "/app/stage/accept?tab=g5" ] && echo "PASS ③a 无变量行原样" || { echo "FAIL ③a 得到：$T3A"; fails=$((fails+1)); }
T3B=$(RUN_NODE "
import { expandPlanVars } from 'file://$HERE/mux/r18-plan-vars.mjs'
process.stdout.write(expandPlanVars('/app/ide?task=\${IDE_TASK}', {}))
")
[ "$T3B" = '/app/ide?task=${IDE_TASK}' ] && echo "PASS ③b 无缺省未设保留字面量" || { echo "FAIL ③b 得到：$T3B"; fails=$((fails+1)); }

T4=$(RUN_NODE "
import { expandPlanVars } from 'file://$HERE/mux/r18-plan-vars.mjs'
process.stdout.write(expandPlanVars('/\${A:-x}/\${B}/\${C:-z}', { A: 'app', B: 'ide' }))
")
[ "$T4" = "/app/ide/z" ] && echo "PASS ④ 多变量混排" || { echo "FAIL ④ 得到：$T4"; fails=$((fails+1)); }

grep -q "expandPlanVars(PLAN_URL)" "$HERE/mux/r18-frames.mjs" && grep -q "from './r18-plan-vars.mjs'" "$HERE/mux/r18-frames.mjs" \
  && echo "PASS ⑤ 射手接线在位（r18-frames 调共享实现）" \
  || { echo "FAIL ⑤ r18-frames.mjs 未接 expandPlanVars 共享实现"; fails=$((fails+1)); }

grep -q 'devimpl_done|/app/ide?task=${IDE_TASK:-' "$HERE/mux/capture-plan.env" \
  && grep -q 'ide_done|/app/ide?task=${IDE_TASK:-' "$HERE/mux/capture-plan.env" \
  && echo "PASS ⑥ capture-plan.env IDE 两行参数化在位" \
  || { echo "FAIL ⑥ capture-plan.env IDE 拍摄位未参数化"; fails=$((fails+1)); }

[ "$fails" -eq 0 ] && echo "r18-plan-var-expand: ALL-PASS" || { echo "r18-plan-var-expand: ${fails} FAIL"; exit 1; }
