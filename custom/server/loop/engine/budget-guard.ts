// overlay/custom/server/loop/engine/budget-guard.ts
import type { LoopInstance, LoopEvent } from '../types'
import { PATTERN_TEMPLATES } from '../types'

export interface BudgetDecision {
  allow: boolean
  action?: 'throw' | 'notify' | 'kill'
}

const TICK_COST_BY_LEVEL: Record<string, number> = {
  low: 0.5, medium: 2, high: 10, 'very-high': 30,
}

export class BudgetGuard {
  private warnedUnknownPattern = false

  constructor(private emitEvent: (event: LoopEvent) => void) {}

  check(loop: LoopInstance): BudgetDecision {
    const totalSpent = loop.stats.totalCost
    const total = loop.budget.maxCostTotal

    if (totalSpent >= total) {
      return { allow: false, action: loop.budget.killMode }
    }

    if (totalSpent / total > loop.budget.warningThreshold) {
      this.emitEvent({
        type: 'loop.budget-warning', loopId: loop.id,
        spent: totalSpent, limit: total, ts: new Date().toISOString(),
      })
    }

    return { allow: true }
  }

  /** 台账 g 修复：按 PATTERN_TEMPLATES[pattern].costEstimate 查成本档表；
   *  无匹配模板回落 medium 档并 warn 一次（旧实现拿 pattern 名索引档位表恒 miss 返回 1） */
  estimateTickCost(loop: LoopInstance): number {
    const template = PATTERN_TEMPLATES[loop.pattern]
    if (!template) {
      if (!this.warnedUnknownPattern) {
        this.warnedUnknownPattern = true
        console.warn(`[budget-guard] unknown pattern "${String(loop.pattern)}" on loop ${loop.id} — cost estimate falls back to medium`)
      }
      return TICK_COST_BY_LEVEL.medium
    }
    return TICK_COST_BY_LEVEL[template.costEstimate] ?? TICK_COST_BY_LEVEL.medium
  }
}
