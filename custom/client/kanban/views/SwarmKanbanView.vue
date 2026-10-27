<script setup lang="ts">

// UX 裁决 E（2026-10-03）：?new=1 直达链接打开建卡表单——TasksView 传入后首列展开建卡器。
// statuses：视图级状态过滤（阶段页用；空=全量）。不改 store，避免污染常用看板。
// openTaskId：任务直达（?task=）——数据就绪后直接打开抽屉，不再只填搜索框。
const props = defineProps<{ autoOpenCreate?: boolean; statuses?: readonly string[]; openTaskId?: string | null }>()
import { ref, computed, onMounted, watch } from 'vue'
import { NSpin, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useKanbanStore } from '@/stores/hermes/kanban'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'
import { getStoredUsername } from '@/api/client'
import { needsMyAction } from '../utils/raci'
import { nudgeRoute } from '../../ia2/api/gatekeeper'
import { taskMatchesQuery } from '../utils/task-search'
import { filterTasksByStatuses } from '../utils/task-status-filter'
import { isWritableTask, useWorkspaceStore, type TaskRef } from '@/custom/ia2/store/workspace'
import KanbanBoard from '@/custom/kanban/components/KanbanBoard.vue'
import KanbanToolbar from '@/custom/kanban/components/KanbanToolbar.vue'
import KanbanBulkBar from '@/custom/kanban/components/KanbanBulkBar.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'
import KanbanOrchestrationPanel from '@/custom/kanban/components/KanbanOrchestrationPanel.vue'
import KanbanAttentionStrip from '@/custom/kanban/components/KanbanAttentionStrip.vue'

const { t } = useI18n()
const message = useMessage()
const router = useRouter()
const store = useKanbanStore()
const workspace = useWorkspaceStore()

// ── 推演并入：daily/sim 以 TaskRef.key 隔离，原 taskId 只在日常 API 边界使用 ──
const taskRefs = computed<TaskRef[]>(() => [...workspace.dailyTasks, ...workspace.simTasks])
const taskRefByKey = computed(() => new Map(taskRefs.value.map(ref => [ref.key, ref])))
function refForKey(key: string): TaskRef | undefined {
  return taskRefByKey.value.get(key)
}
function dailyRefForTaskId(taskId: string): TaskRef | undefined {
  return workspace.dailyTasks.find(ref => ref.taskId === taskId)
}
function resolveDailyRef(key: string): TaskRef | undefined {
  // 旧深链/诊断事件只携带裸 ID；此边界只回落 daily，不把同 ID 的 sim 当日常任务。
  return refForKey(key) ?? dailyRefForTaskId(key)
}
function openInSim(ref: TaskRef): void {
  message.info(t('kanban.simTask.readonlyJump', '推演任务只读——已切到推演模式查看'))
  void router.push({ name: 'ia2.sim', query: ref.runId ? { run: ref.runId } : {} })
}

const selectedTaskKey = ref<string | null>(null)
const selectedTaskId = computed(() => {
  const ref = selectedTaskKey.value ? refForKey(selectedTaskKey.value) : undefined
  return isWritableTask(ref) ? ref.taskId : null
})
const showTaskDrawer = ref(false)
const includeArchived = ref(false)
/** P2 等您操作过滤（当前登录人的待做 R / 待审 A 卡） */
const mineOnly = ref(false)
const laneByProfile = ref(false)
const tenantFilter = ref('')
const attentionExpanded = ref(false)

// ── v12.5 聚合模式（用户裁定：合并展示所有 kanban 数据，板名多选筛选）──
// 数据源 = workspace.rawOverview（服务端跨板聚合端点，WS 看板事件驱动刷新）；
// 原单板数据链（store.tasks 仅 selectedBoard 一板）是"默认板为空 → 全 0"的
// 根因。板筛选用"排除集"语义：空集=全选（后增板自动并入），chip 点击切换。

const excludedBoards = ref<Set<string>>(new Set())

/** 板 chip 墙折叠（2026-10-23 走查挂账批）：45 板全量横排换行占 2-3 行是
 *  全页最重视觉块。默认只显示前 12 个，其余收进「+N 板 ▾」入口；板数 ≤12
 *  或用户展开后全显；折叠态下被排除的板（筛选动作对象）仍提到前排，防
 *  「刚点掉的板不见了无法点回」，多选排除集语义不变。 */
const BOARD_INLINE_MAX = 12
const boardExpanded = ref(false)
const visibleBoards = computed(() => {
  const list = boardList.value
  if (boardExpanded.value || list.length <= BOARD_INLINE_MAX) return list
  const head = list.slice(0, BOARD_INLINE_MAX)
  // 折叠区里处于筛选视野的板（被排除的）提到前排，保证筛选动作可回退
  const tail = list.slice(BOARD_INLINE_MAX).filter(b => !boardChecked(b.slug))
  return tail.length ? [...head, ...tail] : head
})
const hiddenBoardCount = computed(() =>
  boardExpanded.value ? 0 : Math.max(0, boardList.value.length - visibleBoards.value.length))

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
  // R6 补充：「全部」按钮支持反选——有勾选时全不选（反选当前），无勾选时全选。
  const hasChecked = boardList.value.some(b => boardChecked(b.slug))
  excludedBoards.value = hasChecked ? new Set(boardList.value.map(b => b.slug)) : new Set()
}

/** 合并任务 ref（排除未勾选板）；raw 缺省时不下发伪造卡片。 */
const mergedRefs = computed(() =>
  taskRefs.value.filter(ref => ref.raw && !excludedBoards.value.has(ref.board)))

type KeyedKanbanTask = KanbanTask & { __taskKey: string }
function keyedTask(ref: TaskRef): KeyedKanbanTask {
  return { ...ref.raw!.task, __taskKey: ref.key }
}

const dailyBoardList = computed(() => boardList.value.filter(board => board.source !== 'sim'))
const checkedBoardCount = computed(() =>
  dailyBoardList.value.filter(b => boardChecked(b.slug)).length)

const filteredTasks = computed(() => {
  let tasks: KeyedKanbanTask[] = mergedRefs.value.map(keyedTask)
  if (store.filterStatus) {
    tasks = tasks.filter((t: KanbanTask) => t.status === store.filterStatus)
  }
  if (store.filterAssignee) {
    tasks = tasks.filter((t: KanbanTask) => t.assignee === store.filterAssignee)
  }
  if (mineOnly.value) {
    // P2 §三：我是执行(R)且未完成的卡 + 我是审批(A)且在评审的卡
    const me = getStoredUsername()
    tasks = tasks.filter((t: KanbanTask) => needsMyAction(t, me))
  }
  if (tenantFilter.value) {
    tasks = tasks.filter((t: KanbanTask) => t.tenant === tenantFilter.value)
  }
  if (!includeArchived.value) {
    tasks = tasks.filter((t: KanbanTask) => t.status !== 'archived')
  }
  if (store.searchQuery) {
    // 字段类型归一（utils/task-search 单一事实源）：title/body 等字段出现非字符串
    // 态时旧过滤器 .toLowerCase() TypeError 打死整个看板视图（TasksView 块实测崩）
    tasks = tasks.filter((t: KanbanTask) => taskMatchesQuery(t, store.searchQuery))
  }
  // 默认按创建时间逆序（最新在最上面）
  return [...tasks].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
})

/** 可见任务=既有过滤链（状态/指派人/我的待办/租户/归档/搜索）∩ 视图级阶段状态。 */
const viewTasks = computed(() => filterTasksByStatuses(filteredTasks.value, props.statuses))

const selectedIds = computed(() => store.selectedIds)

/** 日常写操作统一边界：先验证 daily ref、切所属板，再把原 taskId 交给 API。 */
async function withBoard(taskKey: string, fn: (taskId: string) => Promise<unknown>): Promise<boolean> {
  const ref = refForKey(taskKey)
  if (!isWritableTask(ref)) {
    message.warning(t('kanban.simTask.readonlyGuard', '推演任务请在推演实例处理——日常侧只读'))
    return false
  }
  if (ref.board && ref.board !== store.selectedBoard) store.setBoard(ref.board)
  try {
    await fn(ref.taskId)
    return true
  } finally {
    void workspace.refreshAllBoards(true)
  }
}

/** 批量动作分板执行：store 批量接口按 selectedBoard 一次一板 → 按板分组循环 */
function groupIdsByBoard(keys: string[]): Array<{ board: string; ids: string[] }> {
  const groups = new Map<string, string[]>()
  for (const key of keys) {
    const ref = resolveDailyRef(key)
    if (!isWritableTask(ref)) continue
    const list = groups.get(ref.board)
    if (list) list.push(ref.taskId)
    else groups.set(ref.board, [ref.taskId])
  }
  return [...groups.entries()].map(([board, groupIds]) => ({ board, ids: groupIds }))
}

onMounted(async () => {
  // capabilities 与板清单先就绪：diagnostics 调用以能力表为准（缺失时 store 断言会抛
  // 未捕获异常——2026-10-20 M3 走查实证 dev 后端无此能力）；板定位依赖 boards 已加载。
  await Promise.all([store.fetchCapabilities(), store.fetchBoards()])
  store.fetchStats()
  store.fetchAssignees()
  fetchDiagnosticsIfSupported()
  store.fetchOrchestration()
  store.connectEvents()
  // 聚合数据面（v12.5 主数据源；WS 看板事件驱动 500ms 去抖刷新）
  void workspace.refreshAllBoards(true)
})

// diagnostics 能力缺失的后端上，store.fetchDiagnostics 的断言在自身 try/catch 之外抛出，
// 形成未捕获 pageerror（上游 store 次序问题，挂账待补丁）；能力不支持时如实跳过——
// 注意力条无诊断数据本就不渲染。
function fetchDiagnosticsIfSupported(): void {
  if (store.isCapabilitySupported('diagnostics')) void store.fetchDiagnostics()
}

// 单板详情链（抽屉内诊断/估算等）随板切换重取
watch(() => store.selectedBoard, () => {
  store.fetchStats()
  store.fetchAssignees()
  fetchDiagnosticsIfSupported()
  store.fetchOrchestration()
})

function handleTaskClick(taskKey: string, multiSelect: boolean, rangeSelect: boolean) {
  const ref = refForKey(taskKey)
  if (!ref) return
  if (!isWritableTask(ref)) {
    openInSim(ref)
    return
  }
  if (multiSelect) {
    store.toggleSelection(ref.key)
    return
  }
  if (rangeSelect) {
    const keys = viewTasks.value.map(task => task.__taskKey)
    const clickedIndex = keys.indexOf(ref.key)
    if (clickedIndex === -1) return

    let lastSelectedIndex = -1
    for (let i = keys.length - 1; i >= 0; i--) {
      if (store.selectedIds.has(keys[i])) {
        lastSelectedIndex = i
        break
      }
    }

    if (lastSelectedIndex === -1) {
      store.selectedIds.add(ref.key)
    } else {
      const start = Math.min(lastSelectedIndex, clickedIndex)
      const end = Math.max(lastSelectedIndex, clickedIndex)
      for (let i = start; i <= end; i++) {
        const selectedRef = refForKey(keys[i])
        if (isWritableTask(selectedRef)) store.selectedIds.add(selectedRef.key)
      }
    }
    return
  }
  if (ref.board && ref.board !== store.selectedBoard) store.setBoard(ref.board)
  selectedTaskKey.value = ref.key
  showTaskDrawer.value = true
}

function handleSelectAll(taskKeys: string[]) {
  for (const key of taskKeys) {
    const ref = refForKey(key)
    if (isWritableTask(ref)) store.selectedIds.add(ref.key)
  }
}

function handleTaskDrawerClose() {
  showTaskDrawer.value = false
  selectedTaskKey.value = null
}

function handleTaskDragStart(taskKey: string, e: DragEvent, _selectedCount: number) {
  const ref = refForKey(taskKey)
  if (!isWritableTask(ref)) {
    e.preventDefault()
    message.warning(t('kanban.simTask.readonlyGuard', '推演任务请在推演实例处理——日常侧只读'))
    return
  }
  e.dataTransfer?.setData('text/plain', ref.key)
  e.dataTransfer?.setData('text/x-hermes-task', ref.key)
}

function handleTaskDragEnd(_taskId: string, _e: DragEvent) {
  // cleanup if needed
}

async function handleColumnDrop(status: KanbanTaskStatus | 'trash', e: DragEvent) {
  const taskKey = e.dataTransfer?.getData('text/x-hermes-task') || e.dataTransfer?.getData('text/plain')
  if (!taskKey) return
  const ref = refForKey(taskKey)
  if (!ref) return

  if (status === 'trash') {
    try {
      if (!await withBoard(taskKey, taskId => store.deleteTask(taskId))) return
      message.success(t('kanban.message.taskDeleted'))
    } catch (err) {
      message.error(t('kanban.message.deleteFailed'))
    }
    return
  }

  if (!ref.raw || ref.task.status === status) return
  const fromStatus = ref.task.status

  try {
    if (!await withBoard(taskKey, taskId => store.moveTask(taskId, status))) return
    message.success(t('kanban.message.taskMoved'))
    fireColumnAutomation(ref.taskId, fromStatus, status, ref.raw.task.workspace_path)
  } catch (err) {
    message.error(t('kanban.message.moveFailed'))
  }
}

// 列自动化触发器（进度可感知链·产品前端生产者）：拖卡移动成功后，带任务卡 ID
// 调产品列派发端点——配置了该列编排即派发（无编排/无工作区关联则服务端空转），
// 失败静默不打扰移动本身（fail-soft，与后台感知条同哲学）。幂等由服务端 pending
// 槽与 commandId 台账兜底。
async function fireColumnAutomation(taskId: string, from: string, to: string, workspacePath: string | null): Promise<void> {
  if (!workspacePath) return
  try {
    const { authFetch } = await import('@/custom/ide/utils/auth-fetch')
    await authFetch('/api/column-automation/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, workspacePath, taskId }),
    })
  } catch { /* 列自动化失败不回滚移动、不弹错（后台动作） */ }
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
  const board = dailyBoardList.value.find(b => boardChecked(b.slug))?.slug
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
  const ref = dailyRefForTaskId(taskId)
  if (!isWritableTask(ref)) return
  if (ref.board && ref.board !== store.selectedBoard) store.setBoard(ref.board)
  selectedTaskKey.value = ref.key
  showTaskDrawer.value = true
}

/** 外部任务直达（?task=）：等聚合数据到位后按全量 rawTasks 定位（不受板筛选影响），
 *  切到任务所在板再开抽屉；同一 ID 只自动打开一次，用户关掉后不被 watch 重放。 */
const externallyOpenedTask = ref<string | null>(null)
watch(
  [() => props.openTaskId, () => taskRefs.value],
  ([taskKey]) => {
    if (!taskKey || taskKey === externallyOpenedTask.value) return
    const ref = refForKey(taskKey)
      ?? dailyRefForTaskId(taskKey)
      ?? workspace.simTasks.find(task => task.taskId === taskKey)
    if (!ref) return
    if (!isWritableTask(ref)) {
      // sim 深链不进日常抽屉；复合 key 可精确直达，裸 ID 只在无 daily 时回落 sim。
      externallyOpenedTask.value = taskKey
      openInSim(ref)
      return
    }
    if (ref.board && ref.board !== store.selectedBoard) store.setBoard(ref.board)
    selectedTaskKey.value = ref.key
    showTaskDrawer.value = true
    externallyOpenedTask.value = taskKey
  },
  { immediate: true },
)

function handleBulkClear() {
  store.clearSelection()
}

function handleBulkSelectAllVisible() {
  for (const task of viewTasks.value) {
    const ref = refForKey(task.__taskKey)
    if (isWritableTask(ref) && !store.selectedIds.has(ref.key)) {
      store.selectedIds.add(ref.key)
    }
  }
}

/** 批量动作通用执行器：按板分组 → 逐组切板执行 → 刷新聚合 */
async function runBulk(
  action: (ids: string[]) => Promise<unknown>,
  keys: string[],
): Promise<boolean> {
  if (!keys.length) return false
  const refs = keys.map(resolveDailyRef)
  if (refs.some(ref => !isWritableTask(ref))) {
    message.warning(t('kanban.simTask.readonlyGuard', '推演任务请在推演实例处理——日常侧只读'))
    return false
  }
  for (const group of groupIdsByBoard(keys)) {
    if (group.board && group.board !== store.selectedBoard) store.setBoard(group.board)
    await action(group.ids)
  }
  await workspace.refreshAllBoards(true)
  return true
}

async function handleBulkComplete() {
  try {
    if (!await runBulk(ids => store.bulkComplete(ids), Array.from(selectedIds.value))) return
    message.success(t('kanban.message.taskCompleted'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkBlock() {
  try {
    if (!await runBulk(ids => store.bulkBlock(ids), Array.from(selectedIds.value))) return
    message.success(t('kanban.message.taskBlocked'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkUnblock() {
  try {
    if (!await runBulk(ids => store.bulkUnblock(ids), Array.from(selectedIds.value))) return
    message.success(t('kanban.message.taskUnblocked'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

/** 催办 owner 动态路由（2026-10-22 P0 接线批）：对选中卡逐张解析催办对象——
 *  assignee 优先、板 team 回落、双空显式无人态（run21/22 错侧催办产品化①）。 */
async function handleNudge() {
  const keys = Array.from(selectedIds.value)
  if (!keys.length) return
  const refs = keys.map(resolveDailyRef)
  if (refs.some(ref => !isWritableTask(ref))) {
    message.warning(t('kanban.simTask.readonlyGuard', '推演任务请在推演实例处理——日常侧只读'))
    return
  }
  let routed = 0
  let unassigned = 0
  for (const ref of refs) {
    if (!isWritableTask(ref)) continue
    const cardId = ref.taskId
    try {
      const d = await nudgeRoute(cardId)
      if (d.route === 'unassigned') unassigned += 1
      else { routed += 1; message.info(`催办已路由 → ${d.target}${d.route === 'board-team' ? '（板归属）' : ''}：${d.title ?? cardId}`) }
    } catch (err) {
      message.error(`催办失败 ${cardId}：${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (unassigned > 0) message.warning(`${unassigned} 张卡无负责人且无板归属——先派人再催办`)
  if (routed === 0 && unassigned === 0) message.error('未解析出任何催办对象')
}

async function handleBulkArchive() {
  try {
    if (!await runBulk(ids => store.bulkArchive(ids), Array.from(selectedIds.value))) return
    message.success(t('kanban.message.taskArchived'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkDelete() {
  try {
    const ids = Array.from(selectedIds.value)
    if (!await runBulk(async groupIds => {
      for (const id of groupIds) await store.deleteTask(id)
    }, ids)) return
    message.success(t('kanban.message.deleteSuccess'))
  } catch (err) {
    message.error(t('kanban.message.deleteFailed'))
  }
}

async function handleBulkSetPriority(priority: number) {
  try {
    const ids = Array.from(selectedIds.value)
    if (!await runBulk(async groupIds => {
      for (const id of groupIds) await store.patchTask(id, { priority })
    }, ids)) return
    message.success(t('kanban.message.taskUpdated'))
  } catch (err) {
    message.error(t('kanban.message.updateFailed'))
  }
}

async function handleBulkAssign(profile: string, reclaimFirst: boolean) {
  try {
    const ids = Array.from(selectedIds.value)
    if (!await runBulk(async groupIds => {
      for (const id of groupIds) {
        if (reclaimFirst) {
          await store.reassignTask(id, profile || 'none', { reclaim: true })
        } else {
          await store.assignTask(id, profile || 'none')
        }
      }
    }, ids)) return
    message.success(t('kanban.message.taskAssigned'))
  } catch (err) {
    message.error(t('kanban.message.bulkFailed'))
  }
}

async function handleBulkMoveToTodo() {
  try {
    const ids = Array.from(selectedIds.value)
    if (!await runBulk(async groupIds => {
      for (const id of groupIds) await store.moveTask(id, 'todo')
    }, ids)) return
    message.success(t('kanban.message.taskMoved'))
  } catch (err) {
    message.error(t('kanban.message.moveFailed'))
  }
}

async function handleBulkMoveToReady() {
  try {
    const ids = Array.from(selectedIds.value)
    if (!await runBulk(async groupIds => {
      for (const id of groupIds) await store.moveTask(id, 'ready')
    }, ids)) return
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
        v-for="b in visibleBoards" :key="`${b.source ?? 'daily'}:${b.slug}`"
        type="button"
        class="kanban-boardbar__chip"
        :class="{ 'is-on': boardChecked(b.slug) }"
        :data-testid="`kanban-board-chip-${b.slug}`"
        :title="b.slug"
        @click="toggleBoard(b.slug)"
      >{{ b.name }}<span v-if="b.source === 'sim'" class="kanban-boardbar__sim" data-testid="kanban-board-chip-sim-badge">推演</span><span class="kanban-boardbar__n">{{ b.total }}</span></button>
      <button
        v-if="hiddenBoardCount > 0 || boardExpanded"
        type="button"
        class="kanban-boardbar__chip kanban-boardbar__more"
        data-testid="kanban-board-chip-toggle"
        :aria-expanded="boardExpanded"
        @click="boardExpanded = !boardExpanded"
      >{{ boardExpanded ? '收起 ∧' : `+${hiddenBoardCount} 板 ▾` }}</button>
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
      :mine-only="mineOnly"
      :lane-by-profile="laneByProfile"
      :tenants="tenants"
      :task-count="viewTasks.length"
      :status-filter="store.filterStatus"
      hide-board-select
      @board-change="handleBoardChange"
      @assignee-change="handleAssigneeChange"
      @tenant-change="handleTenantChange"
      @search-change="handleSearchChange"
      @include-archived-change="handleIncludeArchivedChange"
      @mine-only-change="(v: boolean) => { mineOnly = v }"
      @lane-by-profile-change="handleLaneByProfileChange"
      @refresh="handleRefresh"
      @dispatch="handleDispatch"
      @clear-filters="handleClearFilters"
      @create-board="handleCreateBoard"
      @archive-board="handleArchiveBoard"
      @status-change="store.setFilter('status', $event)"
    />

    <KanbanOrchestrationPanel />

    <KanbanAttentionStrip
      :diagnostics="store.diagnostics"
      :expanded="attentionExpanded"
      @toggle="attentionExpanded = !attentionExpanded"
      @open="handleAttentionOpen"
      @refresh="fetchDiagnosticsIfSupported"
    />

    <KanbanBulkBar
      :selected-count="selectedIds.size"
      :total-count="viewTasks.length"
      :assignees="assigneeNames"
      @clear="handleBulkClear"
      @select-all-visible="handleBulkSelectAllVisible"
      @complete="handleBulkComplete"
      @block="handleBulkBlock"
      @unblock="handleBulkUnblock"
      @nudge="handleNudge"
      @archive="handleBulkArchive"
      @delete="handleBulkDelete"
      @set-priority="handleBulkSetPriority"
      @assign="handleBulkAssign"
      @move-to-todo="handleBulkMoveToTodo"
      @move-to-ready="handleBulkMoveToReady"
    />

    <div class="board-container" :data-status-filter="(props.statuses ?? []).join(',')">
      <NSpin v-if="store.loading && !viewTasks.length" size="large" class="page-loading" />
      <KanbanBoard
        v-else
        :auto-open-create="autoOpenCreate"
        :tasks="viewTasks"
        :loading="store.loading"
        :selected-ids="selectedIds"
        :include-archived="includeArchived"
        :lane-by-profile="laneByProfile"
        :parent-tasks="viewTasks.map(t => ({ id: t.id, title: t.title }))"
        @task-click="handleTaskClick"
        @toggle-select="handleTaskClick($event, true, false)"
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
      :key="selectedTaskKey"
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
  /* 观察项 O-3：chip 行 gap 6→8 并显式行距——换行后无行距曾是「左疏右密」观感来源 */
  display: flex; align-items: center; gap: 8px; row-gap: 4px; flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  flex-shrink: 0;
}
.kanban-boardbar__label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; margin-right: 2px; }

/* 折叠入口（2026-10-23 挂账批）：弱化形态——虚线描边无底色，语义是「还有更多」
 * 而非筛选项，与板 chip 实线形成区分 */
.kanban-boardbar__more {
  border-style: dashed;
  color: var(--text-muted);
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}

/* R6 补充：「全部」按钮区分于板 chip（徽标样式，重置全选语义显性化；
 *  用户反馈「只能单选无全部」= All 按钮被当成普通板 chip 不可辨） */
.kanban-boardbar__chip--all {
  font-weight: 700;
  border: 1px dashed var(--primary-color);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}
.kanban-boardbar__chip--all.is-on {
  border-style: solid;
  background: var(--primary-color);
  color: var(--text-on-accent);
}
.kanban-boardbar__chip {
  display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 10px;
  border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary);
  font-size: 11px; cursor: pointer; font-family: inherit; white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  /* 选中态降噪（2026-10-10 UI 审计）：实心主色块 30 枚占满三行是全页最重视觉块——
     改主色 10% 底+主色描边+主色字，筛选器不再与内容争强调层级 */
  &.is-on {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
    color: var(--primary-color);
    font-weight: 600;
  }
  &:not(.is-on) { opacity: .62; }
}
.kanban-boardbar__chip--all.is-on { background: transparent; color: var(--text-primary); border-color: var(--primary-color); }
.kanban-boardbar__n {
  font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums;
}

/* 推演板徽标（2026-10-21 推演并入轮）：sim 板与日常板同栏可辨 */
.kanban-boardbar__sim {
  margin-left: 4px; padding: 0 4px; border-radius: 8px;
  font-size: 10px; line-height: 14px;
  background: var(--ia-compensated, rgba(0, 0, 0, 0.08)); color: var(--text-secondary);
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
