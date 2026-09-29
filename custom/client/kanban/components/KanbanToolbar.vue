<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { NButton, NInput, NSelect, NSpace, NCheckbox, NModal, NForm, NFormItem, NTooltip, NPopconfirm } from 'naive-ui'
import type { KanbanAssignee, KanbanBoard, KanbanProject } from '@/api/hermes/kanban'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'

const props = defineProps<{
  boards: KanbanBoard[]
  currentBoard?: string
  assignees: KanbanAssignee[]
  selectedAssignee?: string
  selectedTenant?: string
  searchQuery?: string
  loading?: boolean
  includeArchived?: boolean
  /** P2 等您操作过滤（当前登录人的待做 R / 待审 A 卡） */
  mineOnly?: boolean
  laneByProfile?: boolean
  tenants?: string[]
  taskCount?: number
  /** v12.5 聚合模式：隐藏单板选择与归档（板筛选由外层多选 chips 承载） */
  hideBoardSelect?: boolean
  /** B12 命名视图：状态过滤值（快照/应用五元组之一） */
  statusFilter?: string | null
}>()

const emit = defineEmits<{
  boardChange: [boardSlug: string]
  assigneeChange: [assignee: string]
  tenantChange: [tenant: string]
  searchChange: [query: string]
  refresh: []
  dispatch: []
  includeArchivedChange: [value: boolean]
  mineOnlyChange: [value: boolean]
  laneByProfileChange: [value: boolean]
  clearFilters: []
  createBoard: [data: { slug: string; name?: string; description?: string; icon?: string; color?: string; switchCurrent?: boolean }]
  archiveBoard: []
  /** B12 命名视图：应用视图时的状态过滤（其余四元走既有事件） */
  statusChange: [status: string | null]
}>()

const { t } = useI18n()
const kanbanStore = useKanbanStore()  // HERMES_CUSTOM[v020]

// --- Board management (create + archive) ---------------------------------
const showCreateBoard = ref(false)
const boardForm = ref({
  slug: '',
  name: '',
  description: '',
  icon: '',
  color: '',
  switchCurrent: true,
  project: '',  // HERMES_CUSTOM[v020]
})
const boardCreating = ref(false)

// HERMES_CUSTOM[v020] BEGIN: projects for board scoping
const projects = ref<KanbanProject[]>([])
const projectOptions = computed(() => [
  { label: t('kanban.board.noProject', 'No project'), value: '' },
  ...projects.value.map(p => ({ label: `${p.name} (${p.slug})`, value: p.id })),
])

async function loadProjects() {
  try { projects.value = await kanbanStore.listProjects() } catch { projects.value = [] }
}
onMounted(loadProjects)
// HERMES_CUSTOM[v020] END

const boardSlugValid = computed(() => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(boardForm.value.slug.trim()))

function openCreateBoard() {
  boardForm.value = { slug: '', name: '', description: '', icon: '', color: '', switchCurrent: true, project: '' }
  loadProjects()  // HERMES_CUSTOM[v020]
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
      project: boardForm.value.project || undefined,  // HERMES_CUSTOM[v020]
    } as any)
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

// ── B12 命名视图（multica save-view 对照）：快照五元=板/状态/干系人/搜索/归档 ──
import { savedViewsState, saveView, removeView, snapshotEquals, type KanbanViewSnapshot } from '../saved-views'
const viewsOpen = ref(false)
const savedViews = savedViewsState()

function currentSnapshot(): KanbanViewSnapshot {
  return {
    board: props.currentBoard ?? 'default',
    status: props.statusFilter ?? null,
    assignee: props.selectedAssignee || null,
    search: props.searchQuery ?? '',
    includeArchived: !!props.includeArchived,
  }
}

function onSaveCurrentView(): void {
  const name = window.prompt('视图名称：', '')
  if (!name?.trim()) return
  saveView(name, currentSnapshot())
}

function applyView(v: { snapshot: KanbanViewSnapshot }): void {
  emit('boardChange', v.snapshot.board)
  emit('statusChange', v.snapshot.status)
  emit('assigneeChange', v.snapshot.assignee ?? '')
  emit('searchChange', v.snapshot.search)
  emit('includeArchivedChange', v.snapshot.includeArchived)
  viewsOpen.value = false
}

function viewIsCurrent(v: { snapshot: KanbanViewSnapshot }): boolean {
  return snapshotEquals(v.snapshot, currentSnapshot())
}
</script>

<template>
  <div class="kanban-toolbar">
    <!-- Top row: Board selector + controls -->
    <div class="toolbar-top-row">
      <div class="toolbar-left">
        <NSelect
          v-if="!hideBoardSelect"
          :value="currentBoard"
          :options="boardOptions"
          size="small"
          class="board-select"
          @update:value="handleBoardChange"
        />
        <span v-if="taskCount !== undefined" class="task-count">{{ taskCount }} tasks</span>
        <!-- B12 命名视图：保存当前过滤组合 / 一键切换 -->
        <div class="kanban-views">
          <button type="button" class="kanban-views__btn" data-testid="kanban-views-toggle" title="命名视图（保存当前过滤组合）" @click="viewsOpen = !viewsOpen">☰ 视图</button>
          <div v-if="viewsOpen" class="kanban-views__menu" data-testid="kanban-views-menu">
            <button type="button" class="kanban-views__save" data-testid="kanban-views-save" @click="onSaveCurrentView">＋ 保存当前为视图</button>
            <div v-if="!savedViews.views.length" class="kanban-views__empty">暂无已存视图</div>
            <div v-for="v in savedViews.views" :key="v.id" class="kanban-views__row">
              <button type="button" class="kanban-views__apply" :data-testid="`kanban-view-${v.id}`" :class="{ 'is-current': viewIsCurrent(v) }" @click="applyView(v)">
                {{ viewIsCurrent(v) ? '● ' : '' }}{{ v.name }}
              </button>
              <button type="button" class="kanban-views__del" :data-testid="`kanban-view-del-${v.id}`" title="删除" @click="removeView(v.id)">✕</button>
            </div>
          </div>
        </div>
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
          v-if="canArchiveCurrent && !hideBoardSelect"
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
<!-- overlay[ia2]: cockpit 全屏弹窗关闭按钮随 cockpit 退役删除（Task 8）——
     看板现内嵌于 /app/tasks，无"关闭弹窗"语义 -->
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
        <!-- P2 等您操作（2026-09-28 §三）：一键过滤我负责(R)/待我审(A)的卡 -->
        <NCheckbox
          :checked="mineOnly"
          size="small"
          data-testid="filter-mine-only"
          @update:checked="(v: boolean) => emit('mineOnlyChange', v)"
        >
          {{ t('kanban.mineOnly') }}
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
        <!-- HERMES_CUSTOM[v020] BEGIN: board project scope -->
        <NFormItem :label="t('kanban.board.project', 'Project')">
          <NSelect
            v-model:value="boardForm.project"
            :options="projectOptions"
            :placeholder="t('kanban.board.noProject', 'No project')"
            clearable
          />
          <div v-if="boardForm.project" class="form-hint">
            {{ t('kanban.board.projectHint', 'default_workdir will mirror the project\'s primary folder') }}
          </div>
        </NFormItem>
        <!-- HERMES_CUSTOM[v020] END -->
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
.kanban-views { position: relative; display: inline-block; }
.kanban-views__btn {
  border: 1px solid var(--border-color, #e0e0e0); background: none; border-radius: 4px;
  font-size: 11px; padding: 2px 8px; cursor: pointer; color: var(--text-color-2, #666);
}
.kanban-views__btn:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
.kanban-views__menu {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 300; min-width: 180px;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 4px;
}
.kanban-views__save, .kanban-views__apply {
  display: block; width: 100%; text-align: left; border: none; background: none;
  padding: 4px 8px; font-size: 12px; cursor: pointer; border-radius: 4px; color: var(--text-color-2, #444);
}
.kanban-views__save { color: var(--primary-color, #18a058); }
.kanban-views__apply:hover, .kanban-views__save:hover { background: var(--hover-color, rgba(0,0,0,0.05)); }
.kanban-views__apply.is-current { color: var(--primary-color, #18a058); }
.kanban-views__row { display: flex; align-items: center; }
.kanban-views__del { border: none; background: none; cursor: pointer; color: var(--text-color-3, #999); padding: 2px 6px; }
.kanban-views__empty { font-size: 11px; color: var(--text-color-3, #999); padding: 4px 8px; }
</style>
