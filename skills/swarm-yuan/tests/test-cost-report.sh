#!/usr/bin/env bash
# test-cost-report.sh — cost-report.sh 节点耗时段双态测试（WP-P0）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/cost-report.sh"
TMP=$(mktemp -d /tmp/crtest.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：started/done 配对，耗时可算 ---
mkdir -p "$TMP/proj/.swarm-yuan"
cat > "$TMP/proj/.swarm-yuan/trace.jsonl" <<'EOF'
{"ts":"2026-07-23T10:00:00Z","node":"Step4","actor":"ai","tool":"explore","status":"started","note":""}
{"ts":"2026-07-23T10:00:05Z","node":"Step4","actor":"ai","tool":"explore","status":"done","note":""}
{"ts":"2026-07-23T10:01:00Z","node":"Step8","actor":"ai","tool":"conf","status":"started","note":""}
{"ts":"2026-07-23T10:01:30Z","node":"Step8","actor":"ai","tool":"conf","status":"fail","note":""}
{"ts":"2026-07-23T10:02:00Z","node":"Step9","actor":"ai","tool":"orphan","status":"started","note":""}
EOF
out=$(bash "$SH" --dir "$TMP/proj" --stdout)
rc=$?
[[ $rc -eq 0 ]] && ok "exit 0" || bad "exit=$rc"
echo "$out" | grep -qF "按节点耗时" && ok "耗时段存在" || bad "耗时段缺失: $out"
echo "$out" | grep -qE "Step4	explore	5	done" && ok "Step4 耗时 5s" || bad "Step4 耗时异常: $out"
echo "$out" | grep -qE "Step8	conf	30	fail" && ok "Step8 耗时 30s(fail 也配对)" || bad "Step8 耗时异常"
# 「orphan」会出现在上方「按工具」Top10 段，故截取耗时段起至末尾再查
_dur=$(echo "$out" | sed -n '/按节点耗时/,$p')
echo "$_dur" | grep -qF "orphan" && bad "未配对 started 不应出现在耗时段" || ok "未配对不输出"

# --- 态 2：无 trace.jsonl → 提示 + exit 0（fail-open 不变）---
out=$(bash "$SH" --dir "$TMP/empty" --stdout 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF "无追踪数据" && ok "无数据 fail-open" || bad "态2 异常: rc=$rc out=$out"

[[ $FAIL -eq 0 ]] && { echo "PASS test-cost-report"; exit 0; } || { echo "FAIL test-cost-report" >&2; exit 1; }
