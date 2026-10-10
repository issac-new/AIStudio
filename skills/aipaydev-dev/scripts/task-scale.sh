#!/usr/bin/env bash
# task-scale.sh —— 从 git diff 判定任务规模（事前判定，不需要 spec）
#
# 与 detect-spec-scale.sh 互补：
#   - detect-spec-scale.sh：从 spec.md 解析（事后，spec 写完后判定）
#   - task-scale.sh：从 git diff 判定（事前，分支开发中即时判定）
#
# 判定规则（决策 18）：
#   simple  : diff 文件数 ≤5 且不触碰敏感目录
#   standard: diff 触碰单一服务/模块
#   full    : diff 触碰多服务，或触碰公共接口/数据模型/权限目录（强制升级）
#
# 敏感目录（触碰即 full）：public/ api/ schema/ migration/ auth/ permission/ model/ dao/ entity/
# 多服务判定：diff 文件跨多个顶层服务目录（services/*/ 或 apps/*/）
#
# 非 git 项目：降级到 standard（质量优先偏置，不判 simple）
#
# 用法：
#   bash task-scale.sh [project-dir]
#   输出：simple|standard|full（stdout）+ 判定依据（stderr）
#   退出码：0=成功；1=非 git 且无 spec
set -uo pipefail

PROJ="${1:-.}"
[[ ! -d "$PROJ" ]] && { echo "✗ 项目目录不存在: $PROJ" >&2; exit 1; }

cd "$PROJ" 2>/dev/null || { echo "✗ 无法进入: $PROJ" >&2; exit 1; }

# 非 git 项目：降级 standard
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "standard"
  echo "非 git 项目，降级 standard（质量优先偏置）" >&2
  exit 0
fi

# 取变更文件清单（优先 origin/main...HEAD，兜底 HEAD~1...HEAD）
_changed=""
_changed=$(git diff --name-only origin/main...HEAD 2>/dev/null || true)
if [[ -z "$_changed" ]]; then
  # 兜底：最近 1 个 commit
  _changed=$(git diff --name-only HEAD~1...HEAD 2>/dev/null || true)
fi
if [[ -z "$_changed" ]]; then
  # 无变更（可能是新分支无 commit）
  echo "standard"
  echo "无变更文件（新分支或无 commit），降级 standard" >&2
  exit 0
fi

# 文件数
_fc=$(printf '%s\n' "$_changed" | grep -c . | tr -d ' \n' || echo 0)
[[ "$_fc" =~ ^[0-9]+$ ]] || _fc=0

# 敏感目录模式（触碰即 full）
_sensitive_pattern='(^|/)(public|api|schema|migration|migrations|auth|permission|model|models|dao|entity|entities|domain|aggregate)/'
_sensitive_hits=$(printf '%s\n' "$_changed" | grep -E "$_sensitive_pattern" | head -5 || true)

# 多服务判定（services/ 或 apps/ 下跨多个子目录）
_svc_dirs=$(printf '%s\n' "$_changed" | grep -E '^(services|apps)/[^/]+/' | sed -E 's|^(services\|apps)/([^/]+)/.*|\1/\2|' | sort -u || true)
_svc_cnt=$(printf '%s\n' "$_svc_dirs" | grep -c . | tr -d ' \n' || echo 0)
[[ "$_svc_cnt" =~ ^[0-9]+$ ]] || _svc_cnt=0

# 判定
_reason=""
_result=""

# full：敏感目录 或 多服务
if [[ -n "$_sensitive_hits" ]]; then
  _result="full"
  _reason="触碰敏感目录（public/api/schema/migration/auth/model 等）：$(echo "$_sensitive_hits" | tr '\n' ' ')"
elif [[ "$_svc_cnt" -ge 2 ]]; then
  _result="full"
  _reason="跨多服务（${_svc_cnt} 个：$(echo "$_svc_dirs" | tr '\n' ' ')）"
elif [[ "$_fc" -gt 10 ]]; then
  _result="full"
  _reason="文件数 ${_fc}（>10 → full）"
elif [[ "$_fc" -le 5 ]]; then
  _result="simple"
  _reason="文件数 ${_fc}（≤5 且未触碰敏感目录 → simple）"
else
  _result="standard"
  _reason="文件数 ${_fc}（6-10，单一模块 → standard）"
fi

echo "$_result"
echo "task-scale 判定: ${_result}（${_reason}）" >&2
