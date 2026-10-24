#!/bin/bash
# test-report-paths.test.sh — 测试报告路径契约双兼容守门（run22 复盘根治①）
# run22 实锤：谓词只认 docs/test/<rfd>-test-report.md 而 agent 落
# docs/reports/TEST-<rfd>.md ——UAT fail-fast 永假，靠人工归位令解（00:29 事件）。
# 本测以隔离 git 夹具验证双路径判据逐项同款：存在+结论 PASS+新鲜度窗。
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
t() { if eval "$2"; then PASS=$((PASS+1)); echo "PASS $1"; else FAIL=$((FAIL+1)); echo "FAIL $1"; fi; }

# 函数装载：mx-lib 有 source 期副作用（部署/自愈），隔离夹具不整库 source——
# 按函数名从正本实时抽取函数体（awk 花括号配平），配最小桩（mx_fetch/evidence_baseline）。
# 抽取式装载仍测真实代码文本：正本改坏（如丢掉双路径回落）本测当场红。
extract_fn() { # <name> <file>
  awk -v fn="$1" '
    $0 ~ "^"fn"\\(\\)" { grab=1 }
    grab { print; if ($0 ~ /^\}/) exit }' "$2"
}
mkdir -p "$TMP/clone" && git -C "$TMP/clone" init -q -b main
git -C "$TMP/clone" config user.email t@t && git -C "$TMP/clone" config user.name t
export DIRECTOR_CLONE="$TMP/clone"
mx_fetch() { return 0; }                                   # 桩：夹具本地仓无 remote
evidence_baseline() { printf ''; }                         # 桩：空基线=新鲜度窗跳过（lite 语义）
# HERE=本测试所在 mux/ 目录（dirname $0/.. 从 mux/tests 上跳一级）
eval "$(extract_fn test_report_on_integration "$HERE/mx-scenario-lib.sh")"
type test_report_on_integration >/dev/null 2>&1 || { echo 'FATAL 谓词装载失败'; exit 1; }
git -C "$DIRECTOR_CLONE" update-ref refs/remotes/origin/integration/RFD-001 refs/heads/main

now=$(date +%s)
commit_report() { # <path> <content-line>
  mkdir -p "$DIRECTOR_CLONE/$(dirname "$1")"
  echo "$2" > "$DIRECTOR_CLONE/$1"
  git -C "$DIRECTOR_CLONE" add -A >/dev/null && git -C "$DIRECTOR_CLONE" commit -qm "add $1" >/dev/null
  git -C "$DIRECTOR_CLONE" update-ref refs/remotes/origin/integration/RFD-001 refs/heads/main
}

# 1) 契约路径（原口径回归）
commit_report "docs/test/RFD-001-test-report.md" "结论：TEST-PASS——七 spec 全绿"
t "契约路径 PASS 报告→真" 'test_report_on_integration RFD-001'

# 2) 汇总路径（run22 新口径）：契约路径文件改为 FAIL 占位（路径二才是唯一真值源）
commit_report "docs/test/RFD-001-test-report.md" "占位：见汇总路径"
commit_report "docs/reports/TEST-RFD-001.md" "结论：TEST-PASS——汇总版全绿"
t "汇总路径 PASS 报告→真（契约路径占位回落）" 'test_report_on_integration RFD-001'

# 3) FAIL 报告（两路径均为 FAIL）→假
commit_report "docs/reports/TEST-RFD-001.md" "结论：TEST-FAIL——阻塞"
t "FAIL 报告→假" '! test_report_on_integration RFD-001'

# 4) 无报告→假（两路径文件全部移除）
rm -f "$DIRECTOR_CLONE/docs/test/RFD-001-test-report.md" "$DIRECTOR_CLONE/docs/reports/TEST-RFD-001.md"
git -C "$DIRECTOR_CLONE" add -A >/dev/null && git -C "$DIRECTOR_CLONE" commit -qm "rm reports" >/dev/null
git -C "$DIRECTOR_CLONE" update-ref refs/remotes/origin/integration/RFD-001 refs/heads/main
t "无报告→假" '! test_report_on_integration RFD-001'

echo "== $PASS 过 / $FAIL 败 =="
[ "$FAIL" -eq 0 ]
