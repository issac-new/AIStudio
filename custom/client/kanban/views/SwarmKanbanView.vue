<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { NSpin, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'
import { useWorkspaceStore } from '@/custom/ia2/store/workspace'
import KanbanBoard from '@/custom/kanban/components/KanbanBoard.vue'
import KanbanToolbar from '@/custom/kanban/components/KanbanToolbar.vue'
import KanbanBulkBar from '@/custom/kanban/components/KanbanBulkBar.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'
import KanbanOrchestrationPanel from '@/custom/kanban/components/KanbanOrchestrationPanel.vue'
import KanbanAttentionStrip from '@/custom/kanban/components/KanbanAttentionStrip.vue'

const { t } = useI18n()
const message = useMessage()
const store = useKanbanStore()
const workspace = useWorkspaceStore()

const selectedTaskId = ref<string | null>(null)
const showTaskDrawer = ref(false)
const includeArchived = ref(false)
const laneByProfile = ref(false)
const tenantFilter = ref('')
const attentionExpanded = ref(false)

// ── v12.5 聚合模式（用户裁定：合并展示所有 kanban 数据，板名多选筛选）──
// 数据源 = workspace.rawOverview（服务端跨板聚合端点，WS 看板事件驱动刷新）；
// 原单板数据链（store.tasks 仅 selectedBoard 一板）是"默认板为空 → 全 0"的
// 根因。板筛选用"排除集"语义：空集=全选（后增板自动并入），chip 点击切换。

const excludedBoards = ref<Set<string>>(new Set())

/** 板清单（聚合端点口径；名称+slug+总数） */
const boardList = computed(() => {
  const list = workspace.boards.length
    ? workspace.boards
    : [{ slug: 'default', name: 'default', total: 0 }]
  return list
})

function boardChecked(slug: string): boolean {
  return !excludedBoards.value.has(slug)
}

function toggleBoard(slug: string): void {
  const next = new Set(excludedBoards.value)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  excludedBoards.value = next
}

function checkAllBoards(): void {
  excludedBoards.value = new Set()
}

/** 任务 → 来源板（全量 raw 索引，不限筛选态） */
const taskBoard = computed(() => {
  const map = new Map<string, string>()
  for (const e of workspace.rawTasks) map.set(e.task.id, e.board)
  return map
})

function boardOf(taskId: string): string {
  return taskBoard.value.get(taskId) ?? 'default'
}

/** 合并任务（排除未勾选板）→ 原始 KanbanTask 形状（KanbanBoard 卡片直接吃） */
const mergedEntries = computed(() =>
  workspace.rawTasks.filter(e => !excludedBoards.value.has(e.board)))

const checkedBoardCount = computed(() =>
  boardList.value.filter(b => boardChecked(b.slug)).length)

const filteredTasks = computed(() => {
  let tasks: KanbanTask[] = mergedEntries.value.map(e => e.task)
  if (store.filterStatus) {
    tasks = tasks.filter((t: KanbanTask) => t.status === store.filterStatus)
  }
  if (store.filterAssignee) {
    tasks = tasks.filter((t: KanbanTask) => t.assignee === store.filterAssignee)
  }
  if (tenantFilter.value) {
    tasks = tasks.filter((t: KanbanTask) => t.tenant === tenantFilter.value)
  }
  if (!includeArchived.value) {
    tasks = tasks.filter((t: KanbanTask) => t.status !== 'archived')
  }
  if (store.searchQuery) {
    const q = store.searchQuery.toLowerCase()
    tasks = tasks.filter((t: KanbanTask) =>
      t.title.toLowerCase().includes(q) ||
      (t.body && t.body.toLowerCase().includes(q)) ||
      t.id.toLowerCase().includes(q) ||
      (t.result && t.result.toLowerCase().includes(q)) ||
      (t.assignee && t.assignee.toLowerCase().includes(q)) ||
      (t.tenant && t.tenant.toLowerCase().includes(q))
    )
  }
  // 默认按创建时间逆序（最新在最上面）
  return [...tasks].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
})

const selectedIds = computed(() => store.selectedIds)

/** 写操作板定位：先把 store 切到任务所在板（抽屉/诊断/估算等 store 域调用
 *  全部随 selectedBoard 走板参数），再执行动作，最后刷新聚合面 */
function withBoard<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
  const board = boardOf(taskId)
  if (board && board !== store.selectedBoard) store.setBoard(board)
  return fn().finally(() => { void workspace.refreshAllBoards(true) })
}

/** 批量动作分板执行：store 批量接口按 selectedBoard 一次一板 → 按板分组循环 */
function groupIdsByBoard(ids: string[]): Array<{ board: string; ids: string[] }> {
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const board = boardOf(id)
    const list = groups.get(board)
    if (list) list.push(id)
    else groups.set(board, [id])
  }
  return [...groups.entries()].map(([board, groupIds]) => ({ board, ids: groupIds }))
}

onMounted(async () => {
  store.fetchCapabilities()
  // 板清单先就绪（store 域写操作板定位依赖 boards 已加载）
  await store.fetchBoards()
  store.fetchStats()
  store.fetchAssignees()
  store.fetchDiagnostics()
  store.fetchOrchestration()
  store.connectEvents()
  // 聚合数据面（v12.5 主数据源；WS 看板事件驱动 500ms 去抖刷新）
  void workspace.refreshAllBoards(true)
})

// 单板详情链（抽屉内诊断/估算等）随板切换重取
watch(() => store.selectedBoard, () => {
  store.fetchStats()
  store.fetchAssignees()
  store.fetchDiagnostics()
  store.fetchOrchestration()
})

function handleTaskClick(taskId: string, multiSelect: boolean, rangeSelect: boolean) {
  if (multiSelect) {
    store.toggleSelection(taskId)
    return
  }
  if (rangeSelect) {
    // Shift+click: select range from last selected to clicked task
    const ids = filteredTasks.value.map(t => t.id)
    const clickedIndex = ids.indexOf(taskId)
    if (clickedIndex === -1) return

    // Find the last selected task index
    let lastSelectedIndex = -1
    for (let i = ids.length - 1; i >= 0; i--) {
      if (store.selectedIds.has(ids[i])) {
        lastSelectedIndex = i
        break
      }
    }

    if (lastSelectedIndex === -1) {
      // No previous selection, just select this task
      store.selectedIds.add(taskId)
    } else {
      // Select range between lastSelectedIndex and clickedIndex
      const start = Math.min(lastSelectedIndex, clickedIndex)
      const end = Math.max(lastSelectedIndex, clickedIndex)
      for (let i = start; i <= end; i++) {
        store.selectedIds.add(ids[i])
      }
    }
    return
  }
  // Normal click: 抽屉前先切到任务所在板（详情/诊断/估算全部板感知）
  const board = boardOf(taskId)
  if (board && board !== store.selectedBoard) store.setBoard(board)
  selectedTaskId.value = taskId
  showTaskDrawer.value = true
}

function handleSelectAll(taskIds: string[]) {
  for (const id of taskIds) {
    store.selectedIds.add(id)
  }
}

function handleTaskDrawerClose() {
  showTaskDrawer.value = false
  selectedTaskId.value = null
}

function handleTaskDragStart(taskId: string, e: DragEvent, _selectedCount: number) {
  e.dataTransfer?.setData('text/plain', taskId)
  e.dataTransfer?.setData('text/x-hermes-task', taskId)
}

function handleTaskDragEnd(_taskId: string, _e: DragEvent) {
  // cleanup if needed
}

async function handleColumnDrop(status: KanbanTaskStatus | 'trash', e: DragEvent) {
  const taskId = e.dataTransfer?.getData('text/x-hermes-task') || e.dataTransfer?.getData('text/plain')
  if (!taskId) return

  if (status === 'trash') {
    try {
      await withBoard(taskId, () => store.deleteTask(taskId))
      message.success(t('kanban.message.taskDeleted'))
    } catch (err) {
      message.error(t('kanban.message.deleteFailed'))
    }
    return
  }

  const entry = mergedEntries.value.find(x => x.task.id === taskId)
  if (!entry || entry.task.status === status) return

  try {
    await withBoard(taskId, () => store.moveTask(taskId, status))
    message.success(t('kanban.message.taskMoved'))
  } catch (err) {
    message.error(t('kanban.message.moveFailed'))
  }
}

function handleColumnDragOver(_status: KanbanTaskStatus | 'trash', e: DragEvent) {
  e.preventDefault()
  // visual feedback handled by KanbanColumn
}

async function handleInlineCreate(_status: KanbanTaskStatus, data: any) {
  // 聚合模式：仅勾选唯一板时可就地新建（目标板无歧义）
  if (checkedBoardCount.value !== 1) {
    message.warning(t('kanban.message.aggregateCreateHint'))
    return
  }
  const board = boardList.value.find(b => boardChecked(b.slug))?.slug
  if (!board) return
  try {
    if (board !== store.selectedBoard) store.setBoard(board)
    await store.createTask(data)
    message.success(t('kanban.message.taskCreated'))
    void workspace.refreshAllBoards(true)
  } catch (err) {
    message.error(t('kanban.message.createFailed'))
  }
}

function handleBoardChange(boardSlug: string) {
  store.setBoard(boardSlug)
}

function handleAssigneeChange(assignee: string) {
  store.setAssigneeFilter(assignee || undefined)
}

function handleSearchChange(query: string) {
  store.setSearchQuery(query)
}

function handleRefresh() {
  void workspace.refreshAllBoards(true)
  store.fetchStats()
  store.fetchAssignees()
}

function handleAttentionOpen(taskId: string) {
  const board = boardOf(taskId)
  if (board && board !== store.selectedBoard) store.setBoard(board)
  selectedTaskId.value = taskId
  showTaskDrawer.value = true
}

function handleBulkClear() {
  store.clearSelection()
}

function handleBulkSelectAllVisible() {
  for (const task of filteredTasks.value) {
    if (!store.selectedIds.has(task.id)) {
      store.selectedIds.add(task.id)
    }
  }
}

/** 批量动作通用执行器：按板分组 → 逐组切板执行 → 刷新聚合 */
async function runBulk(
  action: (ids: string[]) => Promise<unknown>,
  ids: string[],
): Promise<void> {
  for (const group of groupIdsByBoard(ids)) {
    if (group.board && group.board !== store.selectedBoard) store.setBoard(group.board)
    await action(group.ids)
  }
  await workspace.refreshAllBoards(true)
}

async function handleBulkComplete() {
  try {
    await runBulk(ids => store.bulkComplete(ids), Array.from(selectedIds.value))
    message.success(t('kanban.message.taskCompleted'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkBlock() {
  try {
    await runBulk(ids => store.bulkBlock(ids), Array.from(selectedIds.value))
    message.success(t('kanban.message.taskBlocked'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkUnblock() {
  try {
    await runBulk(ids => store.bulkUnblock(ids), Array.from(selectedIds.value))
    message.success(t('kanban.message.taskUnblocked'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkArchive() {
  try {
    await runBulk(ids => store.bulkArchive(ids), Array.from(selectedIds.value))
    message.success(t('kanban.message.taskArchived'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkDelete() {
  try {
    const ids = Array.from(selectedIds.value)
    await runBulk(async groupIds => {
      for (const id of groupIds) await store.deleteTask(id)
    }, ids)
    message.success(t('kanban.message.deleteSuccess'))
  } catch (err) {
    message.error(t('kanban.message.deleteFailed'))
  }
}

async function handleBulkSetPriority(priority: number) {
  try {
    const ids = Array.from(selectedIds.value)
    await runBulk(async groupIds => {
      for (const id of groupIds) await store.patchTask(id, { priority })
    }, ids)
    message.success(t('kanban.message.taskUpdated'))
  } catch (err) {
    message.error(t('kanban.message.updateFailed'))
  }
}

async function handleBulkAssign(profile: string, reclaimFirst: boolean) {
  try {
    const ids = Array.from(selectedIds.value)
    await runBulk(async groupIds => {
      for (const id of groupIds) {
        if (reclaimFirst) {
          await store.reassignTask(id, profile || 'none', { reclaim: true })
        } else {
          await store.assignTask(id, profile || 'none')
        }
      }
    }, ids)
    message.success(t('kanban.message.taskAssigned'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkMoveToTodo() {
  try {
    const ids = Array.from(selectedIds.value)
    await runBulk(async groupIds => {
      for (const id of groupIds) await store.moveTask(id, 'todo')
    }, ids)
    message.success(t('kanban.message.taskMoved'))
  } catch (err) {
    message.error(t('kanban.message.moveFailed'))
  }
}

async function handleBulkMoveToReady() {
  try {
    const ids = Array.from(selectedIds.value)
    await runBulk(async groupIds => {
      for (const id of groupIds) await store.moveTask(id, 'ready')
    }, ids)
    message.success(t('kanban.message.taskMoved'))
  } catch (err) {
    message.error(t('kanban.message.moveFailed'))
  }
}

function handleTenantChange(tenant: string) {
  tenantFilter.value = tenant
}

function handleIncludeArchivedChange(value: boolean) {
  includeArchived.value = value
}

function handleLaneByProfileChange(value: boolean) {
  laneByProfile.value = value
}

async function handleDispatch() {
  try {
    await store.dispatch()
    message.success(t('kanban.message.dispatchNudged'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

function handleClearFilters() {
  store.setSearchQuery('')
  store.setStatusFilter('')
  store.setAssigneeFilter('')
  tenantFilter.value = ''
  includeArchived.value = false
  checkAllBoards()
}

async function handleCreateBoard(data: { slug: string; name?: string; description?: string; icon?: string; color?: string; switchCurrent?: boolean; project?: string }) {
  try {
    await store.createBoard({
      slug: data.slug,
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      switchCurrent: data.switchCurrent ?? true,
      project: data.project,  // HERMES_CUSTOM[v020]
    })
    message.success(t('kanban.board.created', 'Board created'))
    await workspace.refreshAllBoards(true)
  } catch (err: any) {
    message.error(err?.message || t('kanban.board.createFailed', 'Failed to create board'))
  }
}

async function handleArchiveBoard() {
  try {
    await store.archiveSelectedBoard()
    message.success(t('kanban.board.archived', 'Board archived'))
    await workspace.refreshAllBoards(true)
  } catch (err: any) {
    message.error(err?.message || t('kanban.board.archiveFailed', 'Failed to archive board'))
  }
}

const tenants = computed(() => {
  const set = new Set<string>()
  for (const entry of workspace.rawTasks) {
    if (entry.task.tenant) set.add(entry.task.tenant)
  }
  return Array.from(set).sort()
})

/** 指派人选项：聚合任务全集去重（跨板），并入 store 单板清单兜底 */
const assigneeNames = computed(() => {
  const set = new Set<string>()
  for (const entry of workspace.rawTasks) {
    if (entry.task.assignee) set.add(entry.task.assignee)
  }
  for (const a of store.assignees) set.add(a.name)
  return Array.from(set).sort()
})

/** 工具栏下拉选项形状（KanbanAssignee 最小结构子集——只用 name） */
const mergedAssignees = computed(() => assigneeNames.value.map(name => ({ name })))
</script>

<template>
  <div class="kanban-view">
    <!-- v12.5 板多选筛选：合并全部看板数据，板名 chip 可复选（排除集语义） -->
    <div class="kanban-boardbar" data-testid="kanban-boardbar">
      <span class="kanban-boardbar__label">{{ t('kanban.board.filterLabel') }}</span>
      <button
        type="button"
        class="kanban-boardbar__chip kanban-boardbar__chip--all"
        :class="{ 'is-on': excludedBoards.size === 0 }"
        data-testid="kanban-board-chip-all"
        @click="checkAllBoards"
      >{{ t('kanban.board.filterAll') }}</button>
      <button
        v-for="b in boardList" :key="b.slug"
        type="button"
        class="kanban-boardbar__chip"
        :class="{ 'is-on': boardChecked(b.slug) }"
        :data-testid="`kanban-board-chip-${b.slug}`"
        :title="b.slug"
        @click="toggleBoard(b.slug)"
      >{{ boardChecked(b.slug) ? '✓ ' : '' }}{{ b.name }}<span class="kanban-boardbar__n">{{ b.total }}</span></button>
    </div>

    <KanbanToolbar
      :boards="store.boards"
      :current-board="store.selectedBoard"
      :assignees="mergedAssignees as any"
      :selected-assignee="store.filterAssignee || ''"
      :selected-tenant="tenantFilter"
      :search-query="store.searchQuery"
      :loading="store.loading"
      :include-archived="includeArchived"
      :lane-by-profile="laneByProfile"
      :tenants="tenants"
      :task-count="filteredTasks.length"
      hide-board-select
      @board-change="handleBoardChange"
      @assignee-change="handleAssigneeChange"
      @tenant-change="handleTenantChange"
      @search-change="handleSearchChange"
      @include-archived-change="handleIncludeArchivedChange"
      @lane-by-profile-change="handleLaneByProfileChange"
      @refresh="handleRefresh"
      @dispatch="handleDispatch"
      @clear-filters="handleClearFilters"
      @create-board="handleCreateBoard"
      @archive-board="handleArchiveBoard"
    />

    <KanbanOrchestrationPanel />

    <KanbanAttentionStrip
      :diagnostics="store.diagnostics"
      :expanded="attentionExpanded"
      @toggle="attentionExpanded = !attentionExpanded"
      @open="handleAttentionOpen"
      @refresh="store.fetchDiagnostics()"
    />

    <KanbanBulkBar
      :selected-count="selectedIds.size"
      :total-count="filteredTasks.length"
      :assignees="assigneeNames"
      @clear="handleBulkClear"
      @select-all-visible="handleBulkSelectAllVisible"
      @complete="handleBulkComplete"
      @block="handleBulkBlock"
      @unblock="handleBulkUnblock"
      @archive="handleBulkArchive"
      @delete="handleBulkDelete"
      @set-priority="handleBulkSetPriority"
      @assign="handleBulkAssign"
      @move-to-todo="handleBulkMoveToTodo"
      @move-to-ready="handleBulkMoveToReady"
    />

    <div class="board-container">
      <NSpin v-if="store.loading && !filteredTasks.length" size="large" class="page-loading" />
      <KanbanBoard
        v-else
        :tasks="filteredTasks"
        :loading="store.loading"
        :selected-ids="selectedIds"
        :include-archived="includeArchived"
        :lane-by-profile="laneByProfile"
        :parent-tasks="filteredTasks.map(t => ({ id: t.id, title: t.title }))"
        @task-click="handleTaskClick"
        @select-all="handleSelectAll"
        @task-drag-start="handleTaskDragStart"
        @task-drag-end="handleTaskDragEnd"
        @column-drag-over="handleColumnDragOver"
        @column-drop="handleColumnDrop"
        @inline-create="handleInlineCreate"
      />
    </div>

    <!-- Task detail drawer -->
    <KanbanTaskDrawer
      v-model:show="showTaskDrawer"
      :task-id="selectedTaskId"
      @close="handleTaskDrawerClose"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* v12.5 板多选筛选条：合并全部看板数据 + 板名 chip 复选 */
.kanban-boardbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-card, inherit);
  flex-shrink: 0;
}
.kanban-boardbar__label { font-size: 11px; color: var(--text-muted, #878c99); flex-shrink: 0; }
.kanban-boardbar__chip {
  display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 10px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 11px;
  background: transparent; color: var(--text-secondary, inherit);
  font-size: 11px; cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary, inherit); border-color: var(--text-muted, #999); }
  &.is-on {
    background: var(--primary-color, var(--accent-primary, #3b82f6));
    border-color: transparent; color: #fff;
  }
}
.kanban-boardbar__chip--all.is-on { background: transparent; color: var(--text-primary, inherit); border-color: var(--primary-color, #3b82f6); }
.kanban-boardbar__n {
  font-size: 10px; opacity: 0.75; font-variant-numeric: tabular-nums;
}

.board-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.page-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
