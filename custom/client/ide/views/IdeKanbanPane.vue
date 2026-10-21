<script setup lang="ts">
// IdeKanbanPane — IDE 内嵌看板（UI 融合 UI-10，multica 看板组织面四视图吸收落地）。
// 数据=当前实例跨板聚合（/api/hermes/kanban/overview，与工作台看板同源）；四视图（list/board/swimlane/
// gantt）=boardorg 域同语义客户端排布：同一数据四种组织（表/列桶/泳道/时序）。
// 优先级五档映射 p0-p4；列=status 词表。只读视图（编辑走工作台看板）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { KanbanTask } from '@/api/hermes/kanban'
import { useIdeKanbanOverview } from '../composables/useIdeKanbanOverview'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

type BoardView = 'list' | 'board' | 'swimlane' | 'gantt'
type IdeTask = KanbanTask & { board: string }

const { locale } = useI18n()
const boardText = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].kanbanBoard)
const router = useRouter()
const overview = useIdeKanbanOverview()
const boardFilter = ref('all')
const loadError = ref('')
const loadErrorDetail = ref('')
const loading = ref(false)
const view = ref<BoardView>('board')

const visibleEntries = computed(() =>
  overview.entries.value.filter(entry => entry.task.status !== 'archived'),
)

const tasks = computed<IdeTask[]>(() =>
  visibleEntries.value
    .filter(entry => boardFilter.value === 'all' || entry.board === boardFilter.value)
    .map(entry => ({ ...entry.task, board: entry.board })),
)

const boardTaskCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const entry of visibleEntries.value) {
    counts.set(entry.board, (counts.get(entry.board) ?? 0) + 1)
  }
  return counts
})

const boardOptions = computed(() =>
  overview.boards.value.filter(board =>
    !board.archived && (boardTaskCounts.value.get(board.slug) ?? 0) > 0),
)

function boardCount(slug: string): number {
  return boardTaskCounts.value.get(slug) ?? 0
}

// 卡片点击 → /ide?task=<id> 深链（关联轮发现路径）：直达链接一条链把任务维度
// 绑定、简报展开、workspace 关联、任务会话切换全带起来（IdeShell watch 同源）。
// router 空值守卫：无路由上下文的裸挂载（单测）不炸，点击时静默。
function openTask(taskId: string): void {
  void router?.push({ path: '/ide', query: { task: taskId } })
}

const VIEWS: Array<{ key: BoardView; label: string }> = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'swimlane', label: 'Swimlane' },
  { key: 'gantt', label: 'Gantt' },
]

// 数据源=当前 studio 实例的跨板聚合（与工作台看板同源）：推演任务在账号分板，
// 旧实现只读 default 板会恒空。overview 走 sqlite 快道，一次请求覆盖全部板，
// 不再逐板 spawn CLI。
async function load(): Promise<void> {
  loading.value = true
  try {
    await overview.refresh(true)
    loadError.value = ''
    loadErrorDetail.value = ''
  } catch (err) {
    loadErrorDetail.value = err instanceof Error ? err.message : String(err)
    loadError.value = '看板任务暂不可用；点刷新重试。'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function prio(p: number): string {
  return `p${Math.min(4, Math.max(0, p))}`
}

/** 列桶（board 视图）：status 分组，组内优先级升序。 */
const byColumn = computed(() => {
  const map = new Map<string, KanbanTask[]>()
  for (const task of tasks.value) {
    const list = map.get(task.status) ?? []
    list.push(task)
    map.set(task.status, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.priority - b.priority)
  return [...map.entries()].map(([status, list]) => ({ status, list }))
})

/** 泳道（swimlane 视图）：assignee 分道。 */
const bySwimlane = computed(() => {
  const map = new Map<string, KanbanTask[]>()
  for (const task of tasks.value) {
    const key = task.assignee ?? '—'
    const list = map.get(key) ?? []
    list.push(task)
    map.set(key, list)
  }
  return [...map.entries()].map(([assignee, list]) => ({ assignee, list }))
})

/** 时序（gantt 视图）：started_at 排序+完成度条。 */
const ganttRows = computed(() =>
  [...tasks.value]
    .filter((task) => task.started_at)
    .sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0))
    .map((task) => {
      const start = task.started_at ?? 0
      const end = task.completed_at ?? Date.now()
      return { task, start, end, pct: task.completed_at ? 100 : 50 }
    }),
)

const timeSpan = computed(() => {
  if (!ganttRows.value.length) return { min: 0, max: 1 }
  const min = Math.min(...ganttRows.value.map((r) => r.start))
  const max = Math.max(...ganttRows.value.map((r) => r.end))
  return { min, max: max > min ? max : min + 1 }
})

function barStyle(row: { start: number; end: number }): Record<string, string> {
  const { min, max } = timeSpan.value
  const left = ((row.start - min) / (max - min)) * 100
  const width = Math.max(2, ((row.end - row.start) / (max - min)) * 100)
  return { left: `${left}%`, width: `${width}%` }
}
</script>

<template>
  <div class="ide-kanban" data-testid="ide-kanban-pane">
    <header class="ide-kanban__head">
      <button type="button" class="ide-kanban__refresh" data-testid="ide-kanban-refresh" :disabled="loading" @click="load">⟳</button>
      <span class="ide-kanban__views" role="tablist">
        <button
          v-for="v in VIEWS"
          :key="v.key"
          type="button"
          class="ide-kanban__viewtab"
          :class="{ 'is-active': view === v.key }"
          :data-testid="`ide-kanban-view-${v.key}`"
          @click="view = v.key"
        >{{ v.label }}</button>
      </span>
      <span class="ide-kanban__count">{{ tasks.length }}</span>
    </header>

    <div class="ide-kanban__boardbar" data-testid="ide-kanban-boardbar" :aria-label="boardText.filter">
      <button
        type="button"
        class="ide-kanban__boardchip"
        :class="{ 'is-active': boardFilter === 'all' }"
        data-testid="ide-kanban-board-chip-all"
        @click="boardFilter = 'all'"
      >{{ boardText.all }}<span class="ide-kanban__boardn">{{ visibleEntries.length }}</span></button>
      <button
        v-for="board in boardOptions"
        :key="board.slug"
        type="button"
        class="ide-kanban__boardchip"
        :class="{ 'is-active': boardFilter === board.slug }"
        :title="board.slug"
        :data-testid="`ide-kanban-board-chip-${board.slug}`"
        @click="boardFilter = board.slug"
      >{{ board.name || board.slug }}<span class="ide-kanban__boardn">{{ boardCount(board.slug) }}</span></button>
    </div>

    <p v-if="loadError" class="ide-kanban__error" data-testid="ide-kanban-error" :title="loadErrorDetail">{{ loadError }}</p>
    <p v-else-if="!loading && !tasks.length" class="ui-empty-state ui-empty-state--compact" data-testid="ide-kanban-empty">{{ boardText.empty }}</p>

    <!-- board：列桶 -->
    <div v-if="view === 'board' && tasks.length" class="ide-kanban__board" data-testid="ide-kanban-board">
      <div v-for="col in byColumn" :key="col.status" class="ide-kanban__col">
        <div class="ide-kanban__colhead">{{ col.status }} · {{ col.list.length }}</div>
        <div
          v-for="task in col.list"
          :key="task.id"
          class="ide-kanban__card ide-kanban__card--clickable"
          :class="`is-${prio(task.priority)}`"
          :data-testid="`ide-kanban-task-${task.id}`"
          role="button"
          tabindex="0"
          :title="boardText.openTask"
          @click="openTask(task.id)"
          @keydown.enter="openTask(task.id)"
        >
          <span class="ide-kanban__prio">{{ prio(task.priority) }}</span>
          <span class="ide-kanban__title" :title="task.title">{{ task.title }}</span>
          <span class="ide-kanban__assignee">{{ task.assignee ?? '—' }}</span>
          <span v-if="boardFilter === 'all'" class="ide-kanban__taskboard" :title="task.board">{{ task.board }}</span>
        </div>
      </div>
    </div>

    <!-- list：表 -->
    <table v-else-if="view === 'list' && tasks.length" class="ide-kanban__list" data-testid="ide-kanban-list">
      <thead><tr><th>#</th><th>prio</th><th>board</th><th>title</th><th>status</th><th>assignee</th></tr></thead>
      <tbody>
        <tr v-for="task in tasks" :key="task.id" :data-testid="`ide-kanban-task-${task.id}`" class="ide-kanban__row--clickable" @click="openTask(task.id)">
          <td>{{ task.id.slice(0, 6) }}</td>
          <td :class="`is-${prio(task.priority)}`">{{ prio(task.priority) }}</td>
          <td class="ide-kanban__boardcell" :title="task.board">{{ task.board }}</td>
          <td class="is-title" :title="task.title">{{ task.title }}</td>
          <td>{{ task.status }}</td>
          <td>{{ task.assignee ?? '—' }}</td>
        </tr>
      </tbody>
    </table>

    <!-- swimlane：按负责人 -->
    <div v-else-if="view === 'swimlane' && tasks.length" class="ide-kanban__lanes" data-testid="ide-kanban-swimlane">
      <div v-for="lane in bySwimlane" :key="lane.assignee" class="ide-kanban__lane">
        <div class="ide-kanban__lanehead">{{ lane.assignee }} · {{ lane.list.length }}</div>
        <span
          v-for="task in lane.list"
          :key="task.id"
          class="ide-kanban__card ide-kanban__card--clickable"
          :class="`is-${prio(task.priority)}`"
          @click="openTask(task.id)"
        >{{ task.board }} · {{ prio(task.priority) }} {{ task.title }}</span>
      </div>
    </div>

    <!-- gantt：时序条 -->
    <div v-else-if="view === 'gantt' && ganttRows.length" class="ide-kanban__gantt" data-testid="ide-kanban-gantt">
      <div v-for="row in ganttRows" :key="row.task.id" class="ide-kanban__grow">
        <span class="ide-kanban__glabel" :title="`${row.task.title} · ${row.task.board}`">{{ row.task.title }}</span>
        <span class="ide-kanban__gtrack">
          <span class="ide-kanban__gbar" :class="{ 'is-done': !!row.task.completed_at }" :style="barStyle(row)" />
        </span>
      </div>
    </div>
    <p v-else-if="view === 'gantt' && tasks.length && !ganttRows.length" class="ui-empty-state ui-empty-state--compact">no started tasks</p>
  </div>
</template>

<style scoped lang="scss">
.ide-kanban { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12px; overflow: hidden; }
.ide-kanban__head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border-color); }
.ide-kanban__refresh { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--text-muted); }
.ide-kanban__views { display: inline-flex; gap: 2px; }
.ide-kanban__viewtab { border: 1px solid transparent; background: transparent; border-radius: 4px; cursor: pointer; font-size: 11px; padding: 1px 8px; color: var(--text-muted); }
.ide-kanban__viewtab.is-active { border-color: var(--primary-color); color: var(--primary-color); }
.ide-kanban__count { margin-left: auto; color: var(--text-muted); }
.ide-kanban__boardbar { flex: none; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--border-color); overflow-x: auto; }
.ide-kanban__boardchip { flex: none; border: 1px solid transparent; background: transparent; border-radius: 10px; cursor: pointer; font-size: 10px; line-height: 16px; padding: 0 6px; color: var(--text-muted); white-space: nowrap; }
.ide-kanban__boardchip.is-active { border-color: var(--primary-color); color: var(--primary-color); }
.ide-kanban__boardn { margin-left: 4px; opacity: .7; }
.ide-kanban__taskboard { flex: none; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; color: var(--text-muted); }
.ide-kanban__boardcell { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
.ide-kanban__error,.ide-kanban__board { flex: 1; display: flex; gap: 8px; overflow-x: auto; padding: 8px; }
.ide-kanban__col { flex: 0 0 168px; background: var(--hover-color, rgba(0,0,0,.03)); border-radius: 6px; padding: 6px; }
.ide-kanban__colhead { font-weight: 600; color: var(--text-muted); font-size: 11px; padding: 2px 4px 6px; }
.ide-kanban__card { display: flex; gap: 4px; align-items: baseline; background: var(--card-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 6px; margin-bottom: 4px; overflow: hidden; }
.ide-kanban__card--clickable { cursor: pointer; &:hover { border-color: var(--primary-color); } }
.ide-kanban__row--clickable { cursor: pointer; &:hover td { background: var(--hover-color, rgba(0,0,0,.04)); } }
.ide-kanban__prio { font-size: 10px; font-weight: 600; }
.is-p0 .ide-kanban__prio, td.is-p0 { color: var(--error); }
.is-p1 .ide-kanban__prio, td.is-p1 { color: var(--error); }
.is-p2 .ide-kanban__prio, td.is-p2 { color: var(--ia-stale); }
.ide-kanban__title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ide-kanban__assignee { font-size: 10px; color: var(--text-muted); }
.ide-kanban__list { width: 100%; border-collapse: collapse; }
.ide-kanban__list th { text-align: left; color: var(--text-muted); font-weight: 500; padding: 4px 8px; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; background: var(--card-color); }
.ide-kanban__list td { padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
td.is-title { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ide-kanban__lanes { flex: 1; overflow-y: auto; padding: 8px; }
.ide-kanban__lane { margin-bottom: 8px; }
.ide-kanban__lanehead { font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 2px 0; }
.ide-kanban__gantt { flex: 1; overflow-y: auto; padding: 8px; }
.ide-kanban__grow { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ide-kanban__glabel { flex: 0 0 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
.ide-kanban__gtrack { flex: 1; position: relative; height: 8px; background: var(--hover-color, rgba(0,0,0,.05)); border-radius: 4px; }
.ide-kanban__gbar { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--primary-color); opacity: .6; }
.ide-kanban__gbar.is-done { opacity: 1; }
</style>
