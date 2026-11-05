// 文件职责：cockpit 历史动作切片（打开/筛选/召回/归档模式复位）。
// 拆分纪律：纯移动，无行为变更；refs 与跨切片函数以依赖注入传入。
import type { Ref } from 'vue'
import * as extras from '@/custom/shared/api/kanban-extras'
import * as historyAdapter from '@/custom/shared/adapters/history-adapter'
import type { HistoryItem } from '@/custom/shared/adapters/history-adapter'
import type { HistoryFilters } from './cockpit-history'
import type { WorkspaceMode } from './cockpit'

export interface HistoryActionsDeps {
  historyOpen: Ref<boolean>
  history: Ref<HistoryItem[]>
  historyFilters: Ref<HistoryFilters>
  archivedMode: Ref<boolean>
  selectTask: (id: string | null) => Promise<void>
  setWorkspaceMode: (mode: WorkspaceMode) => void
}

export function createCockpitHistoryActionsSlice(deps: HistoryActionsDeps) {
  const { historyOpen, history, historyFilters, archivedMode, selectTask, setWorkspaceMode } = deps
  // ── 历史 ──
  async function openHistory() {
    historyOpen.value = true
    try {
      const res = await extras.getTimeline({ limit: 100 })
      history.value = historyAdapter.mergeTimeline(res.items)
    } catch {
      history.value = []
    }
  }
  function closeHistory() { historyOpen.value = false }
  function setHistoryArchivedFilter(v: 'all' | 'only' | 'exclude') { /* added by feat/history-filters */ }

  function toggleHistoryAction(action: string) {
    const arr = historyFilters.value.actions
    const i = arr.indexOf(action)
    if (i >= 0) {
      arr.splice(i, 1)
    } else {
      arr.push(action)
    }
  }
  function setHistorySearch(v: string) { historyFilters.value.search = v }
  function setHistoryTimeRange(v: 'today' | 'week' | 'month' | null) {
    historyFilters.value.timeRange = historyFilters.value.timeRange === v ? null : v
  }
  function toggleHistoryCategory(v: 'event' | 'comment') {
    const arr = historyFilters.value.categories
    const i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1); else arr.push(v)
  }
  function toggleHistoryStatus(v: 'active' | 'done' | 'archived') {
    const arr = historyFilters.value.statuses
    const i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1); else arr.push(v)
  }
  function recallHistoryItem(id: string) {
    const item = history.value.find(h => h.id === id)
    if (!item) return
    selectTask(item.taskId)
    archivedMode.value = item.archived
    setWorkspaceMode('work')
    historyOpen.value = false
  }
  function clearArchivedMode() { archivedMode.value = false }

  return {
    openHistory, closeHistory, setHistoryArchivedFilter,
    toggleHistoryAction, setHistorySearch, setHistoryTimeRange,
    toggleHistoryCategory, toggleHistoryStatus, recallHistoryItem, clearArchivedMode,
  }
}
