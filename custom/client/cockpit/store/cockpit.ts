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
  const eventsForSelectedTask = computed(() =>
    selectedTaskId.value
      ? events.value.filter(e => e.taskId === selectedTaskId.value).sort((a, b) => a.ts - b.ts)
      : [],
  )

  const eventsForTimeline = computed(() => eventsForSelectedTask.value)

  function recentEventsForTimeline(threshold: number) {
    const all = eventsForTimeline.value
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    return { visible: all.slice(all.length - threshold), folded: all.slice(0, all.length - threshold) }
  }
  function recentEventsForSelectedTask(threshold: number) { return recentEventsForTimeline(threshold) }

  // ── 协作图 ──
  const topologyForSelectedTask = computed(() => {
    const detail = selectedTaskId.value ? _detailCache.value[selectedTaskId.value] : undefined
    return topologyAdapter.buildTopology(selectedTask.value, detail, tasks.value)
  })
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

  async function bootstrap() {
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

  async function loadTaskDetail(id: string) {
    try {
      const detail = _detailCache.value[id] ?? await kanbanApi.getTask(id)
      _detailCache.value[id] = detail
      events.value = eventAdapter.mergeDetail(detail)
      const profile = detail.task.assignee ?? undefined
      if (profile) extras.searchSessions(id, profile).catch(() => {})
    } catch {
      events.value = []
    }
    if (!_fileTreeCache.value[id]) {
      try {
        _fileTreeCache.value[id] = await extras.listWorkspaceFiles(id)
        fileTrees.value = { ...fileTrees.value, [id]: _fileTreeCache.value[id] }
      } catch {
        fileTrees.value = { ...fileTrees.value, [id]: [] }
      }
    }
  }

  // ── WebSocket 联动：tasks 引用变化 → 选中任务 detail invalidate ──
  // WebSocket 联动：kanban.tasks 变化 → 重新聚合所有 board + 选中任务 detail invalidate
  watch(() => kanban.tasks, () => {
    // 重新聚合（当前 board 的任务已刷新，重新合并所有 board）
    loadAllBoards().catch(() => {})
    const id = selectedTaskId.value
    if (id && _detailCache.value[id]) {
      delete _detailCache.value[id]
      loadTaskDetail(id)
    }
  })

  // ── 工作区/折叠/筛选 ──
  function toggleCollapsed(col: ColumnKey) { collapsed.value[col] = !collapsed.value[col] }
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
    topologyForSelectedTask, relationsForSelectedTask,
    channels, channelsForSelectedTask, activeChannel,
    filesForSelectedTask, workItemForSelectedTask,
    filteredHistory, messagesForActiveChannel, templates,
    // 客户端态
    filters, collapsed, workspaceMode, activeChannelId, maximized,
    terminalMode, terminalLines, historyOpen, historyFilters, archivedMode,
    templateManagerOpen, focusedGraphNodeId, selectedGraphNodeIds, selectedFileId,
    _attentionFocusTitle, _attentionFocusDesc, history, fileTrees, canvasTransform,
    // 方法
    bootstrap, selectTask, loadTaskDetail,
    toggleCollapsed, toggleFilter, setDateRangeFilter, clearDateRangeFilter, setWorkspaceMode, toggleMaximized,
    selectFile, toggleGraphNode, focusOnGraphNodeForTimeline,
    updateWorkItem, toggleRiskTag, submitWorkItem,
    selectChannel, sendMessage, disconnectOnUnmount,
    openHistory, closeHistory, toggleHistoryAction, setHistoryArchivedFilter, recallHistoryItem, clearArchivedMode,
    focusOnTaskFromAttention, focusOnTimelineNode,
    enterTerminal, exitTerminal, sendTerminalCommand,
    saveTemplateFromCurrentWorkItem, deleteTemplate, applyTemplateToCurrentWorkItem, openTemplateManager, closeTemplateManager,
  }
})
