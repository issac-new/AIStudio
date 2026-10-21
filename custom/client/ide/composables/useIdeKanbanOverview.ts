// IDE 看板任务总览：一次读当前 studio 实例的全部板与任务
// （/api/hermes/kanban/overview，与日常工作台看板同源）。
// 推演任务落在账号分板（fanfan-pm-plan 等），单读 default 板会恒空；
// 本 composable 是 IdeKanbanPane 与 IdeTaskSidebar 任务段的单一数据源。
// 只读；编辑仍在 /app/board。
import { computed, ref } from 'vue'
import { request } from '@/api/client'
import type { KanbanTask } from '@/api/hermes/kanban'

export interface IdeKanbanBoard {
  slug: string
  name?: string
  total?: number
  archived?: boolean
}

export interface IdeKanbanEntry {
  board: string
  task: KanbanTask
}

interface OverviewResponse {
  boards?: IdeKanbanBoard[]
  tasks?: Array<{ board?: string; task?: KanbanTask }>
}

const CACHE_TTL_MS = 3000

export function useIdeKanbanOverview() {
  const boards = ref<IdeKanbanBoard[]>([])
  const entries = ref<IdeKanbanEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  let loadedAt = 0
  let inflight: Promise<void> | null = null

  async function refresh(force = false): Promise<void> {
    if (!force && loadedAt && Date.now() - loadedAt < CACHE_TTL_MS) return
    if (inflight) return inflight
    loading.value = true
    error.value = ''
    inflight = request<OverviewResponse>('/api/hermes/kanban/overview')
      .then((res) => {
        boards.value = (res?.boards ?? [])
          .filter(board => Boolean(board?.slug))
          .map(board => ({ ...board, slug: board.slug }))
        entries.value = (res?.tasks ?? [])
          .filter(entry => Boolean(entry?.task?.id))
          .map(entry => ({ board: entry.board || 'default', task: entry.task as KanbanTask }))
        loadedAt = Date.now()
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : String(err)
        throw err
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })
    return inflight
  }

  const activeEntries = computed(() =>
    entries.value.filter(entry => entry.task.status !== 'done' && entry.task.status !== 'archived'),
  )

  const boardCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const entry of entries.value) {
      counts.set(entry.board, (counts.get(entry.board) ?? 0) + 1)
    }
    return counts
  })

  return { boards, entries, activeEntries, boardCounts, loading, error, refresh }
}
