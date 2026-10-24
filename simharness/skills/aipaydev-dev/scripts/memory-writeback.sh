#!/usr/bin/env bash
# memory-writeback.sh — Step 12 记忆写回（补全"记忆→生成→开发→记忆"闭环的写回半环）
#
# 理念来源：SKILL.md Step 12 "记忆写回"。本脚本提供机器兜底：
# 把本次生成的项目知识摘要（特征卡 + 框架清单 + spec 摘要）写回各记忆后端，幂等、best-effort、不阻塞主流程。
#
# 用法:
#   bash scripts/memory-writeback.sh [--skill-dir <目标技能目录>] [--project-dir <项目目录>]
#   缺省 --skill-dir 用 ${PROJECT_DIR:-$(pwd)}/.swarm-yuan/skill（生成产物）；
#   --project-dir 缺省用 $PWD。
#
# 记忆后端（经同目录 memory-backends.sh 适配层派发，默认注册序 local / zcode / claude-mem，
# 环境变量 SWARM_YUAN_MEM_BACKENDS 可覆盖）：每后端恰好一行披露（✓写入 / ⚠跳过 / ⚠失败），
# 任一后端失败仅 warn 不阻塞；后端清单与接入方式见 memory-backends.sh 头注。
#
# 幂等：同一项目重复写回用时间戳分节，不覆盖历史；旧节保留供 diff。
# 三平台兼容：bash 3.2 / 无 declare -A / date -u / sed 无 -i / $(cd+pwd)。

set -uo pipefail

SKILL_DIR=""
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-dir)   SKILL_DIR="${2:-}";   shift 2 ;;
    --project-dir) PROJECT_DIR="${2:-}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; echo "Usage: bash scripts/memory-writeback.sh [--skill-dir <dir>] [--project-dir <dir>]" >&2; exit 1 ;;
  esac
done

# 缺省 skill-dir：猜测 .swarm-yuan/skill 或当前目录
[[ -z "$SKILL_DIR" ]] && SKILL_DIR="${PROJECT_DIR}/.swarm-yuan/skill"
[[ -d "$SKILL_DIR" ]] || SKILL_DIR="${PROJECT_DIR}"

# 适配层随技能分发于同目录（生成器侧 assets/，目标技能侧 scripts/）
_MB_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/memory-backends.sh"
if [[ ! -f "$_MB_SH" ]]; then
  echo "⚠ [记忆写回] 适配层缺失: ${_MB_SH}——无法写回（不阻塞主流程）" >&2
  exit 0
fi
# shellcheck disable=SC1090
source "$_MB_SH"

# ---- 0. 采集项目知识摘要（从生成产物读，不自己探查）----
# 优先读目标技能的 SKILL.md 头部 + spec.md 摘要 + facts.conf（若存在）；缺则降级用项目目录名。
_collect_summary() {
  local summary=""
  local skill_md="${SKILL_DIR}/SKILL.md"
  local spec_md="${SKILL_DIR}/references/spec.md"
  if [[ -f "$skill_md" ]]; then
    # 取 SKILL.md 的前 20 行（含项目名 + 核心约束）
    summary+="## 目标技能摘要（$(basename "$SKILL_DIR")）"$'\n\n'
    summary+=$(head -20 "$skill_md" 2>/dev/null)
    summary+=$'\n\n'
  fi
  if [[ -f "$spec_md" ]]; then
    # 取 spec.md 的 §1 需求理解 + §2 技术栈（前 40 行）
    summary+="## spec 摘要"$'\n\n'
    summary+=$(head -40 "$spec_md" 2>/dev/null)
    summary+=$'\n\n'
  fi
  if [[ -z "$summary" ]]; then
    summary="## 项目知识（无生成产物，仅目录名: $(basename "$PROJECT_DIR")）"$'\n'
  fi
  printf '%s' "$summary"
}

# ---- 写回（适配层派发；body 落临时文件供文件类后端全文写、CLI 类后端取摘要）----
_BODY="$(mktemp "${TMPDIR:-/tmp}/mwb.XXXXXX")"
_collect_summary > "$_BODY"

echo "=== 记忆写回（Step 12，best-effort）==="
mem_write_all "$_BODY"
rm -f "$_BODY"

# 永不 fail 阻塞主流程（记忆写回是 best-effort，失败不阻断生成）
exit 0
