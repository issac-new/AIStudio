<script setup lang="ts">
import { computed, ref } from 'vue'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'
import KanbanColumn from './KanbanColumn.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  tasks: KanbanTask[]
  loading?: boolean
  selectedIds?: Set<string>
  includeArchived?: boolean
  laneByProfile?: boolean
  parentTasks?: Array<{ id: string; title: string }>
}>()

const emit = defineEmits<{
  taskClick: [taskId: string, multiSelect: boolean, rangeSelect: boolean]
  toggleSelect: [taskId: string]
  selectAll: [taskIds: string[]]
  taskDragStart: [taskId: string, event: DragEvent, selectedCount: number]
  taskDragEnd: [taskId: string, event: DragEvent]
  columnDragOver: [status: KanbanTaskStatus | 'trash', event: DragEvent]
  columnDrop: [status: KanbanTaskStatus | 'trash', event: DragEvent]
  inlineCreate: [status: KanbanTaskStatus, data: any]
  deleteTask: [taskId: string]
}>()

const { t } = useI18n()

// Mirrors the 8-column board the agent dashboard backend emits
// (BOARD_COLUMNS in plugin_api.py). `review` is its own column — it is NOT
// folded into `done` — so the order/labels stay byte-identical to the
// reference plugin. `archived` is appended separately when toggled.
const VISIBLE_COLUMNS: KanbanTaskStatus[] = [
  'triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done',
]

const columnTitles: Record<string, string> = {
  triage: t('kanban.columns.triage'),
  todo: t('kanban.columns.todo'),
  scheduled: t('kanban.columns.scheduled'),
  ready: t('kanban.columns.ready'),
  running: t('kanban.columns.running'),
  blocked: t('kanban.columns.blocked'),
  done: t('kanban.columns.done'),
  archived: t('kanban.columns.archived'),
}

function bucketStatus(status: KanbanTaskStatus): KanbanTaskStatus {
  if (VISIBLE_COLUMNS.includes(status)) return status
  // `archived` is only shown when includeArchived is on; otherwise it is
  // hidden by tasksByColumn. Never collapse `review` into `done` here.
  if (status === 'archived') return 'done'
  return 'todo'
}

const tasksByColumn = computed(() => {
  const map: Record<string, KanbanTask[]> = {}
  for (const col of VISIBLE_COLUMNS) map[col] = []
  if (props.includeArchived) map['archived'] = []

  for (const task of props.tasks) {
    const bucket = task.status === 'archived' && props.includeArchived ? 'archived' : bucketStatus(task.status)
    if (map[bucket]) map[bucket].push(task)
  }

	  // Sort by priority desc, then created_at desc (newest first)
	  for (const col of Object.keys(map)) {
	    map[col].sort((a, b) => {
	      if (b.priority !== a.priority) return b.priority - a.priority
	      return b.created_at - a.created_at
	    })
  }
  return map
})

const allColumns = computed(() => {
  const cols = [...VISIBLE_COLUMNS]
  if (props.includeArchived) cols.push('archived')
  return cols
})

const dragOverColumn = ref<string | null>(null)
const dragOverTrash = ref(false)

function handleTaskClick(taskId: string, multiSelect: boolean, rangeSelect: boolean) {
  emit('taskClick', taskId, multiSelect, rangeSelect)
}

function handleToggleSelect(taskId: string) {
  emit('toggleSelect', taskId)
}

function handleSelectAll(taskIds: string[]) {
  emit('selectAll', taskIds)
}

function handleTaskDragStart(taskId: string, e: DragEvent, selectedCount: number) {
  emit('taskDragStart', taskId, e, selectedCount)
}

function handleTaskDragEnd(taskId: string, e: DragEvent) {
  emit('taskDragEnd', taskId, e)
  dragOverTrash.value = false
}

function handleColumnDragOver(status: KanbanTaskStatus, e: DragEvent) {
  dragOverColumn.value = status
  emit('columnDragOver', status, e)
}

function handleColumnDrop(status: KanbanTaskStatus, e: DragEvent) {
  dragOverColumn.value = null
  emit('columnDrop', status, e)
}

function handleInlineCreate(status: KanbanTaskStatus, data: any) {
  emit('inlineCreate', status, data)
}

function handleTrashDrop(e: DragEvent) {
  e.preventDefault()
  dragOverTrash.value = false
  emit('columnDrop', 'trash', e)
}
</script>

<template>
  <div class="kanban-board">
    <KanbanColumn
      v-for="status in allColumns"
      :key="status"
      :status="status"
      :title="columnTitles[status] || status"
      :tasks="tasksByColumn[status] || []"
      :loading="loading"
      :selected-ids="selectedIds"
      :lane-by-profile="laneByProfile"
      :parent-tasks="parentTasks"
      :class="{ 'drag-over': dragOverColumn === status }"
      @task-click="handleTaskClick"
      @toggle-select="handleToggleSelect"
      @select-all="handleSelectAll"
      @task-drag-start="handleTaskDragStart"
      @task-drag-end="handleTaskDragEnd"
      @drag-over="handleColumnDragOver"
      @drop="handleColumnDrop"
      @inline-create="handleInlineCreate"
    />

    <!-- Trash drop zone -->
    <div
      class="trash-drop-zone"
      :class="{ active: dragOverTrash }"
      @dragover.prevent="dragOverTrash = true"
      @dragleave="dragOverTrash = false"
      @drop="handleTrashDrop"
    >
      <span class="trash-icon">🗑️</span>
      <span class="trash-label">{{ t('kanban.trash.dropHere') }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 16px;
  height: 100%;
  align-items: flex-start;

  &::-webkit-scrollbar {
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: $border-color;
    border-radius: 4px;
  }
}

.trash-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 80px;
  min-width: 80px;
  height: 120px;
  margin-top: 40px;
  border: 2px dashed $border-color;
  border-radius: $radius-md;
  color: $text-muted;
  font-size: 12px;
  text-align: center;
  transition: all $transition-fast;
  opacity: 0.5;

  &.active {
    border-color: $error;
    background-color: rgba(var(--error-rgb, 239, 68, 68), 0.08);
    opacity: 1;
    transform: scale(1.05);
  }
}

.trash-icon {
  font-size: 24px;
  margin-bottom: 4px;
}
</style>
