// overlay/custom/client/loop/adapters/loop-adapter.ts
import type { LoopInstance, LoopStatus } from '../types'

export type LoopRowStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'awaiting-review' | 'completed' | 'failed'

export interface LoopTableRow {
  id: string
  name: string
  stage: string
  status: LoopRowStatus
  statusIcon: string
  statusColor: string
  nextTick: string
  progress: string
  cost: string
  costWarning: boolean
}

export function toLoopTableRow(loop: LoopInstance): LoopTableRow {
  const completed = loop.stats.tasksCompleted
  const discovered = loop.stats.tasksDiscovered || 1
  const costPct = (loop.stats.totalCost / loop.budget.maxCostTotal) * 100
  const iconMap: Record<LoopStatus, string> = {
    idle: '○', running: '●', paused: '⏸', blocked: '▣',
    'awaiting-review': '⚠', completed: '✓', failed: '✗',
  }
  const colorMap: Record<LoopStatus, string> = {
    idle: 'gray', running: 'blue', paused: 'gray', blocked: 'red',
    'awaiting-review': 'orange', completed: 'green', failed: 'red',
  }
  return {
    id: loop.id,
    name: loop.name,
    stage: loop.stage,
    status: loop.status,
    statusIcon: iconMap[loop.status],
    statusColor: colorMap[loop.status],
    nextTick: loop.nextTickAt ?? '—',
    progress: `${completed}/${discovered}`,
    cost: `$${loop.stats.totalCost.toFixed(2)}/$${loop.budget.maxCostTotal.toFixed(2)}`,
    costWarning: costPct > loop.budget.warningThreshold * 100,
  }
}
