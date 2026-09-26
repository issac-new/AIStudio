<script setup lang="ts">
// IdeKanbanPane — IDE 内嵌看板（UI 融合 UI-10，multica 看板组织面四视图吸收落地）。
// 数据=studio 原生 kanban API（listBoards/listTasks）；四视图（list/board/swimlane/
// gantt）=boardorg 域同语义客户端排布：同一数据四种组织（表/列桶/泳道/时序）。
// 优先级五档映射 p0-p4；列=status 词表。只读视图（编辑走驾驶舱看板）。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listBoards, listTasks, type KanbanTask } from '@/api/hermes/kanban'

type BoardView = 'list' | 'board' | 'swimlane' | 'gantt'

const { t } = useI18n()
const tasks = ref<KanbanTask[]>([])
const loadError = ref('')
const loading = ref(false)
const view = ref<BoardView>('board')

const VIEWS: Array<{ key: BoardView; label: string }> = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'swimlane', label: 'Swimlane' },
  { key: 'gantt', label: 'Gantt' },
]

async function load(): Promise<void> {
  loading.value = true
  try {
    const boards = await listBoards()
    const board = boards.find((b) => !b.archived) ?? boards[0]
    const res = await listTasks(board ? { board: board.slug } : undefined)
    tasks.value = res.tasks ?? []
    loadError.value = ''
  } catch (err) {
    tasks.value = []
    loadError.value = err instanceof Error ? err.message : String(err)
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

    <p v-if="loadError" class="ide-kanban__error" data-testid="ide-kanban-error">{{ loadError }}</p>
    <p v-else-if="!loading && !tasks.length" class="ide-kanban__empty" data-testid="ide-kanban-empty">{{ t('ide.kanban.empty') }}</p>

    <!-- board：列桶 -->
    <div v-if="view === 'board' && tasks.length" class="ide-kanban__board" data-testid="ide-kanban-board">
      <div v-for="col in byColumn" :key="col.status" class="ide-kanban__col">
        <div class="ide-kanban__colhead">{{ col.status }} · {{ col.list.length }}</div>
        <div
          v-for="task in col.list"
          :key="task.id"
          class="ide-kanban__card"
          :class="`is-${prio(task.priority)}`"
          :data-testid="`ide-kanban-task-${task.id}`"
        >
          <span class="ide-kanban__prio">{{ prio(task.priority) }}</span>
          <span class="ide-kanban__title" :title="task.title">{{ task.title }}</span>
          <span class="ide-kanban__assignee">{{ task.assignee ?? '—' }}</span>
        </div>
      </div>
    </div>

    <!-- list：表 -->
    <table v-else-if="view === 'list' && tasks.length" class="ide-kanban__list" data-testid="ide-kanban-list">
      <thead><tr><th>#</th><th>prio</th><th>title</th><th>status</th><th>assignee</th></tr></thead>
      <tbody>
        <tr v-for="task in tasks" :key="task.id" :data-testid="`ide-kanban-task-${task.id}`">
          <td>{{ task.id.slice(0, 6) }}</td>
          <td :class="`is-${prio(task.priority)}`">{{ prio(task.priority) }}</td>
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
          class="ide-kanban__card"
          :class="`is-${prio(task.priority)}`"
        >{{ prio(task.priority) }} {{ task.title }}</span>
      </div>
    </div>

    <!-- gantt：时序条 -->
    <div v-else-if="view === 'gantt' && ganttRows.length" class="ide-kanban__gantt" data-testid="ide-kanban-gantt">
      <div v-for="row in ganttRows" :key="row.task.id" class="ide-kanban__grow">
        <span class="ide-kanban__glabel" :title="row.task.title">{{ row.task.title }}</span>
        <span class="ide-kanban__gtrack">
          <span class="ide-kanban__gbar" :class="{ 'is-done': !!row.task.completed_at }" :style="barStyle(row)" />
        </span>
      </div>
    </div>
    <p v-else-if="view === 'gantt' && tasks.length && !ganttRows.length" class="ide-kanban__empty">no started tasks</p>
  </div>
</template>

<style scoped lang="scss">
.ide-kanban { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12px; overflow: hidden; }
.ide-kanban__head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border-color, #eee); }
.ide-kanban__refresh { border: none; background: transparent; cursor: pointer; font-size: 14px; color: var(--text-color-3, #999); }
.ide-kanban__views { display: inline-flex; gap: 2px; }
.ide-kanban__viewtab { border: 1px solid transparent; background: transparent; border-radius: 4px; cursor: pointer; font-size: 11px; padding: 1px 8px; color: var(--text-color-3, #999); }
.ide-kanban__viewtab.is-active { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.ide-kanban__count { margin-left: auto; color: var(--text-color-3, #999); }
.ide-kanban__error, .ide-kanban__empty { padding: 12px; color: var(--text-color-3, #999); }
.ide-kanban__board { flex: 1; display: flex; gap: 8px; overflow-x: auto; padding: 8px; }
.ide-kanban__col { flex: 0 0 168px; background: var(--hover-color, rgba(0,0,0,.03)); border-radius: 6px; padding: 6px; }
.ide-kanban__colhead { font-weight: 600; color: var(--text-color-3, #999); font-size: 11px; padding: 2px 4px 6px; }
.ide-kanban__card { display: flex; gap: 4px; align-items: baseline; background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px; padding: 4px 6px; margin-bottom: 4px; overflow: hidden; }
.ide-kanban__prio { font-size: 10px; font-weight: 600; }
.is-p0 .ide-kanban__prio, td.is-p0 { color: #d03050; }
.is-p1 .ide-kanban__prio, td.is-p1 { color: #d06030; }
.is-p2 .ide-kanban__prio, td.is-p2 { color: #b8860b; }
.ide-kanban__title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ide-kanban__assignee { font-size: 10px; color: var(--text-color-3, #999); }
.ide-kanban__list { width: 100%; border-collapse: collapse; }
.ide-kanban__list th { text-align: left; color: var(--text-color-3, #999); font-weight: 500; padding: 4px 8px; border-bottom: 1px solid var(--border-color, #eee); position: sticky; top: 0; background: var(--card-color, #fff); }
.ide-kanban__list td { padding: 3px 8px; border-bottom: 1px solid var(--border-color, #f0f0f0); }
td.is-title { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ide-kanban__lanes { flex: 1; overflow-y: auto; padding: 8px; }
.ide-kanban__lane { margin-bottom: 8px; }
.ide-kanban__lanehead { font-size: 11px; font-weight: 600; color: var(--text-color-3, #999); padding: 2px 0; }
.ide-kanban__gantt { flex: 1; overflow-y: auto; padding: 8px; }
.ide-kanban__grow { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ide-kanban__glabel { flex: 0 0 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
.ide-kanban__gtrack { flex: 1; position: relative; height: 8px; background: var(--hover-color, rgba(0,0,0,.05)); border-radius: 4px; }
.ide-kanban__gbar { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--primary-color, #18a058); opacity: .6; }
.ide-kanban__gbar.is-done { opacity: 1; }
</style>
