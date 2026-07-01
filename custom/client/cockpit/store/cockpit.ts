import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { getStoredUsername } from '@/api/client'
import * as kanbanApi from '@/api/hermes/kanban'
import { useChatStore } from '@/stores/hermes/chat'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import * as extras from '@/custom/cockpit/api/kanban-extras'
import { searchSessions as searchHermesSessions } from '@/api/hermes/sessions'
import { mapSearchToTaskIds, type MatrixRoomSearchData } from '@/custom/cockpit/adapters/search-adapter'
import * as kv from './cockpit-kv'
import type { UserTodo } from './cockpit-kv'
import * as taskAdapter from '../adapters/task-adapter'
import * as attentionAdapter from '../adapters/attention-adapter'
import * as collabAdapter from '../adapters/collab-adapter'
import * as eventAdapter from '../adapters/event-adapter'
import * as topologyAdapter from '../adapters/topology-adapter'
import { parseTenant, tenantFilterValue } from '@/custom/kanban/utils/tenant-parser'
import * as historyAdapter from '../adapters/history-adapter'
import * as notifyAdapter from '../adapters/notify-adapter'
import type { NotifyItem, NotifyKind } from '../adapters/notify-adapter'
import type { ChatMessage } from '../adapters/chat-adapter'
import type { KanbanTaskDetail } from '@/api/hermes/kanban'
import type { RouteLocationRaw } from 'vue-router'

// 重新导出类型（供组件继续从 store 导入）
export type CockpitTask = taskAdapter.CockpitTask
export type CockpitPriority = taskAdapter.CockpitPriority
export type CockpitStatus = taskAdapter.CockpitStatus
export type AttentionSeverity = attentionAdapter.AttentionSeverity
export type AttentionItem = attentionAdapter.AttentionItem
export type GraphNode = topologyAdapter.GraphNode
export type GraphRelation = topologyAdapter.GraphRelation
export type GraphNodeRelation = topologyAdapter.GraphNodeRelation
export type CockpitEvent = eventAdapter.CockpitEvent
export type HistoryItem = historyAdapter.HistoryItem
export interface HistoryFilters {
  search: string
  timeRange: 'today' | 'week' | 'month' | null
  categories: ('event' | 'comment')[]
  actions: string[]
  statuses: ('active' | 'done' | 'archived')[]
}
export type WorkspaceMode = 'work' | 'term' | 'workspace' | 'chat'
export type ChannelKind = 'matrix' | 'chat' | 'group' | 'plain'
export type WorkDecision = kv.WorkDecision
export type DraftWorkItem = kv.DraftWorkItem
export type A2uiTemplate = kv.A2uiTemplate
export type ColumnKey = 'left' | 'mid' | 'right'
export type TerminalLineKind = 'prompt' | 'info' | 'ok' | 'warn' | 'dim'
export interface TerminalLine { kind: TerminalLineKind; text: string }

export interface CockpitFilters {
  priorities: CockpitPriority[]
  statuses: taskAdapter.CockpitStatusBucket[]
  assignees: string[]
  tenants: string[]
  tenantGroupChat: string[]
  tenantTopic: string[]
  tenantUserId: string[]
  tenantRoomId: string[]
  tenantSessionId: string[]
  tenantSource: string[]
  boardSlugs: string[]                 // 看板 slug 筛选（需求 #1）
  dateRange: { from: string | null; to: string | null }  // 日期范围筛选（需求 #1，YYYY-MM-DD）
}

export interface CollabChannel {
  id: string
  taskId: string
  kind: ChannelKind
  label: string
  routeTarget?: RouteLocationRaw
}

export interface FileNode { id: string; name: string; isDir: boolean; size: number; modified: number; children?: FileNode[] }

export interface ScheduleEvent {
  id: string
  date: string            // YYYY-MM-DD
  title: string
  kind: 'task' | 'timeline' | 'todo'
  taskId?: string
  time?: string           // HH:mm（由 ts 派生）
  ts?: number             // 毫秒时间戳（右栏按时间排序）
  priority?: CockpitPriority   // task 类：优先级（右栏色带/视觉权重）
  status?: string              // task 类：状态（9 值之一）
  archived?: boolean
}

const PRIORITY_ORDER: Record<CockpitPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

export const useCockpitStore = defineStore('cockpit', () => {
  const kanban = useKanbanStore()
  const chatStore = useChatStore()
  const groupStore = useGroupChatStore()
  const matrixClient = useMatrixClientStore()
  const matrixRoom = useMatrixRoomStore()
  const matrixComposer = useMatrixComposerStore()

  // ── 跨 board 聚合数据（ref，bootstrap 时填充）──
  // useKanbanStore 是单 board 模型，cockpit 自己聚合所有 board 的任务
  const cockpitTasks = ref<CockpitTask[]>([])
  const boards = ref<{ slug: string; name: string; total: number }[]>([])

  // ── 搜索态 ──
  const searchQuery = ref('')
  // ── 注意力筛选（点击注意力条后筛选 kanban 总览）──
  const _attentionTaskIds = ref<string[]>([])
  const attentionActive = computed(() => _attentionTaskIds.value.length > 0)
  const _sessionSearching = ref(false)
  const _sessionSearchCache = ref<Record<string, { ts: number; results: any[] }>>({})
  let _searchTimer: ReturnType<typeof setTimeout> | undefined

  // ── 派生态（computed）──
  // 优先读跨 board 聚合的 cockpitTasks；若未聚合（如单元测试直接 push mockKanbanTasks），
  // fallback 读当前 kanban.tasks（映射为 default board），保持向后兼容
  const tasks = computed(() => {
    if (cockpitTasks.value.length) return cockpitTasks.value
    return kanban.tasks.map(t => taskAdapter.toCockpitTask(t, 'default'))
  })
  const attention = computed(() => {
    return tasks.value
      .map(t => attentionAdapter.toAttention({ ...t, status: t.status } as any))
      .filter((x): x is AttentionItem => x !== null)
      .sort((a, b) => {
        // 第一层：按状态分梯队（阻塞 > 待审 > 待分类）
        const tier = attentionAdapter.attentionTier(a.status) - attentionAdapter.attentionTier(b.status)
        if (tier !== 0) return tier
        // 第二层：梯队内按优先级（P0 > P1 > P2 > P3）
        const pri = (a.priority ?? 3) - (b.priority ?? 3)
        if (pri !== 0) return pri
        // 第三层：同优先级按创建时间降序（晚的在前）
        return b.createdAt - a.createdAt
      })
  })
  const attentionCount = computed(() => attention.value.length)

  // ── 客户端态 ──
  const selectedTaskId = ref<string | null>(null)
  // 选中任务的自增序号：每次 selectTask 调用都 +1（即便重新选中同一任务）。
  // 让依赖「选中动作」的消费者（如 CockpitFilePanel 的 Home 路径同步）能在
  // 点击中心节点重新选中当前任务时也收到刷新信号——单看 selectedTaskId 无法区分。
  const selectionSeq = ref(0)
  const filters = ref<CockpitFilters>({ priorities: [], statuses: [], assignees: [], tenants: [], tenantGroupChat: [], tenantTopic: [], tenantUserId: [], tenantRoomId: [], tenantSessionId: [], tenantSource: [], boardSlugs: [], dateRange: { from: null, to: null } })
  const collapsed = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  // 中栏上下分区折叠（协作图/时序流独立折叠）
  const midTopCollapsed = ref(false)     // 协作图折叠（向上收）
  const midBottomCollapsed = ref(false)  // 时序流折叠（向下收）
  const workspaceMode = ref<WorkspaceMode>('work')
  const swarmKanbanVisible = ref(false)
  const activeChannelId = ref<string | null>(null)
  const maximized = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  const terminalMode = ref(false)
  const terminalLines = ref<TerminalLine[]>([
    { kind: 'dim', text: 'Claude Code · sandbox 模式 · 根目录由当前任务 Workspace 决定' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'info', text: '任务上下文已加载，沙箱就绪，读写限定在根目录内' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'warn', text: '! 输入指令开始编程，如「打开 refresh.ts 看并发问题」' },
  ])
  const historyOpen = ref(false)
  const historyFilters = ref<HistoryFilters>({
    search: '',
    timeRange: null,
    categories: ['event', 'comment'],
    actions: [],
    statuses: ['active', 'done', 'archived'],
  })
  const archivedMode = ref(false)
  const templateManagerOpen = ref(false)
  // task title 详情弹窗（双击 title 查看）（需求 #2）
  const titleDetailOpen = ref(false)
  const titleDetailText = ref('')
  // kanban 任务详情弹窗（双击协作图节点显示完整 KanbanTaskDetail）
  const kanbanDetailOpen = ref(false)
  const kanbanDetailTask = ref<KanbanTaskDetail | null>(null)
  const titleDetailTaskId = ref<string | null>(null)
  const runTraceOpen = ref(false)
  const runTraceTaskId = ref<string | null>(null)
  const runTraceSessionId = ref<string | null>(null)
  const runTraceRunId = ref<string | null>(null)
  const focusedGraphNodeId = ref<string | null>(null)
  const selectedGraphNodeIds = ref<Record<string, string[]>>({})
  // 协作图画布变换（决策 #14）
  const canvasTransform = ref({ x: 0, y: 0, scale: 1 })

  // ── 日程 ──
  const scheduleOpen = ref(false)
  const scheduleSelectedDate = ref('')
  const scheduleViewYear = ref(2026)
  const scheduleViewMonth = ref(5)   // 0-indexed
  const userTodos = ref<UserTodo[]>([])
  const scheduleAnchorLeft = ref<number | null>(null)   // 下拉横向定位（「日程」按钮 left）
  // 待办闹钟触发的应用内通知（合并进 notifyItems）
  const reminderNotifications = ref<NotifyItem[]>([])
  let _reminderTimer: ReturnType<typeof setInterval> | undefined

  // ── 懒加载态 ──
  const _detailCache = ref<Record<string, KanbanTaskDetail>>({})
  const _fileTreeCache = ref<Record<string, FileNode[]>>({})
  const events = ref<CockpitEvent[]>([])
  const fileTrees = ref<Record<string, FileNode[]>>({})
  const history = ref<HistoryItem[]>([])
  // localStorage 写入计数器：让依赖 localStorage 的 computed（workItem/templates）能响应式刷新
  const _kvRev = ref(0)
  function bumpKv() { _kvRev.value++ }

  // ── selectedTask / 派生 getter ──
  const selectedTask = computed(() =>
    tasks.value.find(t => t.id === selectedTaskId.value) ?? null,
  )

	  const sortedTasks = computed(() =>
	    [...tasks.value].sort((a, b) => {
	      // 默认按创建时间逆序（最新在前），同时间按优先级升序
	      return (b.createdAt - a.createdAt) || (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
	    }),
	  )

  const searchResult = computed<Set<string>>(() => {
    const q = searchQuery.value.trim()
    if (!q) return new Set()
    const mr = (matrixRoom as any).roomList ?? []
    const rooms: MatrixRoomSearchData[] = mr.map((r: any) => ({
      roomId: r.roomId ?? '',
      name: r.name,
      topic: r.getCanonicalAlias?.() ?? undefined,
    }))
    const cacheEntry = _sessionSearchCache.value[q]
    const sessions = cacheEntry?.results ?? []
    return mapSearchToTaskIds(tasks.value, rooms, sessions, q)
  })

  const filteredTasks = computed(() =>
    sortedTasks.value.filter(t => {
      const f = filters.value
      const okArr = <T,>(arr: T[], v: T) => arr.length === 0 || arr.includes(v)
      // 日期范围筛选（需求 #1）
      let dateOk = true
      if (f.dateRange.from) {
        const fromTs = new Date(f.dateRange.from + 'T00:00:00').getTime()
        if (t.createdAt < fromTs) dateOk = false
      }
      if (dateOk && f.dateRange.to) {
        const toTs = new Date(f.dateRange.to + 'T23:59:59').getTime()
        if (t.createdAt > toTs) dateOk = false
      }
      const searchOk = !searchQuery.value.trim() || searchResult.value.has(t.id)
      // 注意力筛选：若 _attentionTaskIds 非空，只显示集合内的任务
      if (_attentionTaskIds.value.length > 0 && !_attentionTaskIds.value.includes(t.id)) {
        return false
      }
      return okArr(f.priorities, t.priority)
        && okArr(f.statuses, taskAdapter.bucketStatus(t.status))
        && okArr(f.assignees, t.assignee)
        && (() => {
          // 结构化字段筛选：若任一字段有筛选值，则要求 task 必须有 tenant
          const hasAnyTenantFilter = f.tenantGroupChat.length > 0 || f.tenantTopic.length > 0
            || f.tenantUserId.length > 0 || f.tenantRoomId.length > 0
            || f.tenantSessionId.length > 0 || f.tenantSource.length > 0
            || f.tenants.length > 0
          if (!hasAnyTenantFilter) return true
          // Null tenant tasks belong to the board/default bucket and should not be
          // hidden by tenant chips (legacy test contract + cockpit UX).
          if (!t.tenant) return true
          const p = parseTenant(t.tenant)
          const tf = (arr: string[], val: string) => arr.length === 0 || arr.includes(val)
          // For legacy/plain tenants, filter by the raw tenant string so chips match.
          const tenantVal = p.isLegacy ? t.tenant : tenantFilterValue(p)
          return okArr(f.tenants, tenantVal)
            && tf(f.tenantGroupChat, p.groupChat || '___other___')
            && tf(f.tenantTopic, p.topic || '___other___')
            && tf(f.tenantUserId, p.userId || '___other___')
            && tf(f.tenantRoomId, p.roomId || '___other___')
            && tf(f.tenantSessionId, p.sessionId || '___other___')
            && tf(f.tenantSource, p.source || '___other___')
        })()
        && okArr(f.boardSlugs, t.boardSlug)
        && dateOk
        && searchOk
    }),
  )

  const taskGroups = computed(() => {
    const map: Record<string, CockpitTask[]> = {}
    const labelMap: Record<string, string> = {}
    const kindMap: Record<string, 'tenant' | 'board'> = {}
    for (const t of filteredTasks.value) {
      if (t.tenant) {
        const key = 'tenant::' + t.tenant
        if (!map[key]) { map[key] = []; labelMap[key] = t.tenant; kindMap[key] = 'tenant' }
        map[key].push(t)
      } else {
        const key = 'board::' + t.boardSlug
        if (!map[key]) { map[key] = []; labelMap[key] = t.boardSlug; kindMap[key] = 'board' }
        map[key].push(t)
      }
    }
    return Object.keys(map)
      .sort((a, b) => {
        const aIsBoard = a.startsWith('board::')
        const bIsBoard = b.startsWith('board::')
        if (aIsBoard !== bIsBoard) return aIsBoard ? 1 : -1
        return (labelMap[a] ?? '').localeCompare(labelMap[b] ?? '')
      })
      .map(key => ({ key, label: labelMap[key] ?? key, kind: kindMap[key] ?? 'tenant', tasks: map[key] }))
  })

  // ── 时序事件 ──
  // 时序流 actor 过滤（多选）
  const timelineActorFilter = ref<string[]>([])

  const eventsForSelectedTask = computed(() =>
    selectedTaskId.value
      ? events.value.filter(e => e.taskId === selectedTaskId.value).sort((a, b) => b.ts - a.ts)  // 逆序：新在前
      : [],
  )

  // actor 选项（从当前任务事件去重）
  const timelineActorOptions = computed(() => {
    const set = new Set<string>()
    for (const e of eventsForSelectedTask.value) set.add(e.actor)
    return [...set].sort()
  })

  const eventsForTimeline = computed(() => {
    const f = timelineActorFilter.value
    if (!f.length) return eventsForSelectedTask.value
    return eventsForSelectedTask.value.filter(e => f.includes(e.actor))
  })

  function recentEventsForTimeline(threshold: number) {
    const all = eventsForTimeline.value  // 逆序（新在前）
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    // 逆序：前 threshold 条是最新（visible），剩余是较早（folded，折叠在下方）
    return { visible: all.slice(0, threshold), folded: all.slice(threshold) }
  }
  function recentEventsForSelectedTask(threshold: number) { return recentEventsForTimeline(threshold) }

  // ── 协作图 ──
  // 从 _detailCache 构建 task_links 映射（供 topology 递归展开链路）
  const linksMap = computed<topologyAdapter.TaskLinksMap>(() => {
    const map: topologyAdapter.TaskLinksMap = {}
    for (const [tid, d] of Object.entries(_detailCache.value)) {
      if (!d) continue
      const detail = d as KanbanTaskDetail
      map[tid] = {
        parents: detail.parents ?? [],
        children: detail.children ?? [],
      }
    }
    return map
  })

  const topologyForSelectedTask = computed(() =>
    topologyAdapter.buildTopology(selectedTask.value, linksMap.value, tasks.value),
  )
  const relationsForSelectedTask = computed(() => topologyForSelectedTask.value.relations)

  // ── 通知（仅 Matrix 未读消息）──
  const notifyOpen = ref(false)

  const notifyItems = computed<NotifyItem[]>(() => {
    const items: NotifyItem[] = [...reminderNotifications.value]
    for (const room of (matrixRoom as any).sortedRooms ?? []) {
      const item = notifyAdapter.fromMatrixRoom(room, (r: any) => (matrixRoom as any).getRoomUnreadCount(r))
      if (item) items.push(item)
    }
    return items.sort((a, b) => b.ts - a.ts)
  })

  const notifyCount = computed(() => notifyItems.value.reduce((n, i) => n + i.count, 0))

  // ── 频道（按 kanban tenant 解析规则展示 room/session，点击跳转 matrix 房间）──
  const channels = computed<CollabChannel[]>(() => {
    const t = selectedTask.value
    if (!t?.tenant) return []

    // Legacy channel formats used by cockpit tests and older kanban tasks:
    // matrix:<room_id_with_colons>:<label>
    // session:<session_id>@<agent>:<label>
    // group:<room_id_with_colons>:<label>
    if (t.tenant.startsWith('matrix:')) {
      const parts = t.tenant.split(':')
      if (parts.length >= 4) {
        const label = parts[parts.length - 1] || t.tenant
        const roomId = parts.slice(1, -1).join(':')
        return [{
          id: `ch-${t.id}`,
          taskId: t.id,
          kind: 'matrix',
          label,
          routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId } },
        }]
      }
      return []
    }
    if (t.tenant.startsWith('session:')) {
      const parts = t.tenant.split(':')
      return [{ id: `ch-${t.id}`, taskId: t.id, kind: 'chat', label: parts.slice(2).join(':') || parts[1] || t.tenant }]
    }
    if (t.tenant.startsWith('group:')) {
      const parts = t.tenant.split(':')
      return [{ id: `ch-${t.id}`, taskId: t.id, kind: 'group', label: parts[parts.length - 1] || t.tenant }]
    }

    const parsed = parseTenant(t.tenant)
    // 解析失败或普通 tenant 不展示为协作频道
    if (parsed.isLegacy || !parsed.roomId) return []

    // Matrix 聊天室（按 roomId + sessionId 拼装跳转）
    const label = parsed.topic
      ? `${parsed.groupChat}:${parsed.topic} @${parsed.userId}`
      : `${parsed.groupChat} @${parsed.userId}`
    return [{
      id: `ch-${t.id}`, taskId: t.id, kind: 'matrix',
      label,
      routeTarget: {
        name: 'hermes.matrixChatRoom',
        params: { roomId: parsed.roomId },
        query: parsed.sessionId ? { session: parsed.sessionId } : {},
      },
    }]
  })
  const channelsForSelectedTask = computed(() => channels.value)
  const activeChannel = computed(() => channels.value.find(c => c.id === activeChannelId.value) ?? null)

  // ── 文件树 ──
  const filesForSelectedTask = computed(() =>
    selectedTaskId.value ? (fileTrees.value[selectedTaskId.value] ?? []) : [],
  )

  // ── 工作项（localStorage）──
  const workItemForSelectedTask = computed(() => {
    void _kvRev.value  // 依赖 kv 写入计数器
    const id = selectedTaskId.value
    return id ? kv.loadDraft(id) : null
  })

  // ── 选中任务的完整 KanbanTaskDetail（从 _detailCache 读取）──
  const selectedTaskDetail = computed<KanbanTaskDetail | null>(() => {
    const id = selectedTaskId.value
    if (!id) return null
    return _detailCache.value[id] ?? null
  })

  // ── 当前标题（草稿优先，回退到 selectedTask.title）──
  const currentTitle = computed(() => {
    const draft = workItemForSelectedTask.value
    if (draft?.pendingTitle !== undefined) return draft.pendingTitle || ''
    return selectedTask.value?.title ?? ''
  })

  // ── 当前用户（从 localStorage 获取）──
  const currentUserName = computed(() => {
    try {
      return getStoredUsername() ?? '你'
    } catch {
      return '你'
    }
  })

  // ── 历史 ──
  const filteredHistory = computed(() =>
    history.value.filter(h => {
      const f = historyFilters.value

      // 搜索：标题模糊匹配
      const q = f.search.trim().toLowerCase()
      const searchOk = !q || h.title.toLowerCase().includes(q)

      // 时间片（互斥三选一，null=不限）
      let timeOk = true
      if (f.timeRange) {
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        if (f.timeRange === 'today') {
          timeOk = h.ts >= todayStart
        } else if (f.timeRange === 'week') {
          const dow = now.getDay()
          const mondayOffset = dow === 0 ? -6 : 1 - dow
          const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset).getTime()
          timeOk = h.ts >= weekStart
        } else {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
          timeOk = h.ts >= monthStart
        }
      }

      // 类别（多选）
      const catOk = f.categories.length === 0 || f.categories.includes(h.source)

      // 动作（多选）
      const actionOk = f.actions.length === 0 || f.actions.includes(h.action)

      // 状态（多选，从本地 tasks 查找任务当前状态）
      let statusOk = true
      if (f.statuses.length > 0 && f.statuses.length < 3) {
        const task = tasks.value.find(t => t.id === h.taskId)
        const isDone = task?.status === 'done' || task?.status === 'archived'
        if (f.statuses.includes('active') && !isDone && !h.archived) statusOk = true
        else if (f.statuses.includes('done') && isDone && !h.archived) statusOk = true
        else if (f.statuses.includes('archived') && h.archived) statusOk = true
        else statusOk = false
      }

      return searchOk && timeOk && catOk && actionOk && statusOk
    }),
  )

	  // ── bootstrap ──
	  // 跨 board 聚合：拉所有 board，对每个 board 切换并拉任务，合并到 cockpitTasks
	  async function loadAllBoards() {
	    try {
	      await kanban.fetchBoards?.()
	    } catch { /* boards 拉取失败，降级到 default */ }
	    const kanbanBoards = (kanban as any).boards ?? []
	    const boardList = Array.isArray(kanbanBoards) && kanbanBoards.length
	      ? kanbanBoards.map((b: any) => ({ slug: b.slug, name: b.name, total: b.total ?? 0 }))
	      : [{ slug: 'default', name: 'default', total: 0 }]
	    boards.value = boardList
	    const all: CockpitTask[] = []
	    for (const b of boardList) {
	      try {
	        kanban.setSelectedBoard?.(b.slug)
	        await kanban.fetchTasks()
	        for (const t of kanban.tasks) {
	          all.push(taskAdapter.toCockpitTask(t, b.slug))
	        }
	      } catch { /* 单 board 失败不阻塞其他 */ }
	    }
	    cockpitTasks.value = all
	    _lastRefreshTs = Date.now()
	  }

	  // ── 轻量全量刷新（并行 API、旁路 kanban store，不切 selectedBoard）──
	  let _lastRefreshTs = 0
	  async function refreshAllBoards(force = false): Promise<boolean> {
	    const now = Date.now()
	    if (!force && now - _lastRefreshTs < 2000) return true // 2s 防抖，视为成功（不重复刷新）
	    _lastRefreshTs = now
	    try {
	      const boardList = await kanbanApi.listBoards({ includeArchived: false })
	      const active = (boardList || []).filter((b: any) => !b.archived)
	      boards.value = active.map((b: any) => ({ slug: b.slug, name: b.name, total: (b as any).total ?? 0 }))
	      const results = await Promise.allSettled(
	        active.map((b: any) =>
	          kanbanApi.listTasks({ board: b.slug, includeArchived: true }).then(
	            tasks => tasks.map(t => taskAdapter.toCockpitTask(t, b.slug)),
	          ),
	        ),
	      )
	      const all: CockpitTask[] = []
	      for (const r of results) {
	        if (r.status === 'fulfilled') all.push(...r.value)
	      }
	      cockpitTasks.value = all
	      return true
	    } catch {
	      return false
	    }
	  }

  // 默认日期范围：近 2 周（需求 #2）
  function defaultDateRange(): { from: string; to: string } {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 14)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { from: fmt(from), to: fmt(to) }
  }

	  async function bootstrap() {
	    // 设置默认日期筛选（近 2 周）
	    const dr = defaultDateRange()
	    filters.value = { ...filters.value, dateRange: { from: dr.from, to: dr.to } }
	    // 加载用户待办并启动闹钟提醒调度（应用启动即生效，无需打开日程面板）
	    userTodos.value = kv.loadUserTodos()
	    startReminderScheduler()
	    await Promise.allSettled([
	      loadAllBoards(),
	      kanban.fetchAssignees(),
	      chatStore.loadSessions(),
	      groupStore.connect().then(() => groupStore.loadRooms()).catch(() => {}),
	      matrixClient.initClient(),
	    ])
	    if (cockpitTasks.value.length) await selectTask(cockpitTasks.value[0].id)
	    kanban.startEventStream?.()
	  }

  async function selectTask(id: string | null) {
    autoSaveDraft() // 保存当前草稿
    selectedTaskId.value = id
    focusedGraphNodeId.value = null
    archivedMode.value = false
    if (!id) { events.value = []; selectionSeq.value++; return }
    // 清除缓存强制重新拉取详情，确保 workspace_path 等字段反映最新状态
    // （如任务从未 claim → agent claim 后 workspace_path 从 null 变为实际路径）
    delete _detailCache.value[id]
    await loadTaskDetail(id)
    selectionSeq.value++ // 在 detail 刷新后再通知消费者，避免 watch 读到旧 workspace
    loadAttachments(id).catch(() => {})
  }



  // 查任务所属 board slug（用于 detail/files 加载时带正确 board 上下文，不切全局 selectedBoard）
  function boardSlugOf(id: string): string | undefined {
    return cockpitTasks.value.find(x => x.id === id)?.boardSlug
  }

  async function loadTaskDetail(id: string) {
    // 带 board 参数请求（不切换全局 selectedBoard，避免触发 watch 清空 cockpitTasks）
    const board = boardSlugOf(id)
    const boardOpts = board ? { board } : undefined
    try {
      const detail = _detailCache.value[id] ?? await kanbanApi.getTask(id, boardOpts)
      _detailCache.value[id] = detail
      // 同步 detail.task 的最新状态回 cockpitTasks（动作执行后 task.status 已变，否则 UI 按钮门禁失效）
      const t = detail.task
      if (t) {
        const idx = cockpitTasks.value.findIndex(x => x.id === id)
        if (idx >= 0) {
          const cur = cockpitTasks.value[idx]
          cockpitTasks.value = [
            ...cockpitTasks.value.slice(0, idx),
            { ...cur, status: t.status as any, title: t.title ?? cur.title, assignee: t.assignee ?? cur.assignee, priority: taskAdapter.bucketPriority(t.priority), workspace: t.workspace_path ?? cur.workspace },
            ...cockpitTasks.value.slice(idx + 1),
          ]
        }
      }
      // 初步合并（events + runs + comments + messages）
      events.value = eventAdapter.mergeDetail(detail)
      const profile = detail.task.assignee ?? undefined
      if (profile) extras.searchSessions(id, profile).catch(() => {})
      // 异步拉 worker log，返回后重新合并（避免被后续 mergeDetail 覆盖）
      kanbanApi.getTaskLog(id, boardOpts).then((log) => {
        // 确保仍是当前选中任务（避免竞态）
        if (selectedTaskId.value !== id) return
        if (log?.exists && log.content) {
          const logEvt = eventAdapter.fromLog(id, { content: log.content, size_bytes: log.size_bytes, truncated: log.truncated })
          // 重新合并：mergeDetail + log，确保排序正确
          const merged = eventAdapter.mergeDetail(detail)
          if (!merged.some(e => e.id === logEvt.id)) {
            events.value = [...merged, logEvt]
          }
        }
      }).catch(() => { /* log 不存在时静默 */ })
    } catch {
      events.value = []
    }
    if (!_fileTreeCache.value[id]) {
      try {
        _fileTreeCache.value[id] = await extras.listWorkspaceFiles(id, board)
        fileTrees.value = { ...fileTrees.value, [id]: _fileTreeCache.value[id] }
      } catch {
        fileTrees.value = { ...fileTrees.value, [id]: [] }
      }
    }
    // 异步递归拉链路上其他任务的 detail（供 topology 展示爷爷/孙子），不阻塞当前渲染
    loadLinksChain(id, board).catch(() => {})
  }

  // 强制刷新某任务文件树（附件上传/删除后、定时轮询用），绕过缓存重新拉取
  async function refreshFileTree(taskId?: string) {
    const id = taskId ?? selectedTaskId.value
    if (!id) return
    const board = boardSlugOf(id)
    try {
      _fileTreeCache.value[id] = await extras.listWorkspaceFiles(id, board)
      fileTrees.value = { ...fileTrees.value, [id]: _fileTreeCache.value[id] }
    } catch {
      /* 文件树刷新失败静默 */
    }
  }

  // 递归拉链路（BFS，向上向下各 MAX_DEPTH 层），填充 _detailCache 供 linksMap 使用
  async function loadLinksChain(rootId: string, board?: string, maxDepth = 2) {
    const visited = new Set<string>([rootId])
    const queue: Array<{ id: string; depth: number }> = []
    // 先加载 rootId 的 detail（若已缓存则跳过）
    if (!_detailCache.value[rootId]) {
      try {
        const boardOpts = board ? { board } : undefined
        _detailCache.value[rootId] = await kanbanApi.getTask(rootId, boardOpts)
      } catch { return }
    }
    const root = _detailCache.value[rootId]
    for (const p of root.parents ?? []) if (!visited.has(p)) { visited.add(p); queue.push({ id: p, depth: 1 }) }
    for (const c of root.children ?? []) if (!visited.has(c)) { visited.add(c); queue.push({ id: c, depth: 1 }) }
    while (queue.length) {
      const { id, depth } = queue.shift()!
      if (depth > maxDepth) continue
      if (_detailCache.value[id]) {
        // 已缓存，继续展开其父子
        const d = _detailCache.value[id]
        for (const p of d.parents ?? []) if (!visited.has(p)) { visited.add(p); queue.push({ id: p, depth: depth + 1 }) }
        for (const c of d.children ?? []) if (!visited.has(c)) { visited.add(c); queue.push({ id: c, depth: depth + 1 }) }
        continue
      }
      try {
        // 用任务自身 board（从 cockpitTasks 查），fallback 到当前 board
        const tBoard = boardSlugOf(id) ?? board
        const tOpts = tBoard ? { board: tBoard } : undefined
        const d = await kanbanApi.getTask(id, tOpts)
        _detailCache.value[id] = d
        for (const p of d.parents ?? []) if (!visited.has(p)) { visited.add(p); queue.push({ id: p, depth: depth + 1 }) }
        for (const c of d.children ?? []) if (!visited.has(c)) { visited.add(c); queue.push({ id: c, depth: depth + 1 }) }
      } catch { /* 单个失败不阻塞 */ }
    }
  }

	  // WebSocket 联动：kanban.tasks 变化时，只做轻量同步（避免与 loadAllBoards 形成循环）
	  // - 不再调用 loadAllBoards（它会改 kanban.tasks 触发死循环）
	  // - 只更新 cockpitTasks 中当前 board 的任务片段 + 选中任务 detail invalidate
	  // - 同时触发去抖的 refreshAllBoards（500ms），聚合所有 board 的 WS 事件
	  let _wsDebounceTimer: ReturnType<typeof setTimeout> | undefined
	  watch(() => kanban.tasks, (newTasks) => {
	    const curBoard = (kanban as any).selectedBoard ?? 'default'
	    // 用最新 tasks 替换 cockpitTasks 中属于当前 board 的部分（按 boardSlug 过滤）
	    const others = cockpitTasks.value.filter(t => t.boardSlug !== curBoard)
	    const mapped = newTasks.map(t => taskAdapter.toCockpitTask(t, curBoard))
	    cockpitTasks.value = [...others, ...mapped]
	    // 选中任务 detail invalidate
	    const id = selectedTaskId.value
	    if (id && _detailCache.value[id]) {
	      delete _detailCache.value[id]
	      loadTaskDetail(id).then(() => {
	        // loadTaskDetail 不走 selectTask → selectionSeq 不自增。
	        // 但 cockpitTasks 中 workspace 已被 kanban.tasks 的值覆盖，
	        // 需要通知 CockpitFilePanel 等消费者重新读取已刷新的 workspace。
	        if (selectedTaskId.value === id) selectionSeq.value++
	      })
	    }
	    // WS 事件去抖：500ms 后刷新全部 board，保证注意力条/总览实时
	    if (_wsDebounceTimer) clearTimeout(_wsDebounceTimer)
	    _wsDebounceTimer = setTimeout(() => { refreshAllBoards() }, 500)
	  })

  // ── 工作区/折叠/筛选 ──
  function toggleCollapsed(col: ColumnKey) { collapsed.value[col] = !collapsed.value[col] }
  function toggleMidTop() { midTopCollapsed.value = !midTopCollapsed.value }
  function toggleMidBottom() { midBottomCollapsed.value = !midBottomCollapsed.value }
  function toggleTimelineActor(actor: string) {
    const cur = timelineActorFilter.value
    const i = cur.indexOf(actor)
    // 新数组赋值（确保 Vue 响应式触发 computed 重算）
    timelineActorFilter.value = i >= 0 ? cur.filter(a => a !== actor) : [...cur, actor]
  }
  function toggleFilter<K extends keyof CockpitFilters>(key: K, value: CockpitFilters[K][number]) {
    const arr = filters.value[key] as CockpitFilters[K][number][]
    const i = arr.indexOf(value)
    if (i >= 0) {
      arr.splice(i, 1)
    } else {
      arr.push(value)
    }
  }
  // 日期范围筛选（需求 #1）：from/to 为 'YYYY-MM-DD' 或 null
  function setDateRangeFilter(from: string | null, to: string | null) {
    filters.value = { ...filters.value, dateRange: { from, to } }
  }
  function clearDateRangeFilter() {
    filters.value = { ...filters.value, dateRange: { from: null, to: null } }
  }
  function runSearch(q: string) {
    searchQuery.value = q
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = undefined }
    if (!q.trim()) return
    _searchTimer = setTimeout(async () => {
      const key = q.trim()
      const cached = _sessionSearchCache.value[key]
      if (cached && (Date.now() - cached.ts < 5 * 60 * 1000)) return // 缓存 5min 未过期
      if (_sessionSearching.value) return
      _sessionSearching.value = true
      try {
        const results = await searchHermesSessions(key)
        _sessionSearchCache.value = { ..._sessionSearchCache.value, [key]: { ts: Date.now(), results } }
      } catch { /* 静默：退化为仅本地匹配 */ }
      finally { _sessionSearching.value = false }
    }, 300)
  }
  function clearSearch() {
    searchQuery.value = ''
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = undefined }
  }
  function clearAttentionFilter() {
    _attentionTaskIds.value = []
  }
  function setWorkspaceMode(mode: WorkspaceMode) { workspaceMode.value = mode }
  function toggleMaximized(col: ColumnKey) {
    // 独占式全屏：任一栏最大化时，其他栏取消
    const cur = maximized.value[col]
    maximized.value = { left: false, mid: false, right: false, [col]: !cur }
  }

  // ── 文件/节点 ──
  const selectedFileId = ref<string | null>(null)
  function selectFile(id: string | null) { selectedFileId.value = id }
  function toggleGraphNode(taskId: string, nodeId: string) {
    const cur = selectedGraphNodeIds.value[taskId] ?? []
    const i = cur.indexOf(nodeId)
    if (i >= 0) {
      cur.splice(i, 1)
    } else {
      cur.push(nodeId)
    }
    selectedGraphNodeIds.value = { ...selectedGraphNodeIds.value, [taskId]: cur }
  }
  function focusOnGraphNodeForTimeline(nodeId: string) {
    focusedGraphNodeId.value = focusedGraphNodeId.value === nodeId ? null : nodeId
  }

  // ── 工作项 ──
  function updateWorkItem(patch: Partial<DraftWorkItem>) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, patch)
    bumpKv()
  }
  function toggleRiskTag(tag: string) {
    const id = selectedTaskId.value
    if (!id) return
    const cur = kv.loadDraft(id)
    if (!cur) return
    const i = cur.riskTags.indexOf(tag)
    if (i >= 0) {
      cur.riskTags.splice(i, 1)
    } else {
      cur.riskTags.push(tag)
    }
    kv.saveDraft(id, { riskTags: cur.riskTags })
    bumpKv()
  }

	  function autoSaveDraft() {
	    bumpKv()
	  }

	  /** 一键还原：清除当前任务草稿，恢复原始值 */
	  function clearDraft() {
	    const id = selectedTaskId.value
	    if (!id) return
	    kv.clearDraft(id)
	    bumpKv()
	  }

  // ── Area 2 草稿暂存方法（不调用 API，仅写 localStorage）──
  function setPendingAssignee(profile: string | null) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, { pendingAssignee: profile })
    bumpKv()
  }
  function setPendingPriority(p: number) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, { pendingPriority: p })
    bumpKv()
  }
  function setPendingBody(body: string) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, { pendingBody: body })
    bumpKv()
  }
  function setPendingTitle(v: string) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, { pendingTitle: v })
    bumpKv()
  }
  function setPendingComment(v: string) {
    const id = selectedTaskId.value
    if (!id) return
    kv.saveDraft(id, { pendingComment: v })
    bumpKv()
  }
  function addPendingLink(link: kv.PendingLink) {
    const id = selectedTaskId.value
    if (!id) return
    const cur = kv.loadDraft(id)
    const adds = cur?.pendingLinkAdds ?? []
    if (!adds.some(l => l.parent === link.parent && l.child === link.child)) {
      kv.saveDraft(id, { pendingLinkAdds: [...adds, link] })
      bumpKv()
    }
  }
  function removePendingLink(link: kv.PendingLink) {
    const id = selectedTaskId.value
    if (!id) return
    const cur = kv.loadDraft(id)
    const removes = cur?.pendingLinkRemoves ?? []
    if (!removes.some(l => l.parent === link.parent && l.child === link.child)) {
      kv.saveDraft(id, { pendingLinkRemoves: [...removes, link] })
      bumpKv()
    }
  }

  async function submitWorkItem() {
    const id = selectedTaskId.value
    const draft = id ? kv.loadDraft(id) : null
    if (!id || !draft) return
    const board = boardSlugOf(id)
    const boardOpts = board ? { board } : undefined
    // 收集所有待执行操作，并发提交
    const ops: Promise<unknown>[] = []
    // 1. Area 2 字段变更：patchTask（仅在草稿中有 pending 字段时）
    const patch: kanbanApi.KanbanTaskPatch = {}
    if (draft.pendingAssignee !== undefined) patch.assignee = draft.pendingAssignee
    if (draft.pendingPriority !== undefined) patch.priority = draft.pendingPriority
    if (draft.pendingBody !== undefined) patch.body = draft.pendingBody
    // 标题（仅当与当前标题不同才提交）
    if (draft.pendingTitle !== undefined && draft.pendingTitle !== (selectedTask.value?.title ?? '')) {
      patch.title = draft.pendingTitle
    }
    if (Object.keys(patch).length) {
      ops.push(kanbanApi.patchTask(id, patch, boardOpts))
    }
    // 2. 父子关联变更
    for (const link of draft.pendingLinkAdds ?? []) {
      ops.push(kanbanApi.linkTasks({ parent_id: link.parent, child_id: link.child }, boardOpts))
    }
    for (const link of draft.pendingLinkRemoves ?? []) {
      ops.push(kanbanApi.unlinkTasks({ parent_id: link.parent, child_id: link.child }, boardOpts))
    }
    // 3. 始终提交决策评论
    const text = `[决策:${draft.decision}] 风险:${draft.riskTags.join(',')} ${draft.opinion}`.trim()
    ops.push(kanbanApi.addComment(id, { body: text }, boardOpts))
    // 4. 用户自由评论（非空时额外一条，与决策评论并存）
    if (draft.pendingComment && draft.pendingComment.trim()) {
      ops.push(kanbanApi.addComment(id, { body: draft.pendingComment }, boardOpts))
    }
    // 并发执行，单个失败不阻塞其他
    await Promise.allSettled(ops)
    kv.clearDraft(id)
    bumpKv()
    delete _detailCache.value[id]
    await loadTaskDetail(id)
    // 刷新附件列表
    if (taskAttachments.value[id]) {
      const newVal = { ...taskAttachments.value }
      delete newVal[id]
      taskAttachments.value = newVal
      loadAttachments(id).catch(() => {})
    }
  }

  // ── 通知 ──
  function openNotify() { notifyOpen.value = true }
  function closeNotify() { notifyOpen.value = false }
  // 仅 Matrix：进入房间后 SDK 自动清零未读，无需额外操作

  // ── 频道（选中频道时切换到 chat 工作区）──
  function selectChannel(id: string | null) {
    activeChannelId.value = id
    if (id) workspaceMode.value = 'chat' as WorkspaceMode
  }
  async function sendMessage(text: string): Promise<void> {
    const ch = activeChannel.value
    if (!ch || !text.trim()) return
    switch (ch.kind) {
      case 'matrix': await matrixComposer.sendMessage(text); break
      case 'chat': await chatStore.sendMessage(text); break
      case 'group': await groupStore.sendMessage(text); break
    }
  }
  const messagesForActiveChannel = computed<ChatMessage[]>(() => {
    const ch = activeChannel.value
    if (!ch) return []
    switch (ch.kind) {
      case 'matrix': return [] // matrix 消息归一需 currentUserId，由组件层注入 adapter 调用
      case 'chat': return (chatStore as any).messages?.map?.((m: any) => ({
        id: m.id, channelId: ch.id, author: m.role === 'user' ? '你' : m.role,
        isMe: m.role === 'user', text: m.content, ts: m.timestamp,
      })) ?? []
      case 'group': return (groupStore as any).sortedMessages?.map?.((m: any) => ({
        id: m.id, channelId: ch.id, author: m.senderName || m.senderId,
        isMe: false, text: m.content, ts: m.timestamp,
      })) ?? []
    }
    return []
  })
  function disconnectOnUnmount() {
    try { groupStore.disconnect?.() } catch { /* ignore */ }
  }

  // ── 历史 ──
  async function openHistory() {
    historyOpen.value = true
    try {
      const res = await extras.getTimeline({ limit: 100 })
      history.value = historyAdapter.mergeTimeline(res.items)
    } catch {
      history.value = []
    }
  }
  function closeHistory() { historyOpen.value = false }
  function setHistoryArchivedFilter(v: 'all' | 'only' | 'exclude') { /* added by feat/history-filters */ }
  // task title 详情弹窗（双击查看完整 title）（需求 #2）
  // 通用详情弹窗标题（区分"任务标题"/"事件详情"等）
  const titleDetailTitle = ref('任务标题')
  function openTitleDetail(taskId: string, text: string, title: string = '任务标题') {
    titleDetailTaskId.value = taskId
    titleDetailText.value = text
    titleDetailTitle.value = title
    titleDetailOpen.value = true
  }
  function closeTitleDetail() {
    titleDetailOpen.value = false
    titleDetailTaskId.value = null
    titleDetailText.value = ''
  }
  function openRunTrace(input: { taskId?: string | null; sessionId: string; runId?: string | null }) {
    runTraceTaskId.value = input.taskId ?? null
    runTraceSessionId.value = input.sessionId
    runTraceRunId.value = input.runId ?? null
    runTraceOpen.value = true
  }
  function closeRunTrace() {
    runTraceOpen.value = false
  }
  /** Open RunTrace from global entry point (TopBar button).
   * 统一进入全局聚合视图（所有跨任务会话聚合图）；
   * 由 overview 承载检索与下钻，用户在图中选择会话后切到单会话详细视图。
   */
  function openRunTraceGlobal() {
    openRunTrace({ sessionId: '' }) // Empty sessionId signals "show overview"
  }
  // kanban 详情弹窗：取完整 KanbanTaskDetail（含 comments/events/runs 等）
  // 双击协作图节点打开弹窗时，先 selectTask 联动选中状态——这样右侧 Workspace
  // 文件面板的 Home 目录会跟随该任务的 workspace_path（CockpitFilePanel 监听
  // selectionSeq 同步 workspaceRoot），避免「弹窗显示任务 A 的 workspace，
  // 但文件面板仍停留在之前选中任务 B 的目录」。
  const detailExpanded = ref(false)  // 弹窗"更多信息"折叠态
  async function openKanbanDetail(taskId: string) {
    // 先联动选中：刷新 detail cache（含最新 workspace_path）并触发 workspace 面板同步
    await selectTask(taskId)
    const detail = _detailCache.value[taskId]
    if (detail) {
      kanbanDetailTask.value = detail
      kanbanDetailOpen.value = true
    } else {
      // selectTask 已尝试拉取 detail；若仍无缓存（拉取失败），用 CockpitTask 基本信息兜底
      const t = tasks.value.find(x => x.id === taskId)
      if (t) {
        kanbanDetailTask.value = {
          task: {
            id: t.id, title: t.title, body: null, assignee: t.assignee === '未分配' ? null : t.assignee,
            status: t.status, priority: 0, created_by: null, created_at: t.createdAt,
            started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: t.workspace,
            tenant: t.tenant, project_id: null, result: null, skills: null, latest_summary: null,
          } as any,
          latest_summary: null, comments: [], events: [], runs: [],
        } as KanbanTaskDetail
        kanbanDetailOpen.value = true
      }
    }
    detailExpanded.value = false  // 打开时默认折叠"更多信息"
  }
  function closeKanbanDetail() {
    kanbanDetailOpen.value = false
    kanbanDetailTask.value = null
  }
  function toggleHistoryAction(action: string) {
    const arr = historyFilters.value.actions
    const i = arr.indexOf(action)
    if (i >= 0) {
      arr.splice(i, 1)
    } else {
      arr.push(action)
    }
  }
  function setHistorySearch(v: string) { historyFilters.value.search = v }
  function setHistoryTimeRange(v: 'today' | 'week' | 'month' | null) {
    historyFilters.value.timeRange = historyFilters.value.timeRange === v ? null : v
  }
  function toggleHistoryCategory(v: 'event' | 'comment') {
    const arr = historyFilters.value.categories
    const i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1); else arr.push(v)
  }
  function toggleHistoryStatus(v: 'active' | 'done' | 'archived') {
    const arr = historyFilters.value.statuses
    const i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1); else arr.push(v)
  }
  function recallHistoryItem(id: string) {
    const item = history.value.find(h => h.id === id)
    if (!item) return
    selectTask(item.taskId)
    archivedMode.value = item.archived
    setWorkspaceMode('work')
    historyOpen.value = false
  }
  function clearArchivedMode() { archivedMode.value = false }

  // ── 联动：注意力/时序 ──
  const _attentionFocusTitle = ref<string | null>(null)
  const _attentionFocusDesc = ref<string | null>(null)
  async function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
    // 同一任务再次点击 → 切换（清除筛选）
    if (_attentionTaskIds.value.length === 1 && _attentionTaskIds.value[0] === taskId) {
      _attentionTaskIds.value = []
      return
    }
    // 保持原有行为
    await selectTask(taskId)
    setWorkspaceMode('work')
    _attentionFocusTitle.value = title ?? null
    _attentionFocusDesc.value = desc ?? null
    // 计算关联任务 ID：本身 + parents + children
    const related = new Set<string>([taskId])
    const detail = _detailCache.value[taskId]
    if (detail) {
      for (const p of detail.parents ?? []) related.add(p)
      for (const c of detail.children ?? []) related.add(c)
    }
    _attentionTaskIds.value = [...related]
  }
  function focusOnTimelineNode(_eventId: string) {
    setWorkspaceMode('work')
  }

  // ── 终端 ──
  function enterTerminal() { terminalMode.value = true; workspaceMode.value = 'term' }
  function exitTerminal() { terminalMode.value = false; workspaceMode.value = 'work' }
  function sendTerminalCommand(cmd: string) {
    const c = cmd.trim()
    if (!c) return
    terminalLines.value.push({ kind: 'prompt', text: c })
    terminalLines.value.push({ kind: 'info', text: `ℹ sandbox 内执行：${c}` })
  }

  // ── 日程事件（按日期聚合）──
  const scheduleEvents = computed<Record<string, ScheduleEvent[]>>(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateToStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const hhmm = (ts: number) => {
      const d = new Date(ts)
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const map: Record<string, ScheduleEvent[]> = {}
    // 1. 现有任务按 createdAt 归类（携带优先级/状态，供右栏色带与视觉权重复用）
    for (const t of tasks.value) {
      const ts = t.createdAt
      const d = dateToStr(new Date(ts))
      if (!map[d]) map[d] = []
      map[d].push({
        id: t.id, date: d, title: t.title, kind: 'task', taskId: t.id,
        ts, time: hhmm(ts), priority: t.priority, status: t.status,
      })
    }
    // 2. timeline 事件（按真实 ts 归类日期，修正原先一律归当天的逻辑）
    for (const h of history.value) {
      const ts = h.ts
      const d = dateToStr(new Date(ts))
      if (!map[d]) map[d] = []
      if (!map[d].some(e => e.id === h.id)) {
        map[d].push({
          id: h.id, date: d, title: h.title, kind: 'timeline', taskId: h.taskId,
          ts, time: hhmm(ts), archived: h.archived,
        })
      }
    }
    // 3. 用户待办
    for (const t of userTodos.value) {
      if (!map[t.date]) map[t.date] = []
      map[t.date].push({ id: t.id, date: t.date, title: t.title, kind: 'todo', ts: t.createdAt })
    }
    return map
  })

  const scheduleEventsForSelected = computed<ScheduleEvent[]>(() =>
    scheduleEvents.value[scheduleSelectedDate.value] ?? [],
  )

  const scheduleDatesWithEvents = computed(() => new Set(Object.keys(scheduleEvents.value)))

  // 右栏按时间升序排列（无 ts 的归末位）
  const scheduleEventsForSelectedSorted = computed<ScheduleEvent[]>(() =>
    [...scheduleEventsForSelected.value].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
  )

  // 每日事件计数（左栏徽标数字）
  const scheduleCountsByDate = computed<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const [d, evs] of Object.entries(scheduleEvents.value)) m[d] = evs.length
    return m
  })

  // 每日最高优先级（左栏徽标着色：P0>P1>P2>P3，仅当当日含 task 类事件）
  const scheduleTopPriorityByDate = computed<Record<string, CockpitPriority>>(() => {
    const m: Record<string, CockpitPriority> = {}
    for (const [d, evs] of Object.entries(scheduleEvents.value)) {
      const prios = evs.filter(e => e.priority).map(e => e.priority!)
      if (prios.length) m[d] = prios.sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])[0]
    }
    return m
  })

  // ── 模板（localStorage）──
  const templates = computed(() => { void _kvRev.value; return kv.loadTemplates() })
  function saveTemplateFromCurrentWorkItem(name: string) {
    const id = selectedTaskId.value
    const draft = id ? kv.loadDraft(id) : null
    if (!draft) return
    const list = kv.loadTemplates()
    list.push({
      id: 'tpl-' + Date.now(), name, decision: draft.decision,
      riskTags: [...draft.riskTags], opinion: draft.opinion, modifiedFiles: [...draft.modifiedFiles],
      score: draft.score,
    })
    kv.saveTemplates(list)
    bumpKv()
  }
  function deleteTemplate(id: string) {
    const list = kv.loadTemplates().filter(t => t.id !== id)
    kv.saveTemplates(list)
    bumpKv()
  }
  function applyTemplateToCurrentWorkItem(templateId: string) {
    const tpl = kv.loadTemplates().find(t => t.id === templateId)
    const id = selectedTaskId.value
    if (!tpl || !id) return
    kv.saveDraft(id, { decision: tpl.decision, riskTags: [...tpl.riskTags], opinion: tpl.opinion, score: tpl.score })
    bumpKv()
    templateManagerOpen.value = false
  }
  function openTemplateManager() { templateManagerOpen.value = true }
  function closeTemplateManager() { templateManagerOpen.value = false }

  // ── 日程 ──
  function openSchedule(triggerBtn?: HTMLElement) {
    scheduleOpen.value = true
    const now = new Date()
    scheduleViewYear.value = now.getFullYear()
    scheduleViewMonth.value = now.getMonth()
    const pad = (n: number) => String(n).padStart(2, '0')
    scheduleSelectedDate.value =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    // 下拉横向定位：取「日程」按钮 left（右边界保护）
    if (triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect()
      const maxLeft = Math.max(16, window.innerWidth - 680 - 16)
      scheduleAnchorLeft.value = Math.min(rect.left, maxLeft)
    }
    userTodos.value = kv.loadUserTodos()
    startReminderScheduler()
  }
  function closeSchedule() { scheduleOpen.value = false }
  function setScheduleDate(d: string) { scheduleSelectedDate.value = d }
  function navigateScheduleMonth(delta: number) {
    let m = scheduleViewMonth.value + delta
    let y = scheduleViewYear.value
    if (m < 0) { m = 11; y-- }
    else if (m > 11) { m = 0; y++ }
    scheduleViewMonth.value = m
    scheduleViewYear.value = y
  }
  function addUserTodo(date: string, title: string, note?: string, remindAt?: number) {
    const todo: UserTodo = {
      id: 'todo-' + Date.now(), date, title, note,
      createdAt: Date.now(),
      remindAt: remindAt && remindAt > Date.now() ? remindAt : undefined,
    }
    userTodos.value.push(todo)
    kv.saveUserTodos(userTodos.value)
    // 立即检查一次，应对临近提醒
    checkReminders()
  }
  function removeUserTodo(id: string) {
    userTodos.value = userTodos.value.filter(t => t.id !== id)
    kv.saveUserTodos(userTodos.value)
    // 同步移除其应用内提醒通知
    reminderNotifications.value = reminderNotifications.value.filter(n => !n.id.startsWith(`reminder:${id}:`))
  }

  // ── 待办闹钟提醒调度 ──
  const MIN15 = 15 * 60 * 1000
  const MIN5 = 5 * 60 * 1000

  // 触发一次提醒：浏览器系统通知 + 应用内通知面板
  function fireReminder(todo: UserTodo, stage: 15 | 5) {
    // 浏览器系统通知
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(`⏰ ${todo.title}`, {
            body: stage === 15 ? '15 分钟后开始' : '5 分钟后开始',
            tag: `reminder:${todo.id}:${stage}`,
          })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') {
              new Notification(`⏰ ${todo.title}`, {
                body: stage === 15 ? '15 分钟后开始' : '5 分钟后开始',
                tag: `reminder:${todo.id}:${stage}`,
              })
            }
          })
        }
      }
    } catch { /* SSR/无权限环境静默 */ }
    // 应用内通知面板
    const item = notifyAdapter.fromReminder(todo, stage)
    // 去重：同 stage 仅保留最新一条
    reminderNotifications.value = [
      ...reminderNotifications.value.filter(n => n.id !== item.id),
      item,
    ]
  }

  // 检查所有待办的提醒窗口，按需触发并持久化触发标记
  function checkReminders() {
    let changed = false
    for (const todo of userTodos.value) {
      if (!todo.remindAt) continue
      const now = Date.now()
      const t = todo.remindAt
      // T-15 窗口：[t-15min, t-5min)
      if (!todo.reminded15 && now >= t - MIN15 && now < t - MIN5) {
        fireReminder(todo, 15)
        todo.reminded15 = true
        changed = true
      }
      // T-5 窗口：[t-5min, t)
      else if (!todo.reminded5 && now >= t - MIN5 && now < t) {
        fireReminder(todo, 5)
        todo.reminded5 = true
        changed = true
      }
      // 重载恢复：已过 remindAt 但 T-15/T-5 标记仍缺 → 补触发（仅一次，靠标记防重复）
      else if (now >= t) {
        if (!todo.reminded15) { fireReminder(todo, 15); todo.reminded15 = true; changed = true }
        if (!todo.reminded5) { fireReminder(todo, 5); todo.reminded5 = true; changed = true }
      }
    }
    if (changed) kv.saveUserTodos(userTodos.value)
  }

	  // 启动每分钟调度器（幂等：已启动则跳过）
	  function startReminderScheduler() {
	    if (_reminderTimer) return
	    checkReminders()   // 启动时立即检查一次（重载恢复）
	    _reminderTimer = setInterval(checkReminders, 60_000)
	  }
	  function stopReminderScheduler() {
	    if (_reminderTimer) { clearInterval(_reminderTimer); _reminderTimer = undefined }
	  }

	  // ── 定时轮询所有 board（注意力条/kabban 总览自动刷新）──
	  let _pollTimer: ReturnType<typeof setInterval> | undefined
	  function startCockpitPolling() {
	    if (_pollTimer) return
	    _pollTimer = setInterval(() => { refreshAllBoards() }, 30_000)
	  }
	  function stopCockpitPolling() {
	    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = undefined }
	    if (_wsDebounceTimer) { clearTimeout(_wsDebounceTimer); _wsDebounceTimer = undefined }
	  }

  // ── 附件 ──
  const taskAttachments = ref<Record<string, any[]>>({})
  const attachmentsLoading = ref(false)

  async function loadAttachments(taskId: string) {
    if (taskAttachments.value[taskId]) return
    attachmentsLoading.value = true
    try {
      const { listAttachments } = await import('@/api/hermes/kanban')
      const board = boardSlugOf(taskId)
      const list = await listAttachments(taskId, board ? { board } : undefined)
      taskAttachments.value = { ...taskAttachments.value, [taskId]: list }
    } catch {
      taskAttachments.value = { ...taskAttachments.value, [taskId]: [] }
    } finally {
      attachmentsLoading.value = false
    }
  }

  async function uploadAttachment(taskId: string, file: File) {
    const { uploadAttachment } = await import('@/api/hermes/kanban')
    const board = boardSlugOf(taskId)
    await uploadAttachment(taskId, file, board ? { board, uploadedBy: 'dashboard' } : { uploadedBy: 'dashboard' })
    const newVal = { ...taskAttachments.value }
    delete newVal[taskId]
    taskAttachments.value = newVal
    await loadAttachments(taskId)
    // 附件已同步到 workspace，刷新文件树
    await refreshFileTree(taskId)
  }

  async function deleteAttachment(attachmentId: number) {
    const { deleteAttachment: del } = await import('@/api/hermes/kanban')
    const tid = selectedTaskId.value
    const board = tid ? boardSlugOf(tid) : undefined
    await del(attachmentId, board ? { board } : undefined)
    taskAttachments.value = {}
    if (tid) {
      await loadAttachments(tid)
      await refreshFileTree(tid)
    }
  }

  return {
    // 派生态
    tasks, attention, attentionCount, selectedTask, selectedTaskId, selectionSeq,
    sortedTasks, filteredTasks, taskGroups, boards, searchResult,
    events, eventsForSelectedTask, eventsForTimeline, recentEventsForTimeline, recentEventsForSelectedTask,
    timelineActorFilter, timelineActorOptions,
    topologyForSelectedTask, relationsForSelectedTask,
    channels, channelsForSelectedTask, activeChannel,
    notifyOpen, notifyItems, notifyCount,
    openNotify, closeNotify,
    filesForSelectedTask, workItemForSelectedTask, selectedTaskDetail, boardSlugOf,
    filteredHistory, messagesForActiveChannel, templates, currentUserName,
    // 客户端态
    filters, searchQuery, _sessionSearching, collapsed, midTopCollapsed, midBottomCollapsed, workspaceMode, swarmKanbanVisible, activeChannelId, maximized,
    terminalMode, terminalLines, historyOpen, historyFilters, archivedMode,
    titleDetailOpen, titleDetailText, titleDetailTaskId, titleDetailTitle,
    runTraceOpen, runTraceTaskId, runTraceSessionId, runTraceRunId,
    kanbanDetailOpen, kanbanDetailTask, detailExpanded,
    templateManagerOpen, focusedGraphNodeId, selectedGraphNodeIds, selectedFileId,
    _attentionFocusTitle, _attentionFocusDesc, _attentionTaskIds, attentionActive, history, fileTrees, canvasTransform,
    // 方法
    bootstrap, selectTask, loadTaskDetail,
    toggleCollapsed, toggleMidTop, toggleMidBottom, toggleTimelineActor, toggleFilter, setDateRangeFilter, clearDateRangeFilter, runSearch, clearSearch, setWorkspaceMode, toggleMaximized,
    selectFile, toggleGraphNode, focusOnGraphNodeForTimeline,
    updateWorkItem, toggleRiskTag, submitWorkItem, autoSaveDraft, clearDraft,
    setPendingAssignee, setPendingPriority, setPendingBody, setPendingTitle, setPendingComment, currentTitle, addPendingLink, removePendingLink,
    selectChannel, sendMessage, disconnectOnUnmount,
    openHistory, closeHistory, openTitleDetail, closeTitleDetail, openRunTrace, openRunTraceGlobal, closeRunTrace, openKanbanDetail, closeKanbanDetail, toggleHistoryAction, setHistorySearch, setHistoryTimeRange, toggleHistoryCategory, toggleHistoryStatus, recallHistoryItem, clearArchivedMode,
    focusOnTaskFromAttention, focusOnTimelineNode, clearAttentionFilter,
    enterTerminal, exitTerminal, sendTerminalCommand,
    saveTemplateFromCurrentWorkItem, deleteTemplate, applyTemplateToCurrentWorkItem, openTemplateManager, closeTemplateManager,
    taskAttachments, attachmentsLoading, loadAttachments, uploadAttachment, deleteAttachment, refreshFileTree,
    // 日程
    scheduleOpen, scheduleSelectedDate, scheduleViewYear, scheduleViewMonth, userTodos,
    scheduleAnchorLeft, reminderNotifications,
    scheduleEvents, scheduleEventsForSelected, scheduleEventsForSelectedSorted,
    scheduleDatesWithEvents, scheduleCountsByDate, scheduleTopPriorityByDate,
    openSchedule, closeSchedule, setScheduleDate, navigateScheduleMonth,
    addUserTodo, removeUserTodo, startReminderScheduler, stopReminderScheduler,
    startCockpitPolling, stopCockpitPolling, refreshAllBoards,

  }
})
