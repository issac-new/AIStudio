<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NSpin, NCheckbox } from 'naive-ui'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'
import KanbanTaskCard from './KanbanTaskCard.vue'
import KanbanInlineCreate from './KanbanInlineCreate.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: KanbanTaskStatus
  title: string
  /** UX 裁决 E：挂载即展开行内建卡器（/app/board?new=1 深链直开建卡表单） */
  autoOpenCreate?: boolean
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

type KeyedKanbanTask = KanbanTask & { __taskKey?: string }
/** 聚合看板传入 TaskRef.key；单板旧调用没有复合键时仍使用日常原 ID。 */
function taskKey(task: KanbanTask): string {
  return (task as KeyedKanbanTask).__taskKey ?? task.id
}

const count = computed(() => props.tasks.length)
const showCreate = ref(!!props.autoOpenCreate)
// ?new=1 深链二次唤起（同页 query 变化）也展开
watch(() => props.autoOpenCreate, (on) => { if (on) showCreate.value = true })

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

const selectableTasks = computed(() => props.tasks.filter(task => !taskKey(task).startsWith('sim:')))
const allSelected = computed(() => selectableTasks.value.length > 0
  && selectableTasks.value.every(task => props.selectedIds?.has(taskKey(task))))

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
  const ids = selectableTasks.value.map(taskKey)
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
    :data-testid="`kanban-column-${status}`"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <div class="column-header" data-testid="kanban-column-header">
      <div class="column-title-row">
        <div class="column-title">
          <NCheckbox
            v-if="selectableTasks.length > 0"
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
            :key="taskKey(task)"
            :task="task"
            :selected="selectedIds?.has(taskKey(task))"
            :selected-count="selectedIds?.size"
            :comment-count="(task as any).comment_count"
            :link-counts="(task as any).link_counts"
            :progress="(task as any).progress"
            :warnings="(task as any).warnings"
            @click="(_taskId, multi, range) => handleTaskClick(taskKey(task), multi, range)"
            @toggle-select="handleToggleSelect(taskKey(task))"
            @drag-start="(_taskId, event, count) => handleTaskDragStart(taskKey(task), event, count)"
            @drag-end="(_taskId, event) => handleTaskDragEnd(taskKey(task), event)"
          />
        </div>
      </template>
      <template v-else-if="tasks.length > 0">
        <KanbanTaskCard
          v-for="task in tasks"
          :key="taskKey(task)"
          :task="task"
          :selected="selectedIds?.has(taskKey(task))"
          :selected-count="selectedIds?.size"
          :comment-count="(task as any).comment_count"
          :link-counts="(task as any).link_counts"
          :progress="(task as any).progress"
          :warnings="(task as any).warnings"
          @click="(_taskId, multi, range) => handleTaskClick(taskKey(task), multi, range)"
          @toggle-select="handleToggleSelect(taskKey(task))"
          @drag-start="(_taskId, event, count) => handleTaskDragStart(taskKey(task), event, count)"
          @drag-end="(_taskId, event) => handleTaskDragEnd(taskKey(task), event)"
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

// Pure Ink 语义状态色——与 KanbanTaskDrawer.kanban-dot / FleetGrid 同一张映射：
// triage=中性灰、ready=信息蓝、running=警告橙、blocked=错误红、done=成功绿、
// archived=弱化灰。scheduled / review 无专属语义，回落 muted 基色。
.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background-color: $text-muted;
  flex-shrink: 0;

  &.triage { background-color: $accent-muted; }
  &.todo { background-color: $text-muted; }
  &.scheduled { background-color: $text-muted; }
  &.ready { background-color: var(--accent-info); }
  &.running { background-color: $warning; }
  &.blocked { background-color: $error; }
  &.review { background-color: $text-muted; }
  &.done { background-color: $success; }
  &.archived { background-color: $accent-muted; }
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

/* D22 全页面优化：重列（实测 done 列 1158 卡、12.7 万 px）屏外渲染跳过。
 * 先例纪律（matrix-chat TimelinePanel 踩坑）：content-visibility 只加在滚动容器的
 * 直接子元素上（lane / 无 lane 时的卡），容器自身加会破 flex 布局；contain-intrinsic-size
 * 的 auto 前缀保留浏览器已量尺寸，滚动条稳定。 */
.column-body > .kanban-lane {
  content-visibility: auto;
  contain-intrinsic-size: auto 400px;
}
.column-body > .kanban-task-card {
  content-visibility: auto;
  contain-intrinsic-size: auto 96px;
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
