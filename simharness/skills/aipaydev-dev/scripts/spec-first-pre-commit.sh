#!/usr/bin/env bash
# spec-first-pre-commit.sh — L2 提交时强拦（git pre-commit；R101 四层拦截模型的提交面）
#
# 动机：写时拦截（L1 fail-gate-hook）依赖宿主 hook 机制，Cursor/Windsurf/OpenCode/
# Gemini/Kimi 等无 hook 宿主此前只有 advisory 规则文件——AI 不遵守等于没有。git pre-commit
# 是宿主无关的真拦截点（exit 1 = git 拒绝提交），覆盖全部宿主。
#
# 判据与四层同源（spec-first-lib.sh，spf_*）：
#   L1 写时 fail-gate-hook（Write/Edit deny）｜L2 本钩（commit 拒绝）
#   L3 门禁时 precheck check_spec_first（--all fail）｜L4 准入 state-machine guard build
# 拦截条件（全部满足才拦）：SPEC_REQUIRED=1 ∧ staged 文件触及 WRITABLE_DIRS ∧
#   SPEC_GLOB 无已批准 spec（含「## 决策记录」段且非占位）∧ SKILL.md 非 draft。
# 放行（fail-open，与 L1 同失败哲学）：判定库/conf 缺失、开关未启用、WRITABLE_DIRS 未配、
#   draft 骨架期、staged 为空或不触及可写区、已有已批准 spec。
# 逃生门披露：git commit --no-verify 跳过本钩（git 标准机制）——刻意绕过由 L3 门禁与
#   L4 状态机 build 准入兜底，deny 落盘 gate-deny.jsonl 可审计。
#
# 退出码：0=放行/豁免；1=拦截。装配/卸载见 generate-skill.sh Step 9（core.hooksPath）。
set -uo pipefail

_self="$(cd "$(dirname "$0")" && pwd)"

# 定位判定库与 conf（目标技能布局 scripts/ 同目录；生成器仓/测试布局 assets/hooks/ 上级）
SPF_LIB=""
for _cand in "${_self}/spec-first-lib.sh" "${_self}/../spec-first-lib.sh"; do
  [[ -f "$_cand" ]] && { SPF_LIB="$_cand"; break; }
done
[[ -z "$SPF_LIB" ]] && exit 0   # 判定面不可用=放行（生成物成套分发，缺失属安装异常；test-r101 锁配对）
# shellcheck disable=SC1090
. "$SPF_LIB"

CONF=""
for _cand in "${_self}/precheck.conf" "${_self}/../precheck.conf"; do
  [[ -f "$_cand" ]] && { CONF="$_cand"; break; }
done
[[ -z "$CONF" ]] && exit 0      # conf 缺失=WRITABLE_DIRS/SPEC_* 无从谈起（同 fail-gate-hook 口径）

_sr="$(spf_conf_val "$CONF" SPEC_REQUIRED)"
[[ "$_sr" != "1" ]] && exit 0
_wd="$(spf_writable_dirs "$CONF")"
[[ -z "$_wd" ]] && exit 0

# draft 骨架期放行（骨架期无 spec 是常态；候选含目标技能 scripts/ 与生成器 assets/hooks/ 两布局）
SKILL_MD=""
for _cand in "${_self}/../SKILL.md" "${_self}/../../SKILL.md"; do
  [[ -f "$_cand" ]] && { SKILL_MD="$_cand"; break; }
done
spf_is_draft "$SKILL_MD" && exit 0

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# 检测面=已暂存文件（pre-commit 语义；未暂存的工作区改动不拦——留给 L1/L3）
_staged="$(git diff --cached --name-only 2>/dev/null || true)"
[[ -z "$_staged" ]] && exit 0

_hit=""
while IFS= read -r _f; do
  [[ -z "${_f:-}" ]] && continue
  # git diff --name-only 给仓库相对路径（无前导 /）；spf_path_in_dirs 的段匹配语义
  # （*/<dir>/* 与 <root>/<dir>/ 前缀）按绝对路径设计——先补根再判，防相对路径恒 miss。
  if spf_path_in_dirs "${ROOT}/${_f}" "$ROOT" $_wd; then _hit="$_f"; break; fi
done <<< "$_staged"
[[ -z "$_hit" ]] && exit 0

_sg="$(spf_conf_val "$CONF" SPEC_GLOB)"
_sg="${_sg:-docs/specs/*.md}"
_approved="$(spf_find_approved_spec "$ROOT" "$_sg")"
[[ -n "$_approved" ]] && exit 0

# 拦截：落审计（与 fail-gate-hook 同 jsonl 格式，tool=git-commit）+ stderr 原因与解除路径
_audit_dir="$ROOT/.swarm-yuan"
mkdir -p "$_audit_dir" 2>/dev/null || true
_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
_e="$(printf '%s' "$_hit" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\r\n')"
printf '{"ts":"%s","tool":"git-commit","target":"%s","gates":"spec-required"}\n' "$_ts" "$_e" >> "$_audit_dir/gate-deny.jsonl" 2>/dev/null || true

echo "✗ swarm-yuan spec-first（L2 提交时强拦）: staged 改动触及可写源码区（如 ${_hit}）但 ${_sg} 无已批准 spec（须含「## 决策记录」段且非占位）——流程强制：先 spec 再编码。" >&2
echo "  解除方式: 1) 先写 spec（含「## 决策记录」段）后重新提交；2) 确认改动确属源码区（否则检查 WRITABLE_DIRS 配置）；3) 显式豁免: precheck.conf 置 SPEC_REQUIRED=0 并落痕 decisions.jsonl；4) 逃生门: git commit --no-verify（git 标准机制——L3 门禁与状态机 build 准入兜底，deny 已落盘 gate-deny.jsonl）。" >&2
exit 1
