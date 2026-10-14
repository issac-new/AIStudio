// overlay[constraints] 派单注入选择器（纯函数 + fail-soft 读取面）。
//
// selectConstraints 为纯函数（可测）；constraintLinesForDispatch 为派单侧
// 读取面：任何存储错误都返回 []（约束卡缺席/损坏不阻断派发——fail-soft，
// 与 contractFooter 注册表缺席回落同纪律）。
import type { ConstraintCard, DispatchTarget } from './constraint-types'
import { listConstraintCards } from './constraint-store'

/** 注入上限：防简报膨胀（与先例行/语义块同为少量行）。 */
export const MAX_INJECT = 5

function scopeHit(card: ConstraintCard, target: DispatchTarget): boolean {
  if (!card.enabled) return false
  const cols = card.scope.columns ?? []
  if (target.column && cols.includes(target.column)) return true
  const specs = card.scope.specialists ?? []
  if (target.specialist && specs.includes(target.specialist)) return true
  if (target.stepId && specs.includes(target.stepId)) return true
  return false
}

/** 按列/specialist 匹配启用的约束卡，创建序稳定，封顶 MAX_INJECT。 */
export function selectConstraints(cards: ConstraintCard[], target: DispatchTarget): ConstraintCard[] {
  return cards
    .filter((c) => scopeHit(c, target))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_INJECT)
}

/** 派单简报行（stepBrief 消费）：一行收拢，格式对齐 step.constraints 行。 */
export function constraintBriefLine(cards: ConstraintCard[]): string | null {
  if (!cards.length) return null
  const items = cards.map((c, i) => `${i + 1}. [${c.id}] ${c.statement}（源：${c.sourceAnchor}）`)
  return `架构约束（约束卡注册表，硬边界，越界须升级申请）：${items.join('；')}`
}

/** 派单侧读取面：存储异常→空（fail-soft，不阻断派发）。 */
export function constraintLinesForDispatch(target: DispatchTarget): string[] {
  try {
    const line = constraintBriefLine(selectConstraints(listConstraintCards(), target))
    return line ? [line] : []
  } catch {
    return []
  }
}

/** REST 预演：额外支持关键词维（对任务标题/正文子串匹配，大小写不敏感）。 */
export function selectConstraintsPreview(
  cards: ConstraintCard[],
  target: DispatchTarget & { title?: string; body?: string },
): ConstraintCard[] {
  const kw = (c: ConstraintCard): boolean => {
    const terms = c.scope.keywords ?? []
    if (!terms.length) return false
    const hay = `${target.title ?? ''}\n${target.body ?? ''}`.toLowerCase()
    if (!hay.trim()) return false
    return terms.some((t) => hay.includes(t.toLowerCase()))
  }
  return cards
    .filter((c) => c.enabled && (scopeHit(c, target) || kw(c)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_INJECT)
}
