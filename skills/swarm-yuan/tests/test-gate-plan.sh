#!/usr/bin/env bash
# test-gate-plan.sh — gate-plan.sh 行为级回归测试（选择即证据：开工 plan 声明 / 收口 diff 对账）
# 契约：
#   --plan "enable:a,b|skip:x(理由),y(理由)" → 落盘 $PROJ/.swarm-yuan/gate-plan.json，echo 计数，exit 0
#   --diff → 对比 plan 声明集 vs gate-runs.jsonl 实际触发集，advisory 报告，exit 0（不一致也不阻断）
#   参数错误（缺/伪项目根、未知参数、缺 mode、--plan 缺值）→ exit 1
# 回归锁：plan 为单行 JSON，skip 违反对提取曾用贪心 sed 只取每行最后一个 "gate"，
#   多 skip 声明时非末位 gate 违反被漏检（2026-10-21 修复，态 12）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/gate-plan.sh"
TMP=$(mktemp -d /tmp/gpt.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

run_plan() { bash "$SH" "$1" --plan "$2" 2>&1; }

# --- 态 1：--plan 正常落盘（enable+skip 各 2 项，中文理由保留）---
mkdir -p "$TMP/p1"
out=$(run_plan "$TMP/p1" "enable:check_branch,check_test|skip:check_compliance(非合规项目),check_dengbao(无等保要求)"); rc=$?
[[ $rc -eq 0 ]] && ok "态1 plan 落盘 exit 0" || bad "态1 exit=${rc}: ${out}"
grep -qF '"enable":["check_branch","check_test"]' "$TMP/p1/.swarm-yuan/gate-plan.json" \
  && ok "态1 enable 数组正确" || bad "态1 enable 数组异常: $(cat "$TMP/p1/.swarm-yuan/gate-plan.json")"
grep -qF '{"gate":"check_compliance","reason":"非合规项目"}' "$TMP/p1/.swarm-yuan/gate-plan.json" \
  && ok "态1 skip 对象与中文理由保留" || bad "态1 skip 序列化异常"
echo "$out" | grep -qF 'enable 2 项，skip 2 项' && ok "态1 计数回显正确" || bad "态1 计数回显异常: ${out}"

# --- 态 2：--plan 仅 enable（无 | 分隔）→ skip 空数组 ---
mkdir -p "$TMP/p2"
out=$(run_plan "$TMP/p2" "enable:check_build"); rc=$?
[[ $rc -eq 0 ]] && grep -qF '"skip":[]' "$TMP/p2/.swarm-yuan/gate-plan.json" \
  && ok "态2 无 skip 段落盘为空数组" || bad "态2 skip 段异常: ${out} $(cat "$TMP/p2/.swarm-yuan/gate-plan.json" 2>/dev/null)"

# --- 态 3：--plan 列表项带空格容错（修剪后入库）---
mkdir -p "$TMP/p3"
run_plan "$TMP/p3" "enable: check_branch , check_test " >/dev/null 2>&1
grep -qF '"enable":["check_branch","check_test"]' "$TMP/p3/.swarm-yuan/gate-plan.json" \
  && ok "态3 列表空格被修剪" || bad "态3 空格未修剪: $(cat "$TMP/p3/.swarm-yuan/gate-plan.json")"

# --- 态 4：-h 帮助 exit 0 且含用法 ---
out=$(bash "$SH" -h 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -q '用法' && ok "态4 -h 输出用法" || bad "态4 -h 异常 rc=${rc}"

# --- 态 5-8：参数错误族 → exit 1 ---
out=$(bash "$SH" --diff 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -qF 'PROJECT_DIR 缺失或不存在' \
  && ok "态5 缺项目根 exit 1" || bad "态5 rc=${rc}: ${out}"
out=$(bash "$SH" "$TMP/no-such-dir" --diff 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态6 项目根不存在 exit 1" || bad "态6 rc=${rc}: ${out}"
out=$(bash "$SH" "$TMP" --bogus 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -qF '未知参数' && ok "态7 未知参数 exit 1" || bad "态7 rc=${rc}: ${out}"
out=$(bash "$SH" "$TMP" 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -q '用法' && ok "态8 缺 mode exit 1" || bad "态8 rc=${rc}: ${out}"
out=$(bash "$SH" "$TMP" --plan 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -q -- '--plan 需要' && ok "态9 --plan 缺值 exit 1" || bad "态9 rc=${rc}: ${out}"

# --- 态 10：--diff 无 plan 文件 → advisory 跳过 exit 0 ---
mkdir -p "$TMP/p10"
out=$(bash "$SH" "$TMP/p10" --diff 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '无 gate-plan' && ok "态10 未声明跳过 diff" || bad "态10 rc=${rc}: ${out}"

# --- 态 11：--diff 计划与实际一致 → ✓ 收口对账通过 ---
mkdir -p "$TMP/p11/.swarm-yuan/gate-runs"
run_plan "$TMP/p11" "enable:check_branch|skip:check_compliance(非合规项目)" >/dev/null 2>&1
printf '%s\n' '{"ts":"t1","run":1,"gate":"check_branch","status":"pass","ids":"","duration_s":1}' > "$TMP/p11/.swarm-yuan/gate-runs/gate-runs.jsonl"
out=$(bash "$SH" "$TMP/p11" --diff 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '计划与实际触发一致' && ok "态11 一致对账 ✓" || bad "态11 异常: ${out}"

# --- 态 12：skip 声明被违反——多 skip 声明全部检出（贪心 sed 漏检回归锁）---
mkdir -p "$TMP/p12/.swarm-yuan/gate-runs"
run_plan "$TMP/p12" "enable:check_test|skip:check_a(理由一),check_b(理由二)" >/dev/null 2>&1
printf '%s\n' \
  '{"ts":"t1","run":1,"gate":"check_test","status":"pass","ids":"","duration_s":1}' \
  '{"ts":"t2","run":2,"gate":"check_a","status":"pass","ids":"","duration_s":1}' \
  '{"ts":"t3","run":3,"gate":"check_b","status":"pass","ids":"","duration_s":1}' > "$TMP/p12/.swarm-yuan/gate-runs/gate-runs.jsonl"
out=$(bash "$SH" "$TMP/p12" --diff 2>&1); rc=$?
_violations=$(printf '%s' "$out" | grep -cF 'skip 声明被违反')
[[ $rc -eq 0 && "${_violations}" -eq 2 ]] && ok "态12 两个 skip 违反全检出" || bad "态12 检出 ${_violations} 个（应 2）: ${out}"

# --- 态 13：--diff 三类偏差各检出（missing_evidence / 计划外执行 / 汇总计数）---
mkdir -p "$TMP/p13/.swarm-yuan/gate-runs"
run_plan "$TMP/p13" "enable:check_branch,check_missing|skip:check_compliance(非合规项目)" >/dev/null 2>&1
printf '%s\n' \
  '{"ts":"t1","run":1,"gate":"check_branch","status":"pass","ids":"","duration_s":1}' \
  '{"ts":"t2","run":2,"gate":"check_extra","status":"pass","ids":"","duration_s":1}' > "$TMP/p13/.swarm-yuan/gate-runs/gate-runs.jsonl"
out=$(bash "$SH" "$TMP/p13" --diff 2>&1); rc=$?
echo "$out" | grep -qF 'missing_evidence: plan 启用但未触发 —— check_missing' \
  && ok "态13 missing_evidence 检出" || bad "态13 missing_evidence 缺失: ${out}"
echo "$out" | grep -qF '计划外执行（不在 enable/skip 声明中）—— check_extra' \
  && ok "态13 计划外执行检出" || bad "态13 计划外未检出: ${out}"
echo "$out" | grep -qF 'missing_evidence 1 项，计划外 1 项' \
  && ok "态13 汇总计数正确" || bad "态13 计数异常: ${out}"

# --- 态 14：--diff 有 plan 无 gate-runs → enable 全部记 missing_evidence，exit 0 ---
mkdir -p "$TMP/p14"
run_plan "$TMP/p14" "enable:check_branch,check_test" >/dev/null 2>&1
out=$(bash "$SH" "$TMP/p14" --diff 2>&1); rc=$?
_miss=$(printf '%s' "$out" | grep -cF 'missing_evidence: plan 启用但未触发')
[[ $rc -eq 0 && "${_miss}" -eq 2 ]] && ok "态14 无 runs 全记 missing_evidence" || bad "态14 检出 ${_miss} 个: ${out}"

[[ $FAIL -eq 0 ]] && { echo "PASS test-gate-plan"; exit 0; } || { echo "FAIL test-gate-plan" >&2; exit 1; }
