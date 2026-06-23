import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useKanbanStore } from '@/stores/hermes/kanban'
import * as kanbanApi from '@/api/hermes/kanban'
import { useChatStore } from '@/stores/hermes/chat'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import * as extras from '@/custom/cockpit/api/kanban-extras'
import * as kv from './cockpit-kv'
import * as taskAdapter from '../adapters/task-adapter'
import * as attentionAdapter from '../adapters/attention-adapter'
import * as collabAdapter from '../adapters/collab-adapter'
import * as eventAdapter from '../adapters/event-adapter'
import * as topologyAdapter from '../adapters/topology-adapter'
import * as historyAdapter from '../adapters/history-adapter'
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
export type HistoryFilters = { actions: string[]; archived: 'all' | 'only' | 'exclude' }
export type WorkspaceMode = 'work' | 'chat' | 'term'
export type ChannelKind = 'matrix' | 'chat' | 'group'
export type WorkDecision = kv.WorkDecision
export type DraftWorkItem = kv.DraftWorkItem
export type A2uiTemplate = kv.A2uiTemplate
export type ColumnKey = 'left' | 'mid' | 'right'
export type TerminalLineKind = 'prompt' | 'info' | 'ok' | 'warn' | 'dim'
export interface TerminalLine { kind: TerminalLineKind; text: string }

export interface CockpitFilters {
  priorities: CockpitPriority[]
  statuses: taskAdapter.CockpitStatusBucket[]
  tenants: string[]
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

export interface FileNode { id: string; name: string; isDir: boolean; children?: FileNode[] }

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

  // ── 派生态（computed）──
  // 优先读跨 board 聚合的 cockpitTasks；若未聚合（如单元测试直接 push mockKanbanTasks），
  // fallback 读当前 kanban.tasks（映射为 default board），保持向后兼容
  const tasks = computed(() => {
    if (cockpitTasks.value.length) return cockpitTasks.value
    return kanban.tasks.map(t => taskAdapter.toCockpitTask(t, 'default'))
  })
  const attention = computed(() =>
    tasks.value
      .map(t => attentionAdapter.toAttention({ ...t, status: t.status } as any))
      .filter((x): x is AttentionItem => x !== null),
  )
  const attentionCount = computed(() => attention.value.length)

  // ── 客户端态 ──
  const selectedTaskId = ref<string | null>(null)
  const filters = ref<CockpitFilters>({ priorities: [], statuses: [], tenants: [], boardSlugs: [], dateRange: { from: null, to: null } })
  const collapsed = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  // 中栏上下分区折叠（协作图/时序流独立折叠）
  const midTopCollapsed = ref(false)     // 协作图折叠（向上收）
  const midBottomCollapsed = ref(false)  // 时序流折叠（向下收）
  const workspaceMode = ref<WorkspaceMode>('work')
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
  const historyFilters = ref<HistoryFilters>({ actions: [], archived: 'all' })
  const archivedMode = ref(false)
  const templateManagerOpen = ref(false)
  // task title 详情弹窗（双击 title 查看）（需求 #2）
  const titleDetailOpen = ref(false)
  const titleDetailText = ref('')
  // kanban 任务详情弹窗（双击协作图节点显示完整 KanbanTaskDetail）
  const kanbanDetailOpen = ref(false)
  const kanbanDetailTask = ref<KanbanTaskDetail | null>(null)
  const titleDetailTaskId = ref<string | null>(null)
  const focusedGraphNodeId = ref<string | null>(null)
  const selectedGraphNodeIds = ref<Record<string, string[]>>({})
  // 协作图画布变换（决策 #14）
  const canvasTransform = ref({ x: 0, y: 0, scale: 1 })

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
    [...tasks.value].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  )

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
      return okArr(f.priorities, t.priority)
        && okArr(f.statuses, taskAdapter.bucketStatus(t.status))
        && okArr(f.tenants, t.tenant ?? '(未指定)')
        && okArr(f.boardSlugs, t.boardSlug)
        && dateOk
    }),
  )

  const tasksByTenant = computed(() => {
    const map: Record<string, CockpitTask[]> = {}
    for (const t of filteredTasks.value) {
      const key = t.tenant ?? '(未指定)'
      ;(map[key] ??= []).push(t)
    }
    return map
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

  // ── 频道（parseTenant）──
  const channels = computed<CollabChannel[]>(() => {
    const t = selectedTask.value
    if (!t) return []
    const parsed = collabAdapter.parseTenant(t.tenant)
    if (!parsed || parsed.kind === 'plain') return []
    return [{
      id: `ch-${t.id}`, taskId: t.id,
      kind: parsed.kind === 'session' ? 'chat' : parsed.kind,
      label: parsed.label, routeTarget: parsed.routeTarget,
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

  // ── 历史 ──
  const filteredHistory = computed(() =>
    history.value.filter(h => {
      const f = historyFilters.value
      const actionOk = f.actions.length === 0 || f.actions.includes(h.action)
      const archOk = f.archived === 'all' ? true : f.archived === 'only' ? h.archived : !h.archived
      return actionOk && archOk
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
    selectedTaskId.value = id
    focusedGraphNodeId.value = null
    archivedMode.value = false
    if (!id) { events.value = []; return }
    await loadTaskDetail(id)
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
      events.value = eventAdapter.mergeDetail(detail)
      const profile = detail.task.assignee ?? undefined
      if (profile) extras.searchSessions(id, profile).catch(() => {})
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
      loadTaskDetail(id)
    }
  })

  // ── 工作区/折叠/筛选 ──
  function toggleCollapsed(col: ColumnKey) { collapsed.value[col] = !collapsed.value[col] }
  function toggleMidTop() { midTopCollapsed.value = !midTopCollapsed.value }
  function toggleMidBottom() { midBottomCollapsed.value = !midBottomCollapsed.value }
  function toggleTimelineActor(actor: string) {
    const i = timelineActorFilter.value.indexOf(actor)
    if (i >= 0) timelineActorFilter.value.splice(i, 1)
    else timelineActorFilter.value.push(actor)
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
  async function submitWorkItem() {
    const id = selectedTaskId.value
    const draft = id ? kv.loadDraft(id) : null
    if (!id || !draft) return
    const text = `[决策:${draft.decision}] 风险:${draft.riskTags.join(',')} ${draft.opinion}`.trim()
    await kanbanApi.addComment(id, { body: text })
    kv.clearDraft(id)
    bumpKv()
    delete _detailCache.value[id]
    await loadTaskDetail(id)
  }

  // ── 频道（聊天精简壳）──
  function selectChannel(id: string | null) {
    activeChannelId.value = id
    if (id) workspaceMode.value = 'chat'
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
  // kanban 详情弹窗：取完整 KanbanTaskDetail（含 comments/events/runs 等）
  const detailExpanded = ref(false)  // 弹窗"更多信息"折叠态
  function openKanbanDetail(taskId: string) {
    const detail = _detailCache.value[taskId]
    if (detail) {
      kanbanDetailTask.value = detail
      kanbanDetailOpen.value = true
    } else {
      // 若 detail 未缓存，用 CockpitTask 的基本信息构造最小 detail
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
  function setHistoryArchivedFilter(v: 'all' | 'only' | 'exclude') { historyFilters.value.archived = v }
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
  function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
    selectTask(taskId)
    setWorkspaceMode('work')
    _attentionFocusTitle.value = title ?? null
    _attentionFocusDesc.value = desc ?? null
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
    kv.saveDraft(id, { decision: tpl.decision, riskTags: [...tpl.riskTags], opinion: tpl.opinion })
    bumpKv()
    templateManagerOpen.value = false
  }
  function openTemplateManager() { templateManagerOpen.value = true }
  function closeTemplateManager() { templateManagerOpen.value = false }

  return {
    // 派生态
    tasks, attention, attentionCount, selectedTask, selectedTaskId,
    sortedTasks, filteredTasks, tasksByTenant, boards,
    events, eventsForSelectedTask, eventsForTimeline, recentEventsForTimeline, recentEventsForSelectedTask,
    timelineActorFilter, timelineActorOptions,
    topologyForSelectedTask, relationsForSelectedTask,
    channels, channelsForSelectedTask, activeChannel,
    filesForSelectedTask, workItemForSelectedTask,
    filteredHistory, messagesForActiveChannel, templates,
    // 客户端态
    filters, collapsed, midTopCollapsed, midBottomCollapsed, workspaceMode, activeChannelId, maximized,
    terminalMode, terminalLines, historyOpen, historyFilters, archivedMode,
    titleDetailOpen, titleDetailText, titleDetailTaskId, titleDetailTitle,
    kanbanDetailOpen, kanbanDetailTask, detailExpanded,
    templateManagerOpen, focusedGraphNodeId, selectedGraphNodeIds, selectedFileId,
    _attentionFocusTitle, _attentionFocusDesc, history, fileTrees, canvasTransform,
    // 方法
    bootstrap, selectTask, loadTaskDetail,
    toggleCollapsed, toggleMidTop, toggleMidBottom, toggleTimelineActor, toggleFilter, setDateRangeFilter, clearDateRangeFilter, setWorkspaceMode, toggleMaximized,
    selectFile, toggleGraphNode, focusOnGraphNodeForTimeline,
    updateWorkItem, toggleRiskTag, submitWorkItem,
    selectChannel, sendMessage, disconnectOnUnmount,
    openHistory, closeHistory, openTitleDetail, closeTitleDetail, openKanbanDetail, closeKanbanDetail, toggleHistoryAction, setHistoryArchivedFilter, recallHistoryItem, clearArchivedMode,
    focusOnTaskFromAttention, focusOnTimelineNode,
    enterTerminal, exitTerminal, sendTerminalCommand,
    saveTemplateFromCurrentWorkItem, deleteTemplate, applyTemplateToCurrentWorkItem, openTemplateManager, closeTemplateManager,
  }
})
