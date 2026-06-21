<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NSpin, NCheckbox } from 'naive-ui'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'
import KanbanTaskCard from './KanbanTaskCard.vue'
import KanbanInlineCreate from './KanbanInlineCreate.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: KanbanTaskStatus
  title: string
  tasks: KanbanTask[]
  loading?: boolean
  selectedIds?: Set<string>
  laneByProfile?: boolean
  parentTasks?: Array<{ id: string; title: string }>
}>()

const emit = defineEmits<{
  taskClick: [taskId: string, multiSelect: boolean, rangeSelect: boolean]
  toggleSelect: [taskId: string]
  selectAll: [taskIds: string[]]
  taskDragStart: [taskId: string, event: DragEvent, selectedCount: number]
  taskDragEnd: [taskId: string, event: DragEvent]
  dragOver: [status: KanbanTaskStatus, event: DragEvent]
  drop: [status: KanbanTaskStatus, event: DragEvent]
  inlineCreate: [status: KanbanTaskStatus, data: any]
}>()

const { t } = useI18n()

const count = computed(() => props.tasks.length)
const showCreate = ref(false)

// Lane-by-profile sub-grouping. Mirrors the agent dashboard:
// applied ONLY to the "running" column. Tasks are bucketed by assignee
// (falling back to "(unassigned)"), the buckets are sorted alphabetically,
// and each renders with its own header (name + count). When disabled or
// on another column, this is null and the body renders the flat list.
const lanes = computed<Array<{ assignee: string; tasks: KanbanTask[] }> | null>(() => {
  if (!props.laneByProfile || props.status !== 'running') return null
  const byProfile: Record<string, KanbanTask[]> = {}
  for (const tk of props.tasks) {
    const key = tk.assignee || '(unassigned)'
    ;(byProfile[key] ||= []).push(tk)
  }
  return Object.keys(byProfile).sort().map(k => ({ assignee: k, tasks: byProfile[k] }))
})

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  emit('dragOver', props.status, e)
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  emit('drop', props.status, e)
}

const allSelected = computed(() => props.tasks.length > 0 && props.tasks.every(t => props.selectedIds?.has(t.id)))

const columnSubtitle = computed(() => {
  const subtitles: Record<string, string> = {
    triage: t('kanban.columnSubtitles.triage', 'Raw ideas — a specifier will flesh out the spec'),
    todo: t('kanban.columnSubtitles.todo', 'Waiting on dependencies or unassigned'),
    scheduled: t('kanban.columnSubtitles.scheduled', 'Waiting on a known time delay or scheduled follow-up'),
    ready: t('kanban.columnSubtitles.ready', 'Dependencies satisfied; assign a profile to dispatch'),
    running: t('kanban.columnSubtitles.running', 'Claimed by a worker — in-flight'),
    blocked: t('kanban.columnSubtitles.blocked', 'Worker asked for human input'),
    done: t('kanban.columnSubtitles.done', 'Completed'),
    archived: t('kanban.columnSubtitles.archived', 'Archived tasks'),
  }
  return subtitles[props.status] || ''
})

function handleSelectAll() {
  const ids = props.tasks.map(t => t.id)
  if (allSelected.value) {
    // Deselect all in this column
    for (const id of ids) {
      emit('toggleSelect', id)
    }
  } else {
    emit('selectAll', ids)
  }
}

function handleTaskClick(taskId: string, multiSelect: boolean, rangeSelect: boolean) {
  emit('taskClick', taskId, multiSelect, rangeSelect)
}

function handleToggleSelect(taskId: string) {
  emit('toggleSelect', taskId)
}

function handleTaskDragStart(taskId: string, e: DragEvent, selectedCount: number) {
  emit('taskDragStart', taskId, e, selectedCount)
}

function handleTaskDragEnd(taskId: string, e: DragEvent) {
  emit('taskDragEnd', taskId, e)
}

function toggleCreate() {
  showCreate.value = !showCreate.value
}

function handleInlineCreateSubmit(data: any) {
  emit('inlineCreate', props.status, data)
  showCreate.value = false
}

function handleInlineCreateCancel() {
  showCreate.value = false
}
</script>

<template>
  <div
    class="kanban-column"
    :data-status="status"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <div class="column-header">
      <div class="column-title-row">
        <div class="column-title">
          <NCheckbox
            v-if="tasks.length > 0"
            size="small"
            :checked="allSelected"
            class="col-check"
            @update:checked="handleSelectAll"
            @click.stop
          />
          <span class="status-dot" :class="status"></span>
          <span class="title-text">{{ title }}</span>
          <span class="count-badge">{{ count }}</span>
        </div>
        <NButton
          quaternary
          size="tiny"
          class="add-btn"
          @click="toggleCreate"
        >
          {{ showCreate ? '×' : '+' }}
        </NButton>
      </div>
      <div v-if="columnSubtitle" class="column-subtitle">{{ columnSubtitle }}</div>
    </div>

    <!-- Inline create form (toggled by +) -->
    <KanbanInlineCreate
      v-if="showCreate"
      :status="status"
      :parent-tasks="parentTasks || []"
      @create="handleInlineCreateSubmit"
      @cancel="handleInlineCreateCancel"
    />

    <div class="column-body">
      <NSpin v-if="loading" size="small" class="column-loading" />
      <template v-else-if="lanes">
        <div v-for="lane in lanes" :key="lane.assignee" class="kanban-lane">
          <div class="lane-head">
            <span class="lane-name">{{ lane.assignee }}</span>
            <span class="lane-count">{{ lane.tasks.length }}</span>
          </div>
          <KanbanTaskCard
            v-for="task in lane.tasks"
            :key="task.id"
            :task="task"
            :selected="selectedIds?.has(task.id)"
            :selected-count="selectedIds?.size"
            :comment-count="(task as any).comment_count"
            :link-counts="(task as any).link_counts"
            :progress="(task as any).progress"
            :warnings="(task as any).warnings"
            @click="handleTaskClick"
            @toggle-select="handleToggleSelect"
            @drag-start="handleTaskDragStart"
            @drag-end="handleTaskDragEnd"
          />
        </div>
      </template>
      <template v-else-if="tasks.length > 0">
        <KanbanTaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :selected="selectedIds?.has(task.id)"
          :selected-count="selectedIds?.size"
          :comment-count="(task as any).comment_count"
          :link-counts="(task as any).link_counts"
          :progress="(task as any).progress"
          :warnings="(task as any).warnings"
          @click="handleTaskClick"
          @toggle-select="handleToggleSelect"
          @drag-start="handleTaskDragStart"
          @drag-end="handleTaskDragEnd"
        />
      </template>
      <div v-else class="column-empty">
        {{ t('kanban.noTasks') }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-column {
  display: flex;
  flex-direction: column;
  // 280px matches the reference plugin's `flex: 0 0 280px` column.
  flex: 0 0 280px;
  width: 280px;
  min-width: 280px;
  // Card face at ~85% opacity, like the reference's
  // `color-mix(in srgb, var(--color-card) 85%, transparent)`.
  background-color: rgba(var(--accent-primary-rgb), 0.04);
  border-radius: $radius-md;
  border: 1px solid $border-light;
  padding: 0.5rem;
  min-height: 200px;
  max-height: calc(100vh - 220px);
  transition: border-color 120ms ease, background-color 120ms ease;

  &.drag-over {
    border-color: $accent-primary;
    background-color: rgba(var(--accent-primary-rgb), 0.08);
  }
}

.column-header {
  display: flex;
  flex-direction: column;
  padding: 0.25rem 0.25rem 0.35rem;
  gap: 4px;
}

.column-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.column-subtitle {
  padding: 0 0.25rem 0.5rem;
  font-size: 0.7rem;
  color: $text-muted;
  font-style: italic;
  line-height: 1.3;
  border-bottom: 1px solid rgba(var(--accent-primary-rgb), 0.12);
  margin-bottom: 0.5rem;
}

.col-check {
  margin-right: 4px;
}

.column-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: $text-primary;
}

// Status dot colours mirror the reference plugin verbatim
// (`hermes-kanban-dot-*` in dist/style.css). scheduled / review have no
// dedicated dot in the reference and fall back to the muted base.
.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background-color: $text-muted;
  flex-shrink: 0;

  &.triage { background-color: #b47dd6; }
  &.todo { background-color: $text-muted; }
  &.scheduled { background-color: $text-muted; }
  &.ready { background-color: #d4b348; }
  &.running { background-color: #3fb97d; }
  &.blocked { background-color: $error; }
  &.review { background-color: $text-muted; }
  &.done { background-color: #4a8cd1; }
  &.archived { background-color: $border-color; }
}

.count-badge {
  font-size: 0.75rem;
  font-weight: 500;
  color: $text-muted;
  font-variant-numeric: tabular-nums;
  background-color: transparent;
  padding: 0;
  border-radius: 0;
}

.add-btn {
  font-size: 1rem;
  padding: 0;
  width: 22px;
  height: 22px;
}

.column-body {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-height: 0;
}

.column-loading {
  padding: 20px;
  display: flex;
  justify-content: center;
}

.column-empty {
  padding: 1.5rem 0.5rem;
  text-align: center;
  font-size: 0.75rem;
  color: $text-muted;
  border: 1px dashed rgba(var(--accent-primary-rgb), 0.2);
  border-radius: $radius-sm;
}

// Lanes (per-profile sub-grouping inside the Running column).
// Lane headers use a mono font and are intentionally NOT uppercased:
// assignee/profile names are case-sensitive, so uppercasing them would make
// a valid `analyst` profile render as `ANALYST` and users could copy the
// wrong casing back into edits. (Matches the reference plugin's note.)
.kanban-lane {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.25rem 0 0.35rem;
  border-top: 1px dashed rgba(var(--accent-primary-rgb), 0.18);

  &:first-child {
    border-top: 0;
    padding-top: 0;
  }
}

.lane-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.1rem;
}

.lane-name {
  font-size: 0.65rem;
  font-weight: 600;
  font-family: $font-code;
  letter-spacing: 0.02em;
  color: $text-muted;
}

.lane-count {
  margin-left: auto;
  font-size: 0.65rem;
  color: $text-muted;
  font-variant-numeric: tabular-nums;
}

.column-body::-webkit-scrollbar {
  width: 4px;
}

.column-body::-webkit-scrollbar-track {
  background: transparent;
}

.column-body::-webkit-scrollbar-thumb {
  background-color: $border-color;
  border-radius: 2px;
}
</style>
