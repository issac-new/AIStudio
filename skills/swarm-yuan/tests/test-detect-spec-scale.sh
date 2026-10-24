#!/usr/bin/env bash
# test-detect-spec-scale.sh — detect-spec-scale.sh 行为级回归测试（从 spec 文件推断规模等级）
# 契约：
#   用法 detect-spec-scale.sh <spec.md>；stdout 最后一行为等级词（简单|标准|完整），详情走 stderr
#   推断规则（质量优先，不确定升档）：
#     架构变更信号 → 完整（强制）；风险信号 ≥2 → 完整；侵入点 >10 行 → 完整
#     任一风险信号 → 标准；侵入点 4-10 行 → 标准；1-3 行 → 简单；无法解析 → 标准（保守）
#   计数口径：侵入点=含反引号的行数（grep -c 行语义），风险信号=含风险词的行数
#   无参数 → exit 1；spec 不存在 → stdout「未知」exit 0
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/detect-spec-scale.sh"
TMP=$(mktemp -d /tmp/dss.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

run_spec() { bash "$SH" "$1" 2>"$TMP/err"; }

# 生成 N 行反引号侵入点 spec（每行一个反引号路径 → 行数=侵入点数）
mk_invasion() { # $1=文件 $2=行数
  local i="$2"
  : > "$1"
  while [[ "${i}" -gt 0 ]]; do printf '修改 `src/invade%02d.ts` 的逻辑\n' "${i}" >> "$1"; i=$((i-1)); done
}

# --- 态 1：无参数 → exit 1 + Usage ---
out=$(bash "$SH" 2>"$TMP/err"); rc=$?
[[ $rc -eq 1 ]] && grep -q 'Usage' "$TMP/err" && ok "态1 无参 exit 1" || bad "态1 rc=${rc}: ${out}"

# --- 态 2：spec 不存在 → stdout 未知，exit 0 ---
out=$(run_spec "$TMP/no-such-spec.md"); rc=$?
[[ $rc -eq 0 && "$out" == "未知" ]] && grep -qF 'spec 文件不存在' "$TMP/err" \
  && ok "态2 缺 spec → 未知" || bad "态2 rc=${rc} out=${out}"

# --- 态 3：空 spec → 保守标准 ---
: > "$TMP/s_empty.md"
out=$(run_spec "$TMP/s_empty.md"); rc=$?
[[ $rc -eq 0 && "$out" == "标准" ]] && grep -qF '无法解析侵入点' "$TMP/err" \
  && ok "态3 空 spec 保守标准" || bad "态3 out=${out}"

# --- 态 4-7：侵入点行数分档（1→简单 / 3→简单边界 / 4→标准 / 10→标准边界 / 11→完整）---
mk_invasion "$TMP/s1.md" 1
out=$(run_spec "$TMP/s1.md")
[[ "$out" == "简单" ]] && grep -qF '≤3 且无风险信号 → 简单' "$TMP/err" && ok "态4 1 侵入点简单" || bad "态4 out=${out}"
mk_invasion "$TMP/s3.md" 3
out=$(run_spec "$TMP/s3.md")
[[ "$out" == "简单" ]] && ok "态5 3 侵入点简单（边界含）" || bad "态5 out=${out}"
mk_invasion "$TMP/s4.md" 4
out=$(run_spec "$TMP/s4.md")
[[ "$out" == "标准" ]] && grep -qF '4-10 → 标准' "$TMP/err" && ok "态6 4 侵入点标准" || bad "态6 out=${out}"
mk_invasion "$TMP/s10.md" 10
out=$(run_spec "$TMP/s10.md")
[[ "$out" == "标准" ]] && ok "态7 10 侵入点标准（边界含）" || bad "态7 out=${out}"
mk_invasion "$TMP/s11.md" 11
out=$(run_spec "$TMP/s11.md")
[[ "$out" == "完整" ]] && grep -qF '>10 → 完整' "$TMP/err" && ok "态8 11 侵入点完整" || bad "态8 out=${out}"

# --- 态 9：单风险信号压过简单档（1 侵入点 + 权限 → 标准）---
mk_invasion "$TMP/s_risk1.md" 1
printf '本次改动涉及权限校验\n' >> "$TMP/s_risk1.md"
out=$(run_spec "$TMP/s_risk1.md")
[[ "$out" == "标准" ]] && grep -qF '1 个风险信号' "$TMP/err" && ok "态9 单风险升标准" || bad "态9 out=${out}: $(cat "$TMP/err")"

# --- 态 10：双风险信号 → 完整（跨服务 + 数据模型各占一行）---
mk_invasion "$TMP/s_risk2.md" 1
printf '存在跨服务调用\n涉及数据模型变更\n' >> "$TMP/s_risk2.md"
out=$(run_spec "$TMP/s_risk2.md")
[[ "$out" == "完整" ]] && grep -qF '2 个风险信号' "$TMP/err" && ok "态10 双风险完整" || bad "态10 out=${out}: $(cat "$TMP/err")"

# --- 态 11：单行含两个风险词只计 1（grep -c 行数语义）---
mk_invasion "$TMP/s_riskline.md" 1
printf '存在跨服务调用与数据模型变更\n' >> "$TMP/s_riskline.md"
out=$(run_spec "$TMP/s_riskline.md")
[[ "$out" == "标准" ]] && grep -qF '风险信号 1' "$TMP/err" && ok "态11 同行双词计 1 行" || bad "态11 out=${out}: $(cat "$TMP/err")"

# --- 态 12-13：架构变更强制完整（零侵入点也升档；新上下文同属该正则）---
printf '本次为架构变更，重构模块边界\n' > "$TMP/s_arch.md"
out=$(run_spec "$TMP/s_arch.md")
[[ "$out" == "完整" ]] && grep -qF '架构变更信号' "$TMP/err" && ok "态12 架构变更强制完整" || bad "态12 out=${out}"
printf '引入新上下文进行拆分\n' > "$TMP/s_ctx.md"
out=$(run_spec "$TMP/s_ctx.md")
[[ "$out" == "完整" ]] && ok "态13 新上下文强制完整" || bad "态13 out=${out}: $(cat "$TMP/err")"

# --- 态 14：stderr 详情含三计数（侵入点/风险信号/架构变更）---
out=$(run_spec "$TMP/s_risk1.md" 2>/dev/null)
run_spec "$TMP/s_risk1.md" >/dev/null
grep -qF '侵入点 1/风险信号 1/架构变更 0' "$TMP/err" \
  && ok "态14 详情三计数" || bad "态14 详情异常: $(cat "$TMP/err")"

# --- 态 15：stdout 最后一行恰为等级词（无多余输出）---
out=$(run_spec "$TMP/s11.md")
_last=$(printf '%s\n' "$out" | tail -1)
[[ "$_last" == "完整" && "$(printf '%s\n' "$out" | grep -c .)" -eq 1 ]] \
  && ok "态15 stdout 单行等级词" || bad "态15 stdout=${out}"

[[ $FAIL -eq 0 ]] && { echo "PASS test-detect-spec-scale"; exit 0; } || { echo "FAIL test-detect-spec-scale" >&2; exit 1; }
