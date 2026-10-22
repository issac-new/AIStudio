#!/bin/bash
# verdict-parser-retrial.test.sh — 判词解析器 round 注记族守门（run22 复盘根治②）
# run22 实锤（9h 卡终态死锁）：评审复审轮判词行天然写「结论（roundN，改判…）：X」，
# 锚点后括号注记不在分隔符类=整行被拒，body 历史 FAIL 成末判词=PASS 终态永读成 FAIL。
# 白名单剥离（只剥 roundN 精确形态）后各格式判读 + 两类污染回显仍拒（run2/run12 防回归）。
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
t() { # <desc> <input> <expected>
  got="$(mx_text_gate_verdict READY-GATE "$2")"
  if [ "$got" = "$3" ]; then PASS=$((PASS+1)); echo "PASS $1";
  else FAIL=$((FAIL+1)); echo "FAIL $1（得=${got:-空} 期=$3）"; fi
}
# 抽取式装载（mx-lib 有 source 期副作用，隔离夹具不整库 source）
extract_fn() { awk -v fn="$1" '$0 ~ "^"fn"\\(\\)" { grab=1 } grab { print; if ($0 ~ /^\}/) exit }' "$2"; }
eval "$(extract_fn mx_text_gate_verdict "$HERE/mx-scenario-lib.sh")"
type mx_text_gate_verdict >/dev/null 2>&1 || { echo 'FATAL 装载失败'; exit 1; }

# 原口径回归
t "原格式：结论：PASS"            '结论：READY-GATE-PASS（八节全过）'                       PASS
t "原格式：结论：FAIL"            '结论：READY-GATE-FAIL（缺项）'                           FAIL
t "行首 token"                    'READY-GATE-PASS round12 复核'                            PASS
# run22 死锁格式族（修复目标）
t "roundN 纯轮号 PASS"            '结论（round12）：READY-GATE-PASS——清零'                 PASS
t "roundN 改判重报 PASS（9h 死锁主格式）" '结论（round12，改判重报）: READY-GATE-PASS——阻断缺项清零'  PASS
t "roundN 改判 FAIL"              '结论（round11，改判）: READY-GATE-FAIL（维持）'           FAIL
t "roundN 维持 FAIL"              '结论（round9）：READY-GATE-FAIL（总判词维持）'            FAIL
t "成对过渡取末判词"              '结论（round3，改判）: READY-GATE-FAIL → READY-GATE-PASS'  PASS
# 污染防回归（白名单不放宽的证明）
t "指令回显仍拒（结论行写 X）"    '结论行写 READY-GATE-PASS'                                ''
t "转述或行仍拒"                  '结论行：READY-GATE-PASS 或 READY-GATE-FAIL'              ''
t "非 round 括注仍拒"             '结论（某某转述）：READY-GATE-PASS'                       ''

echo "== $PASS 过 / $FAIL 败 =="
[ "$FAIL" -eq 0 ]
