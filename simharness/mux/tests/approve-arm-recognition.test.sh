#!/bin/bash
# 守门：审批臂识别面（run14 18:1x chen 卡死根治件）。run14 实锤两层缺口——
# ①扫描窗口 20 条在六路并发+噪音下几十秒翻页，正式请求滚出窗口→超时卡死；
# ②agent 散文式征求（"征求同意/等待批准"普通消息）正式匹配器不可见→沉默卡死。
# 本守门断言两层修复在位：窗口 ≥60；二层引导匹配器与 GUIDED 去重在位；
# 引导消息 JSON 由 jq 构造（手写转义曾致引号永不闭合击杀 lib 语法）。
set -u
cd "$(dirname "$0")/../.."
LIB=mux/mx-scenario-lib.sh
fails=0
# ① 窗口 20→60（auto_approve 内两处 60）
n=$(awk '/^auto_approve\(\)/,/^}/' "$LIB" | grep -c '"$room" 60')
[ "$n" -ge 2 ] || { echo "FAIL 审批臂扫描窗口未扩到 60（找到 ${n} 处，需 ≥2——窗口过窄请求滚页卡死）"; fails=1; }
# ② 二层散文征求引导在位
grep -q '征求同意|征求批准|请求批准' "$LIB" || { echo "FAIL 二层散文征求匹配器缺席（run14 chen 卡死面复发）"; fails=1; }
grep -q '待会签' "$LIB" || { echo "FAIL 会签类等待匹配缺席（run14 20:5x fei 用例骨架待签静默退出面复发）"; fails=1; }
grep -q 'GUIDED ' "$LIB" || { echo "FAIL GUIDED 去重台账写入缺席（引导风暴面）"; fails=1; }
grep -q 'approve-nudge-last.ts' "$LIB" || { echo "FAIL 引导全局节流缺席"; fails=1; }
# ③ 引导 JSON 走 jq 构造（禁手写反斜杠转义——run14 实锤语法击杀）
awk '/^auto_approve\(\)/,/^}/' "$LIB" | grep -A2 '_ga_json=' | grep -q 'jq -nc' || { echo "FAIL 引导消息未走 jq 构造（手写转义击杀语法风险）"; fails=1; }
[ "$fails" -eq 0 ] && echo 'PASS approve-arm-recognition（窗口 60+二层引导+GUIDED 去重+jq 构造）'
exit "$fails"
