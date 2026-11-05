// 文件职责：cockpit 历史筛选与默认日期范围的纯函数（可独立单测）。
import type { HistoryItem } from '@/custom/shared/adapters/history-adapter'

export interface HistoryFilters {
  search: string
  timeRange: 'today' | 'week' | 'month' | null
  categories: ('event' | 'comment')[]
  actions: string[]
  statuses: ('active' | 'done' | 'archived')[]
}

/** 历史筛选：搜索/时间片/类别/动作/状态（纯函数，now 可注入便于单测）。 */
export function filterCockpitHistory(
  items: HistoryItem[],
  filters: HistoryFilters,
  tasks: Array<{ id: string; status?: string }>,
  now: Date = new Date(),
): HistoryItem[] {
  return items.filter((h) => {
    const f = filters
    const q = f.search.trim().toLowerCase()
    const searchOk = !q || h.title.toLowerCase().includes(q)
    let timeOk = true
    if (f.timeRange) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      if (f.timeRange === 'today') {
        timeOk = h.ts >= todayStart
      } else if (f.timeRange === 'week') {
        const dow = now.getDay()
        const mondayOffset = dow === 0 ? -6 : 1 - dow
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset).getTime()
        timeOk = h.ts >= weekStart
      } else {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        timeOk = h.ts >= monthStart
      }
    }
    const catOk = f.categories.length === 0 || f.categories.includes(h.source)
    const actionOk = f.actions.length === 0 || f.actions.includes(h.action)
    let statusOk = true
    if (f.statuses.length > 0 && f.statuses.length < 3) {
      const task = tasks.find((t) => t.id === h.taskId)
      const isDone = task?.status === 'done' || task?.status === 'archived'
      if (f.statuses.includes('active') && !isDone && !h.archived) statusOk = true
      else if (f.statuses.includes('done') && isDone && !h.archived) statusOk = true
      else if (f.statuses.includes('archived') && h.archived) statusOk = true
      else statusOk = false
    }
    return searchOk && timeOk && catOk && actionOk && statusOk
  })
}

/** 默认日期范围：近 2 周（需求 #2）。 */
export function defaultDateRange(now: Date = new Date()): { from: string; to: string } {
  const to = now
  const from = new Date(now)
  from.setDate(from.getDate() - 14)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(from), to: fmt(to) }
}
