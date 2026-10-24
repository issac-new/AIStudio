#!/usr/bin/env bash
# test-ai-judgment.sh — GATE_AI_JUDGMENT 开关测试（WP-R2-3）
# 复盘发现：Q2H-A 的开关只在 gates-advisory.sh 内部，precheck.conf 模板没有 → 用户无从发现，
# AI 自觉判断模式实为死代码。WP-R2-3 把开关入 conf 模板（${VAR:-默认} 保留环境变量优先）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
# WP6：物理位置随 enforce 聚合——按 precheck 真实装载顺序 source 三个聚合文件
ADV="assets/gates-strict.sh assets/gates-warn.sh assets/gates-advisory.sh"
TMP="$(mktemp -d /tmp/aij.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：conf 模板含 GATE_AI_JUDGMENT（可发现性回归）---
grep -q '^GATE_AI_JUDGMENT=' assets/precheck.conf \
  && ok "态1 precheck.conf 含 GATE_AI_JUDGMENT" || bad "态1 conf 缺 GATE_AI_JUDGMENT"
grep -q 'MEASURE:.*AI自觉判断\|AI.*自觉判断.*MEASURE' assets/precheck.conf || \
grep -q 'MEASURE:' <(grep '^GATE_AI_JUDGMENT=' assets/precheck.conf) \
  && ok "态1 含 MEASURE 元数据" || bad "态1 缺 MEASURE 元数据"

# --- 态 2：AI 自查短路只覆盖 3 个语义门禁；diagram 走两层（机械契约 + AI 检查单）---
# stub：pass/warn/fail/skip_if_unconfigured 最小实现（gates-advisory.sh 依赖）
cat > "$TMP/stub.sh" <<'SEOF'
pass() { echo "PASS: $*"; }
warn() { echo "WARN: $*"; }
fail() { echo "FAIL: $*"; }
skip_if_unconfigured() { echo "SKIP: $*"; return 0; }
SEOF
out=$(GATE_AI_JUDGMENT=1 bash -c '
  source "'"$TMP"'/stub.sh"
  for _f in '"$ADV"'; do source "$_f"; done
  for g in check_cognition check_diagram check_pr_quality check_consistency check_link_depth; do "$g"; done
' 2>&1)
for g in check_pr_quality check_consistency check_link_depth; do
  # ${g} 必须带括号——$g 紧跟多字节「（」在 bash 3.2 + UTF-8 locale 下会吞字节变 unbound（WP-R2-1 同坑）
  echo "$out" | grep -q "${g}（AI 自觉判断模式" \
    && ok "态2 $g 短路为 AI 自查" || bad "态2 $g 未短路: $(echo "$out" | grep "$g" | head -1)"
done
# R122：diagram 例外——客观契约机械查始终执行，不再短路为纯 AI 提示
echo "$out" | grep -q '图表生产检查' \
  && ok "态2 diagram 走机械契约分支（R122 两层）" || bad "态2 diagram 仍被短路"
echo "$out" | grep -q 'check_diagram（AI 自觉判断模式' \
  && bad "态2 diagram 仍输出 AI 短路头" || ok "态2 diagram 无 AI 短路头"
# R13 D1：AI 判断引导模式为唯一模式（机械计分退役）
echo "$out" | grep -q 'AI 判断引导模式' && ok "态2 cognition AI 判断引导（R13 唯一模式）" || bad "态2 缺 AI 判断引导标志"

# --- 态 3：默认（未设置）行为与显式开关一致；diagram 恒走两层 ---
out3=$(bash -c '
  source "'"$TMP"'/stub.sh"
  for _f in '"$ADV"'; do source "$_f"; done
  check_cognition
' 2>&1)
echo "$out3" | grep -q 'AI 判断引导模式' && ok "态3 默认亦走 AI 判断引导（R13：机械模式退役，唯一模式）" || bad "态3 缺 AI 判断引导标志"
# R13 D1：机械路径已退役——默认输出为 AI 判断引导 + notes 留痕提示（不出现旧机械报告头）
echo "$out3" | grep -qE '认知递进体检报告|认知体检报告' \
  && bad "态3 机械报告头残留（R13 已退役）" || ok "态3 无机械报告头（R13 退役确认）"
out3d=$(bash -c '
  source "'"$TMP"'/stub.sh"
  for _f in '"$ADV"'; do source "$_f"; done
  check_diagram
' 2>&1)
echo "$out3d" | grep -q '图表生产检查' \
  && ok "态3 默认 diagram 走机械契约分支" || bad "态3 默认 diagram 未走机械契约分支"

# --- 态 4：conf 的 ${VAR:-默认} 写法保留环境变量优先 ---
# source conf（set +u 包裹，与 precheck.sh 同语义），env=1 时 conf 不得覆盖回 0
out4=$(GATE_AI_JUDGMENT=1 bash -c '
  set +u
  source "assets/precheck.conf" 2>/dev/null || true
  set -u
  printf "%s" "${GATE_AI_JUDGMENT:-0}"
')
[[ "$out4" == "1" ]] && ok "态4 conf 保留环境变量优先（env=1 不被覆盖）" || bad "态4 env 被 conf 覆盖为 [$out4]"
# env 未设时 conf 默认 0
out5=$(bash -c '
  set +u
  source "assets/precheck.conf" 2>/dev/null || true
  set -u
  printf "%s" "${GATE_AI_JUDGMENT:-0}"
')
[[ "$out5" == "0" ]] && ok "态5 conf 保留 GATE_AI_JUDGMENT 兼容别名（R13 后行为恒 AI 模式）" || bad "态5 conf 默认值异常 [$out5]"

[[ $FAIL -eq 0 ]] && { echo "PASS test-ai-judgment"; exit 0; } || { echo "FAIL test-ai-judgment" >&2; exit 1; }
