// 文件职责：cockpit 工作区/折叠/筛选/搜索与文件节点选择切片。
// 拆分纪律：纯移动，无行为变更；store refs 以依赖注入传入。
import { ref, type Ref } from 'vue'
import { searchSessions as searchHermesSessions } from '@/api/studio/sessions'
import type { CockpitFilters, ColumnKey, WorkspaceMode } from './cockpit'

export interface FilterSliceDeps {
  collapsed: Ref<Record<ColumnKey, boolean>>
  midTopCollapsed: Ref<boolean>
  midBottomCollapsed: Ref<boolean>
  timelineActorFilter: Ref<string[]>
  filters: Ref<CockpitFilters>
  searchQuery: Ref<string>
  sessionSearchCache: Ref<Record<string, { ts: number; results: any[] }>>
  sessionSearching: Ref<boolean>
  attentionTaskIds: Ref<string[]>
  workspaceMode: Ref<WorkspaceMode>
  maximized: Ref<Record<ColumnKey, boolean>>
  selectedGraphNodeIds: Ref<Record<string, string[]>>
  focusedGraphNodeId: Ref<string | null>
}

export function createCockpitFilterSlice(deps: FilterSliceDeps) {
  const { collapsed, midTopCollapsed, midBottomCollapsed, timelineActorFilter, filters, searchQuery,
    sessionSearchCache: _sessionSearchCache, sessionSearching: _sessionSearching, attentionTaskIds: _attentionTaskIds,
    workspaceMode, maximized, selectedGraphNodeIds, focusedGraphNodeId } = deps
  // ── 工作区/折叠/筛选 ──
  function toggleCollapsed(col: ColumnKey) { collapsed.value[col] = !collapsed.value[col] }
  function toggleMidTop() { midTopCollapsed.value = !midTopCollapsed.value }
  function toggleMidBottom() { midBottomCollapsed.value = !midBottomCollapsed.value }
  function toggleTimelineActor(actor: string) {
    const cur = timelineActorFilter.value
    const i = cur.indexOf(actor)
    // 新数组赋值（确保 Vue 响应式触发 computed 重算）
    timelineActorFilter.value = i >= 0 ? cur.filter(a => a !== actor) : [...cur, actor]
  }
  // 只对数组型筛选键开放（dateRange 是对象，不参与多选切换）——类型层收窄键集合，运行时同原实现。
  type ArrayFilterKey = {
    [K in keyof CockpitFilters]: CockpitFilters[K] extends readonly unknown[] ? K : never
  }[keyof CockpitFilters]
  function toggleFilter<K extends ArrayFilterKey>(key: K, value: CockpitFilters[K][number]) {
    const arr = filters.value[key] as CockpitFilters[K][number][]
    const i = arr.indexOf(value)
    if (i >= 0) {
      arr.splice(i, 1)
    } else {
      arr.push(value)
    }
  }
  // 日期范围筛选（需求 #1）：from/to 为 'YYYY-MM-DD' 或 null
  function setDateRangeFilter(from: string | null, to: string | null) {
    filters.value = { ...filters.value, dateRange: { from, to } }
  }
  function clearDateRangeFilter() {
    filters.value = { ...filters.value, dateRange: { from: null, to: null } }
  }
  function runSearch(q: string) {
    searchQuery.value = q
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = undefined }
    if (!q.trim()) return
    _searchTimer = setTimeout(async () => {
      const key = q.trim()
      const cached = _sessionSearchCache.value[key]
      if (cached && (Date.now() - cached.ts < 5 * 60 * 1000)) return // 缓存 5min 未过期
      if (_sessionSearching.value) return
      _sessionSearching.value = true
      try {
        const results = await searchHermesSessions(key)
        _sessionSearchCache.value = { ..._sessionSearchCache.value, [key]: { ts: Date.now(), results } }
      } catch { /* 静默：退化为仅本地匹配 */ }
      finally { _sessionSearching.value = false }
    }, 300)
  }
  function clearSearch() {
    searchQuery.value = ''
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = undefined }
  }
  function clearAttentionFilter() {
    _attentionTaskIds.value = []
  }
  function setWorkspaceMode(mode: WorkspaceMode) { workspaceMode.value = mode }
  function toggleMaximized(col: ColumnKey) {
    // 独占式全屏：任一栏最大化时，其他栏取消
    const cur = maximized.value[col]
    maximized.value = { left: false, mid: false, right: false, [col]: !cur }
  }

  // ── 文件/节点 ──
  const selectedFileId = ref<string | null>(null)
  function selectFile(id: string | null) { selectedFileId.value = id }
  function toggleGraphNode(taskId: string, nodeId: string) {
    const cur = selectedGraphNodeIds.value[taskId] ?? []
    const i = cur.indexOf(nodeId)
    if (i >= 0) {
      cur.splice(i, 1)
    } else {
      cur.push(nodeId)
    }
    selectedGraphNodeIds.value = { ...selectedGraphNodeIds.value, [taskId]: cur }
  }
  function focusOnGraphNodeForTimeline(nodeId: string) {
    focusedGraphNodeId.value = focusedGraphNodeId.value === nodeId ? null : nodeId
  }



  return {
    toggleCollapsed, toggleMidTop, toggleMidBottom, toggleTimelineActor, toggleFilter, setDateRangeFilter, clearDateRangeFilter, runSearch, clearSearch, clearAttentionFilter, setWorkspaceMode, toggleMaximized, selectedFileId, selectFile, toggleGraphNode, focusOnGraphNodeForTimeline,
  }
}
