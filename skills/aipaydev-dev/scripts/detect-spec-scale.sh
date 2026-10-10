#!/usr/bin/env bash
# detect-spec-scale.sh — 从 spec 文件推断规模等级
#
# 作用：解析 spec.md 的结构化字段，推断规模等级（简单/标准/完整），
# 与当前门禁集不匹配时 warn 提示升档（只升不降，质量优先）。
#
# 推断规则（质量优先，不确定升档）：
#   - 侵入点 ≤3 文件 且 无风险信号 → 简单
#   - 侵入点 4-10 文件 或 含任一风险信号 → 标准
#   - 侵入点 >10 文件 或 含 ≥2 风险信号 或 架构变更 → 完整
#   风险信号：跨服务 / 公共接口 / 数据模型 / 权限
#
# 与任务类型正交：任务类型决定门禁子集，spec 规模决定档位，两者取并集（更重档）
#
# 用法：
#   bash detect-spec-scale.sh <spec.md>
#   输出：简单|标准|完整（stdout 最后一行）+ 详情到 stderr
#   退出码：0=成功推断；1=spec 不存在或无法解析

set -uo pipefail

SPEC_FILE="${1:?Usage: detect-spec-scale.sh <spec.md>}"
[[ -f "$SPEC_FILE" ]] || { echo "ℹ spec 文件不存在: $SPEC_FILE" >&2; echo "未知"; exit 0; }

# 规模档序（rank：简单=1 < 标准=2 < 完整=3）
_scale_rank() { case "$1" in 简单) echo 1;; 完整) echo 3;; *) echo 2;; esac; }

# 风险信号关键词
RISK_KW="跨服务|公共接口|数据模型|权限|架构变更|新上下文"

# ① 侵入点文件数：统计 spec 中反引号包裹的文件路径占位数
# 匹配模式：行内含反引号路径（如 `<src/models/user.ts>` 或 `src/api/user.ts`）
# bash 3.2 兼容：grep -cE 计数，用简单的反引号匹配（不嵌套 shell 解析）
INVASION_COUNT=$(grep -cE '`[^`]+`' "$SPEC_FILE" 2>/dev/null || echo 0)
[[ "$INVASION_COUNT" =~ ^[0-9]+$ ]] || INVASION_COUNT=0

# ② 风险信号计数：全文 grep 风险关键词
RISK_COUNT=0
RISK_HITS=$(grep -cE "$RISK_KW" "$SPEC_FILE" 2>/dev/null || echo 0)
[[ "$RISK_HITS" =~ ^[0-9]+$ ]] || RISK_HITS=0
RISK_COUNT="$RISK_HITS"

# ③ 架构变更信号（强制完整档）
ARCH_CHANGE=0
if grep -qiE "架构变更|架构重构|新上下文|微服务拆分|DDD[[:space:]]*重构" "$SPEC_FILE" 2>/dev/null; then
  ARCH_CHANGE=1
fi

# 推断规模等级（质量优先，不确定升档）
if [[ $ARCH_CHANGE -eq 1 ]]; then
  SCALE="完整"
  REASON="架构变更信号（强制完整档）"
elif [[ $RISK_COUNT -ge 2 ]]; then
  SCALE="完整"
  REASON="含 ${RISK_COUNT} 个风险信号（≥2 → 完整）"
elif [[ $INVASION_COUNT -gt 10 ]]; then
  SCALE="完整"
  REASON="侵入点 ${INVASION_COUNT} 文件（>10 → 完整）"
elif [[ $RISK_COUNT -ge 1 ]]; then
  SCALE="标准"
  REASON="含 ${RISK_COUNT} 个风险信号（任一 → 标准）"
elif [[ $INVASION_COUNT -ge 4 ]]; then
  SCALE="标准"
  REASON="侵入点 ${INVASION_COUNT} 文件（4-10 → 标准）"
elif [[ $INVASION_COUNT -ge 1 ]]; then
  SCALE="简单"
  REASON="侵入点 ${INVASION_COUNT} 文件（≤3 且无风险信号 → 简单）"
else
  # 无法解析侵入点：保守按标准（不降简单）
  SCALE="标准"
  REASON="无法解析侵入点（保守按标准，不降简单）"
fi

echo "spec 规模: ${SCALE}（${REASON}；侵入点 ${INVASION_COUNT}/风险信号 ${RISK_COUNT}/架构变更 ${ARCH_CHANGE}）" >&2
echo "$SCALE"
