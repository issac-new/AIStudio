// overlay/custom/server/loop/engine/budget-guard.ts
import type { LoopInstance, LoopEvent } from '../../../client/loop/types'

export interface BudgetDecision {
  allow: boolean
  action?: 'throw' | 'notify' | 'kill'
}

export class BudgetGuard {
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

  estimateTickCost(loop: LoopInstance): number {
    const costMap: Record<string, number> = {
      low: 0.5, medium: 2, high: 10, 'very-high': 30,
    }
    return costMap[loop.pattern] ?? 1
  }
}
