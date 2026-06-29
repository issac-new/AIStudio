<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInput, NSelect, NSpace, NCheckbox, NModal, NForm, NFormItem, NTooltip, NPopconfirm } from 'naive-ui'
import type { KanbanAssignee, KanbanBoard } from '@/api/hermes/kanban'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const props = defineProps<{
  boards: KanbanBoard[]
  currentBoard?: string
  assignees: KanbanAssignee[]
  selectedAssignee?: string
  selectedTenant?: string
  searchQuery?: string
  loading?: boolean
  includeArchived?: boolean
  laneByProfile?: boolean
  tenants?: string[]
  taskCount?: number
}>()

const emit = defineEmits<{
  boardChange: [boardSlug: string]
  assigneeChange: [assignee: string]
  tenantChange: [tenant: string]
  searchChange: [query: string]
  refresh: []
  dispatch: []
  includeArchivedChange: [value: boolean]
  laneByProfileChange: [value: boolean]
  clearFilters: []
  createBoard: [data: { slug: string; name?: string; description?: string; icon?: string; color?: string; switchCurrent?: boolean }]
  archiveBoard: []
}>()

const { t } = useI18n()

function closeModal() {
  useCockpitStore().swarmKanbanVisible = false
}

// --- Board management (create + archive) ---------------------------------
const showCreateBoard = ref(false)
const boardForm = ref({
  slug: '',
  name: '',
  description: '',
  icon: '',
  color: '',
  switchCurrent: true,
})
const boardCreating = ref(false)

const boardSlugValid = computed(() => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(boardForm.value.slug.trim()))

function openCreateBoard() {
  boardForm.value = { slug: '', name: '', description: '', icon: '', color: '', switchCurrent: true }
  showCreateBoard.value = true
}

async function submitCreateBoard() {
  if (!boardSlugValid.value) return
  boardCreating.value = true
  try {
    emit('createBoard', {
      slug: boardForm.value.slug.trim(),
      name: boardForm.value.name.trim() || undefined,
      description: boardForm.value.description.trim() || undefined,
      icon: boardForm.value.icon.trim() || undefined,
      color: boardForm.value.color.trim() || undefined,
      switchCurrent: boardForm.value.switchCurrent,
    })
    showCreateBoard.value = false
  } finally {
    boardCreating.value = false
  }
}

const canArchiveCurrent = computed(() =>
  !!props.currentBoard && props.currentBoard !== 'default'
)

const assigneeOptions = computed(() => [
  { label: t('kanban.allAssignees'), value: '' },
  ...props.assignees.map(a => ({
    label: a.name,
    value: a.name,
  })),
])

const tenantOptions = computed(() => [
  { label: t('kanban.allTenants', 'All tenants'), value: '' },
  ...(props.tenants || []).map(tn => ({
    label: tn,
    value: tn,
  })),
])

const boardOptions = computed(() =>
  props.boards.map(b => ({
    label: `${b.name || b.slug} · ${b.total || 0}`,
    value: b.slug,
  }))
)

const searchInput = ref(props.searchQuery || '')

watch(() => props.searchQuery, (q) => {
  searchInput.value = q || ''
})

function handleSearch() {
  emit('searchChange', searchInput.value)
}

function handleBoardChange(value: string) {
  emit('boardChange', value)
}

function handleAssigneeChange(value: string) {
  emit('assigneeChange', value)
}

function handleTenantChange(value: string) {
  emit('tenantChange', value)
}

function handleRefresh() {
  emit('refresh')
}

function handleDispatch() {
  emit('dispatch')
}

function handleClearFilters() {
  searchInput.value = ''
  emit('clearFilters')
}

function handleIncludeArchivedChange(value: boolean) {
  emit('includeArchivedChange', value)
}

function handleLaneByProfileChange(value: boolean) {
  emit('laneByProfileChange', value)
}

const hasActiveFilters = computed(() =>
  !!props.searchQuery ||
  !!props.selectedAssignee ||
  !!props.selectedTenant ||
  !!props.includeArchived
)
</script>

<template>
  <div class="kanban-toolbar">
    <!-- Top row: Board selector + controls -->
    <div class="toolbar-top-row">
      <div class="toolbar-left">
        <NSelect
          :value="currentBoard"
          :options="boardOptions"
          size="small"
          class="board-select"
          @update:value="handleBoardChange"
        />
        <span v-if="taskCount !== undefined" class="task-count">{{ taskCount }} tasks</span>
      </div>
      <div class="toolbar-right">
        <NTooltip>
          <template #trigger>
            <NButton
              quaternary
              size="small"
              circle
              class="help-btn"
              @click="() => {}"
            >
              ?
            </NButton>
          </template>
          {{ t('kanban.helpTooltip', 'Kanban board help') }}
        </NTooltip>
        <NButton
          size="small"
          @click="openCreateBoard"
        >
          + {{ t('kanban.board.create', 'New board') }}
        </NButton>
        <NPopconfirm
          v-if="canArchiveCurrent"
          @positive-click="emit('archiveBoard')"
        >
          <template #trigger>
            <NButton
              quaternary
              size="small"
              :title="t('kanban.board.archive', 'Archive board')"
            >
              🗄️
            </NButton>
          </template>
          {{ t('kanban.board.archiveConfirm', { name: currentBoard }) }}
        </NPopconfirm>
        <NButton
          size="small"
          quaternary
          @click="closeModal"
          title="关闭"
        >
          ×
        </NButton>
      </div>
    </div>

    <!-- Filter row -->
    <div class="toolbar-filter-row">
      <div class="filter-group">
        <label class="filter-label">{{ t('common.search', 'SEARCH') }}</label>
        <NInput
          v-model:value="searchInput"
          size="small"
          :placeholder="t('kanban.searchPlaceholder', 'Filter cards...')"
          class="search-input"
          @keyup.enter="handleSearch"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">{{ t('kanban.tenant', 'TENANT') }}</label>
        <NSelect
          :value="selectedTenant || ''"
          :options="tenantOptions"
          size="small"
          class="filter-select"
          @update:value="handleTenantChange"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">{{ t('kanban.assignee', 'ASSIGNEE') }}</label>
        <NSelect
          :value="selectedAssignee || ''"
          :options="assigneeOptions"
          size="small"
          class="filter-select"
          @update:value="handleAssigneeChange"
        />
      </div>

      <div class="filter-checkboxes">
        <NCheckbox
          :checked="includeArchived"
          size="small"
          @update:checked="handleIncludeArchivedChange"
        >
          {{ t('kanban.showArchived', 'Show archived') }}
        </NCheckbox>
        <NCheckbox
          :checked="laneByProfile"
          size="small"
          @update:checked="handleLaneByProfileChange"
        >
          {{ t('kanban.lanesByProfile', 'Lanes by profile') }}
        </NCheckbox>
      </div>

      <div class="filter-actions">
        <NButton
          size="small"
          @click="handleDispatch"
        >
          {{ t('kanban.action.nudgeDispatcher', 'Nudge dispatcher') }}
        </NButton>
        <NButton
          size="small"
          :loading="loading"
          @click="handleRefresh"
        >
          {{ t('common.refresh') }}
        </NButton>
      </div>
    </div>

    <!-- Clear filters row -->
    <div v-if="hasActiveFilters" class="toolbar-clear-row">
      <NButton
        quaternary
        size="small"
        @click="handleClearFilters"
      >
        {{ t('kanban.clearFilters', 'Clear filters') }}
      </NButton>
    </div>

    <!-- Create-board dialog -->
    <NModal
      v-model:show="showCreateBoard"
      preset="card"
      :title="t('kanban.board.create', 'Create board')"
      :style="{ width: 'min(480px, calc(100vw - 32px))' }"
      :mask-closable="!boardCreating"
    >
      <NForm label-placement="top">
        <NFormItem :label="t('kanban.board.slug', 'Slug')" required>
          <NInput
            v-model:value="boardForm.slug"
            :placeholder="t('kanban.board.slugPlaceholder', 'my-board')"
            :status="boardForm.slug && !boardSlugValid ? 'error' : undefined"
          />
          <div v-if="boardForm.slug && !boardSlugValid" class="form-hint error">
            {{ t('kanban.board.slugInvalid', 'Lowercase letters, digits, - or _, max 64 chars') }}
          </div>
        </NFormItem>
        <NFormItem :label="t('kanban.board.name', 'Display name')">
          <NInput
            v-model:value="boardForm.name"
            :placeholder="t('kanban.board.namePlaceholder', 'My Board')"
          />
        </NFormItem>
        <NFormItem :label="t('kanban.board.description', 'Description')">
          <NInput
            v-model:value="boardForm.description"
            type="textarea"
            :rows="2"
          />
        </NFormItem>
        <div class="board-form-row">
          <NFormItem :label="t('kanban.board.icon', 'Icon')" class="flex-1">
            <NInput
              v-model:value="boardForm.icon"
              :placeholder="t('kanban.board.iconPlaceholder', 'emoji or name')"
            />
          </NFormItem>
          <NFormItem :label="t('kanban.board.color', 'Color')" class="flex-1">
            <NInput
              v-model:value="boardForm.color"
              :placeholder="t('kanban.board.colorPlaceholder', '#3b82f6')"
            />
          </NFormItem>
        </div>
        <NCheckbox v-model:checked="boardForm.switchCurrent">
          {{ t('kanban.board.switchToNew', 'Switch to the new board after creating') }}
        </NCheckbox>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateBoard = false">
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            type="primary"
            :loading="boardCreating"
            :disabled="!boardSlugValid"
            @click="submitCreateBoard"
          >
            {{ t('common.create') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-toolbar {
  padding: 12px 16px;
  border-bottom: 1px solid $border-light;
  background-color: $bg-card;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toolbar-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: $bg-secondary;
  border-radius: $radius-md;
  border: 1px solid $border-light;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.board-select {
  min-width: 180px;
}

.task-count {
  font-size: 13px;
  color: $text-muted;
}

.help-btn {
  font-weight: 600;
}

.toolbar-filter-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-select {
  min-width: 140px;
}

.search-input {
  min-width: 200px;
}

.filter-checkboxes {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 2px;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.toolbar-clear-row {
  display: flex;
  align-items: center;
}

.board-form-row {
  display: flex;
  gap: 12px;

  .flex-1 {
    flex: 1;
  }
}

.form-hint {
  font-size: 12px;
  margin-top: 4px;

  &.error {
    color: $error;
  }
}
</style>
