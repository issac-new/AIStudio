<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { NSpin, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useKanbanStore } from '@/stores/hermes/kanban'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'
import KanbanBoard from '@/custom/kanban/components/KanbanBoard.vue'
import KanbanToolbar from '@/custom/kanban/components/KanbanToolbar.vue'
import KanbanBulkBar from '@/custom/kanban/components/KanbanBulkBar.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'
import KanbanOrchestrationPanel from '@/custom/kanban/components/KanbanOrchestrationPanel.vue'
import KanbanAttentionStrip from '@/custom/kanban/components/KanbanAttentionStrip.vue'

const { t } = useI18n()
const message = useMessage()
const store = useKanbanStore()

const selectedTaskId = ref<string | null>(null)
const showTaskDrawer = ref(false)
const includeArchived = ref(false)
const laneByProfile = ref(false)
const tenantFilter = ref('')
const attentionExpanded = ref(false)

const filteredTasks = computed(() => {
  let tasks = store.tasks
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

onMounted(async () => {
  store.fetchCapabilities()
  // Fetch boards first so selectedBoard is resolved before fetching tasks
  await store.fetchBoards()
  store.fetchTasks()
  store.fetchStats()
  store.fetchAssignees()
  store.fetchDiagnostics()
  store.fetchOrchestration()
  store.connectEvents()
})

watch(() => store.selectedBoard, () => {
  store.fetchTasks()
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
      // No previous selection, just select this one
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
  // Normal click: open drawer
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
      await store.deleteTask(taskId)
      message.success(t('kanban.message.taskDeleted'))
    } catch (err) {
      message.error(t('kanban.message.deleteFailed'))
    }
    return
  }

  const task = store.tasks.find((t: KanbanTask) => t.id === taskId)
  if (!task || task.status === status) return

  try {
    await store.moveTask(taskId, status)
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
  try {
    await store.createTask(data)
    message.success(t('kanban.message.taskCreated'))
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
  store.fetchTasks()
  store.fetchStats()
  store.fetchAssignees()
}

function handleAttentionOpen(taskId: string) {
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

async function handleBulkComplete() {
  try {
    await store.bulkComplete(Array.from(selectedIds.value))
    message.success(t('kanban.message.taskCompleted'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkBlock() {
  try {
    await store.bulkBlock(Array.from(selectedIds.value))
    message.success(t('kanban.message.taskBlocked'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkUnblock() {
  try {
    await store.bulkUnblock(Array.from(selectedIds.value))
    message.success(t('kanban.message.taskUnblocked'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkArchive() {
  try {
    await store.bulkArchive(Array.from(selectedIds.value))
    message.success(t('kanban.message.taskArchived'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkDelete() {
  try {
    const ids = Array.from(selectedIds.value)
    await Promise.all(ids.map(id => store.deleteTask(id)))
    message.success(t('kanban.message.deleteSuccess'))
  } catch (err) {
    message.error(t('kanban.message.deleteFailed'))
  }
}

async function handleBulkSetPriority(priority: number) {
  try {
    const ids = Array.from(selectedIds.value)
    await Promise.all(ids.map(id => store.patchTask(id, { priority })))
    message.success(t('kanban.message.taskUpdated'))
  } catch (err) {
    message.error(t('kanban.message.updateFailed'))
  }
}

async function handleBulkAssign(profile: string, reclaimFirst: boolean) {
  try {
    const ids = Array.from(selectedIds.value)
    await Promise.all(ids.map(id => {
      if (reclaimFirst) {
        return store.reassignTask(id, profile || 'none', { reclaim: true })
      } else {
        return store.assignTask(id, profile || 'none')
      }
    }))
    message.success(t('kanban.message.taskAssigned'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkMoveToTodo() {
  try {
    const ids = Array.from(selectedIds.value)
    await Promise.all(ids.map(id => store.moveTask(id, 'todo')))
    message.success(t('kanban.message.taskMoved'))
  } catch (err) {
    message.error(t('kanban.message.moveFailed'))
  }
}

async function handleBulkMoveToReady() {
  try {
    const ids = Array.from(selectedIds.value)
    await Promise.all(ids.map(id => store.moveTask(id, 'ready')))
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
}

async function handleCreateBoard(data: { slug: string; name?: string; description?: string; icon?: string; color?: string; switchCurrent?: boolean }) {
  try {
    await store.createBoard({
      slug: data.slug,
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      switchCurrent: data.switchCurrent ?? true,
    })
    message.success(t('kanban.board.created', 'Board created'))
    await store.fetchTasks()
  } catch (err: any) {
    message.error(err?.message || t('kanban.board.createFailed', 'Failed to create board'))
  }
}

async function handleArchiveBoard() {
  try {
    await store.archiveSelectedBoard()
    message.success(t('kanban.board.archived', 'Board archived'))
    await store.fetchTasks()
  } catch (err: any) {
    message.error(err?.message || t('kanban.board.archiveFailed', 'Failed to archive board'))
  }
}

const tenants = computed(() => {
  const set = new Set<string>()
  for (const task of store.tasks) {
    if (task.tenant) set.add(task.tenant)
  }
  return Array.from(set).sort()
})

const assigneeNames = computed(() => store.assignees.map(a => a.name))
</script>

<template>
  <div class="kanban-view">
    <KanbanToolbar
      :boards="store.boards"
      :current-board="store.selectedBoard"
      :assignees="store.assignees"
      :selected-assignee="store.filterAssignee || ''"
      :selected-tenant="tenantFilter"
      :search-query="store.searchQuery"
      :loading="store.loading"
      :include-archived="includeArchived"
      :lane-by-profile="laneByProfile"
      :tenants="tenants"
      :task-count="filteredTasks.length"
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
      <NSpin v-if="store.loading && !store.tasks.length" size="large" class="page-loading" />
      <KanbanBoard
        v-else
        :tasks="filteredTasks"
        :loading="store.loading"
        :selected-ids="selectedIds"
        :include-archived="includeArchived"
        :lane-by-profile="laneByProfile"
        :parent-tasks="store.tasks.map(t => ({ id: t.id, title: t.title }))"
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
