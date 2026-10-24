#!/usr/bin/env bash
# test-gate-trends.sh — gate-trends.sh 零拦截清单四态语义 + fail-open 测试
# 语义契约（窗口=每门禁近 N 条记录）：
#   窗口内全 pass（执行≥1 且零 fail 零 warn）→ 入零拦截清单（季度质疑对象）
#   窗口内含 fail → 不入列；含 warn（warn 档按设计不阻断）→ 不入列；全 skip（沉睡信号归 adaptive-gating）→ 不入列
#   fail 在窗口外（更旧的记录）→ 不阻止入列
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/gate-trends.sh"
TMP=$(mktemp -d /tmp/gttest.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

J="$TMP/runs.jsonl"
# allpass：12 条 pass（窗口 10 全 pass）→ 入列
for i in $(seq 1 12); do echo "{\"ts\":\"2026-09-01T00:00:${i}\",\"gate\":\"check_allpass\",\"status\":\"pass\",\"ids\":\"\",\"duration_s\":1}"; done > "$J"
# hasfail：窗口内含 fail → 不入列
for i in 1 2 3 4 5 6 7 8 9; do echo "{\"ts\":\"2026-09-01T00:01:0${i}\",\"gate\":\"check_hasfail\",\"status\":\"pass\",\"ids\":\"\",\"duration_s\":1}"; done >> "$J"
echo '{"ts":"2026-09-01T00:01:10","gate":"check_hasfail","status":"fail","ids":"x","duration_s":1}' >> "$J"
# haswarn：全 warn → 不入列
for i in 1 2 3 4 5; do echo "{\"ts\":\"2026-09-01T00:02:0${i}\",\"gate\":\"check_haswarn\",\"status\":\"warn\",\"ids\":\"\",\"duration_s\":1}"; done >> "$J"
# allskip：全 skip → 不入列
for i in 1 2 3 4 5; do echo "{\"ts\":\"2026-09-01T00:03:0${i}\",\"gate\":\"check_allskip\",\"status\":\"skip\",\"ids\":\"\",\"duration_s\":0}"; done >> "$J"
# oldfail：fail 在窗口外（第 1 条 fail，其后 10 条 pass；窗口 10 内全 pass）→ 入列
echo '{"ts":"2026-09-01T00:04:01","gate":"check_oldfail","status":"fail","ids":"y","duration_s":1}' >> "$J"
for i in 2 3 4 5 6 7 8 9 10 11; do echo "{\"ts\":\"2026-09-01T00:04:${i}\",\"gate\":\"check_oldfail\",\"status\":\"pass\",\"ids\":\"\",\"duration_s\":1}"; done >> "$J"

out=$(bash "$SH" "$J" 10)
rc=$?
[[ $rc -eq 0 ]] && ok "exit 0" || bad "exit=$rc"
echo "$out" | grep -qF "=== 零拦截清单" && ok "零拦截清单段存在" || bad "清单段缺失: $out"
_zb=$(echo "$out" | sed -n '/=== 零拦截清单/,$p')
echo "$_zb" | grep -qF "check_allpass"  && ok "全 pass 入列"            || bad "check_allpass 应入列: $_zb"
echo "$_zb" | grep -qF "check_oldfail"  && ok "fail 在窗口外仍入列"      || bad "check_oldfail 应入列: $_zb"
echo "$_zb" | grep -qF "check_hasfail"  && bad "含 fail 不应入列: $_zb"  || ok "含 fail 不入列"
echo "$_zb" | grep -qF "check_haswarn"  && bad "含 warn 不应入列: $_zb"  || ok "含 warn 不入列"
echo "$_zb" | grep -qF "check_allskip"  && bad "全 skip 不应入列: $_zb"  || ok "全 skip 不入列"
echo "$_zb" | grep -qF "零拦截门禁数: 2" && ok "计数=2" || bad "计数异常: $_zb"

# --- fail-open：无 jsonl → 提示 + exit 0 ---
out=$(bash "$SH" "$TMP/nonexistent.jsonl" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF "未找到 gate-runs 证据文件" && ok "无数据 fail-open" || bad "fail-open 异常: rc=$rc out=$out"

# --- 空 jsonl → 提示 + exit 0 ---
: > "$TMP/empty.jsonl"
out=$(bash "$SH" "$TMP/empty.jsonl" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF "未找到 gate-runs 证据文件" && ok "空文件 fail-open" || bad "空文件异常: rc=$rc out=$out"

# --- HTML 模式：正常生成且脚本不因清单段报错 ---
bash "$SH" --html "$TMP/out.html" "$J" 10 >/dev/null 2>&1; rc=$?
[[ $rc -eq 0 && -s "$TMP/out.html" ]] && ok "HTML 模式生成" || bad "HTML 模式异常: rc=$rc"

[[ $FAIL -eq 0 ]] && { echo "PASS test-gate-trends"; exit 0; } || { echo "FAIL test-gate-trends" >&2; exit 1; }
