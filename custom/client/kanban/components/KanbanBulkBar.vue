<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NPopconfirm, NInputNumber, NSelect, NCheckbox } from 'naive-ui'
import type { KanbanTaskStatus } from '@/api/hermes/kanban'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  selectedCount: number
  totalCount: number
  supportedStatuses?: KanbanTaskStatus[]
  assignees?: string[]
}>()

const emit = defineEmits<{
  clear: []
  complete: []
  block: []
  unblock: []
  archive: []
  assign: [profile: string, reclaimFirst: boolean]
  delete: []
  setPriority: [priority: number]
  selectAllVisible: []
  moveToTodo: []
  moveToReady: []
}>()

const { t } = useI18n()

const hasSelection = computed(() => props.selectedCount > 0)

// Inline controls (source plugin style — no modals)
const priorityValue = ref<number | null>(null)
const assigneeValue = ref('')
const reclaimFirst = ref(false)

const assigneeOptions = computed(() => [
  { label: t('kanban.inlineCreate.noParent', '— reassign —'), value: '' },
  { label: t('kanban.unassigned', '(unassign)'), value: '__none__' },
  ...(props.assignees || []).map(a => ({
    label: a,
    value: a,
  })),
])

function handleClear() {
  emit('clear')
}

function handleComplete() {
  emit('complete')
}

function handleBlock() {
  emit('block')
}

function handleUnblock() {
  emit('unblock')
}

function handleArchive() {
  emit('archive')
}

function handleDelete() {
  emit('delete')
}

function handleSelectAllVisible() {
  emit('selectAllVisible')
}

function handleMoveToTodo() {
  emit('moveToTodo')
}

function handleMoveToReady() {
  emit('moveToReady')
}

function handleSetPriority() {
  if (priorityValue.value !== null) {
    emit('setPriority', priorityValue.value)
    priorityValue.value = null
  }
}

function handleApplyAssign() {
  if (!assigneeValue.value) return
  const profile = assigneeValue.value === '__none__' ? '' : assigneeValue.value
  emit('assign', profile, reclaimFirst.value)
  assigneeValue.value = ''
  reclaimFirst.value = false
}
</script>

<template>
  <div v-if="hasSelection" class="kanban-bulk-bar">
    <span class="bulk-count">
      {{ t('kanban.bulk.selected', { count: selectedCount }) }}
    </span>

    <!-- Status move buttons -->
    <NButton size="small" @click="handleMoveToTodo" title="Move selected tasks to Todo">
      {{ t('kanban.action.moveToTodo', '→ todo') }}
    </NButton>
    <NButton size="small" @click="handleMoveToReady" title="Move selected tasks to Ready">
      {{ t('kanban.action.moveToReady', '→ ready') }}
    </NButton>

    <NPopconfirm @positive-click="handleBlock">
      <template #trigger>
        <NButton size="small" type="warning">
          {{ t('kanban.action.block') }}
        </NButton>
      </template>
      {{ t('kanban.bulk.blockConfirm', { count: selectedCount }) }}
    </NPopconfirm>

    <NPopconfirm @positive-click="handleUnblock">
      <template #trigger>
        <NButton size="small">
          {{ t('kanban.action.unblock') }}
        </NButton>
      </template>
      {{ t('kanban.bulk.unblockConfirm', { count: selectedCount }) }}
    </NPopconfirm>

    <NPopconfirm @positive-click="handleComplete">
      <template #trigger>
        <NButton size="small" type="primary">
          {{ t('kanban.action.complete') }}
        </NButton>
      </template>
      {{ t('kanban.bulk.completeConfirm', { count: selectedCount }) }}
    </NPopconfirm>

    <NPopconfirm @positive-click="handleArchive">
      <template #trigger>
        <NButton size="small" type="error">
          {{ t('kanban.board.archive') }}
        </NButton>
      </template>
      {{ t('kanban.bulk.archiveConfirm', { count: selectedCount }) }}
    </NPopconfirm>

    <NPopconfirm @positive-click="handleDelete">
      <template #trigger>
        <NButton size="small" type="error" secondary>
          {{ t('common.delete') }}
        </NButton>
      </template>
      {{ t('kanban.message.deleteConfirm', 'Delete this task?') }}
    </NPopconfirm>

    <!-- Inline priority -->
    <div class="bulk-priority">
      <NInputNumber
        v-model:value="priorityValue"
        size="small"
        :min="0"
        :max="100"
        placeholder="pri"
        style="width: 70px"
      />
      <NButton size="small" :disabled="priorityValue === null" @click="handleSetPriority">
        {{ t('kanban.action.priority', 'Set priority') }}
      </NButton>
    </div>

    <!-- Inline reassign -->
    <div class="bulk-reassign">
      <NSelect
        v-model:value="assigneeValue"
        size="small"
        :options="assigneeOptions"
        filterable
        placeholder="— reassign —"
        style="width: 140px"
      />
      <NButton size="small" :disabled="!assigneeValue" @click="handleApplyAssign">
        {{ t('common.apply', 'Apply') }}
      </NButton>
    </div>

    <!-- Reclaim first checkbox -->
    <label class="reclaim-first-label" title="Reclaim any active claims before reassigning">
      <NCheckbox v-model:checked="reclaimFirst" size="small" />
      <span>{{ t('kanban.bulk.reclaimFirst', 'Reclaim first') }}</span>
    </label>

    <!-- Spacer + right-side actions -->
    <div class="bulk-spacer" />
    <NButton size="small" @click="handleSelectAllVisible">
      {{ t('kanban.selectAllVisible', 'Select all') }}
    </NButton>
    <NButton size="small" @click="handleClear">
      {{ t('common.clear') }}
    </NButton>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: rgba(var(--accent-primary-rgb), 0.08);
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.bulk-count {
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
  white-space: nowrap;
}

.bulk-priority,
.bulk-reassign {
  display: flex;
  align-items: center;
  gap: 4px;
}

.reclaim-first-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: $text-secondary;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    color: $text-primary;
  }
}

.bulk-spacer {
  flex: 1;
}
</style>
