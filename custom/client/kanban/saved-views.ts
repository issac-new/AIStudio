// overlay/custom/client/kanban/saved-views.ts
// B12 看板命名视图（multica save-view-dialog / manage-views-dialog 吸收：
// 过滤条件+搜索+板选择存为命名视图，一键切换）。
// 视图快照=五元组（board/status/assignee/search/includeArchived），全部为
// kanban store 既有过滤面（零新过滤维度）；持久化=localStorage per-user。
// 纯函数 + 模块级响应式状态（KanbanToolbar 与守门测试共用单一事实源）。
import { reactive } from 'vue'

export interface KanbanViewSnapshot {
  board: string
  status: string | null
  assignee: string | null
  search: string
  includeArchived: boolean
}

export interface SavedKanbanView {
  id: string
  name: string
  snapshot: KanbanViewSnapshot
  savedAt: number
}

const KEY = 'kanban_saved_views'

function load(): SavedKanbanView[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((v): v is SavedKanbanView =>
      v && typeof v === 'object' && typeof v.id === 'string' && typeof v.name === 'string' && v.snapshot && typeof v.snapshot === 'object')
  } catch { return [] }
}

const state = reactive<{ views: SavedKanbanView[] }>({ views: load() })

export function savedViewsState(): { views: SavedKanbanView[] } {
  return state
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(state.views)) } catch { /* quota 静默 */ }
}

/** 保存（重名覆盖同名旧视图；id=名称确定性哈希，幂等）。 */
export function saveView(name: string, snapshot: KanbanViewSnapshot): SavedKanbanView | null {
  const n = name.trim()
  if (!n) return null
  const id = `v-${n.toLowerCase().replace(/\s+/g, '-')}`
  const view: SavedKanbanView = { id, name: n, snapshot, savedAt: Date.now() }
  const idx = state.views.findIndex((v) => v.id === id)
  if (idx === -1) state.views = [...state.views, view]
  else {
    const next = [...state.views]
    next[idx] = view
    state.views = next
  }
  persist()
  return view
}

export function removeView(id: string): void {
  state.views = state.views.filter((v) => v.id !== id)
  persist()
}

/** 快照差异判定（Toolbar「保存当前」按钮按需显隐重名覆盖确认）。 */
export function snapshotEquals(a: KanbanViewSnapshot, b: KanbanViewSnapshot): boolean {
  return a.board === b.board && a.status === b.status && a.assignee === b.assignee
    && a.search === b.search && a.includeArchived === b.includeArchived
}

/** 测试/复位用。 */
export function __resetSavedViewsForTest(): void {
  state.views = []
  try { localStorage.removeItem(KEY) } catch { /* 忽略 */ }
}
