import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type CockpitCategory = 'human' | 'cluster' | 'direct'
export type CockpitPriority = 'P0' | 'P1' | 'P2' | 'P3'
export type CockpitStatus =
  | 'triage' | 'todo' | 'running' | 'blocked' | 'review' | 'done' | 'archived'

export interface CockpitTask {
  id: string
  title: string
  category: CockpitCategory
  priority: CockpitPriority
  status: CockpitStatus
  assignee: string
  workspace: string
}

export type AttentionSeverity = 'high' | 'medium' | 'low'

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  title: string
  taskId: string
}

export interface CockpitFilters {
  priorities: CockpitPriority[]
  statuses: CockpitStatus[]
  categories: CockpitCategory[]
}

export type ColumnKey = 'left' | 'mid' | 'right'

// ── P2: 时序事件 & 拓扑 ──
export interface CockpitEvent {
  id: string
  taskId: string
  actor: string
  kind: 'A2H' | 'A2A'
  what: string
  when: string
  pending: boolean
  ts: number
  /** 事件涉及的图节点 id（节点级时序源筛选用；不填则该事件不在节点级时序流显示） */
  nodeIds?: string[]
}

export type TopologyLevel = 'project' | 'req' | 'app'
export type GraphNodeKind = 'project' | 'req' | 'file' | 'test'

export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeKind
  focus: boolean
  /** 连线目标节点 id 列表（无向，由调用方去重） */
  links?: string[]
}

// ── P3: 工作项 & 文件树 ──
export type WorkDecision = 'conditional' | 'reject' | 'approve'

export interface WorkItem {
  id: string
  taskId: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
  score?: number
}

export interface FileNode {
  id: string
  name: string
  isDir: boolean
  modified?: boolean
  children?: FileNode[]
}

// ── P4: 协作频道 & 聊天 ──
export type ChannelKind = 'matrix' | 'chat' | 'group'
export type WorkspaceMode = 'work' | 'chat' | 'term'

export interface CollabChannel {
  id: string
  taskId: string
  kind: ChannelKind
  label: string
  members: string[]
}

export interface ChatMessage {
  id: string
  channelId: string
  author: string
  isMe: boolean
  text: string
  ts: number
}

// ── P5: 终端 & 历史 & 归档 ──
export type TerminalLineKind = 'prompt' | 'info' | 'ok' | 'warn' | 'dim'
export interface TerminalLine {
  kind: TerminalLineKind
  text: string
}

export interface HistoryItem {
  id: string
  when: string
  taskId: string
  action: string
  title: string
  archived: boolean
}

export interface HistoryFilters {
  actions: string[]
  archived: 'all' | 'only' | 'exclude'
}

// ── P6: A2UI 模板 & 拓扑关系 ──
export interface A2uiTemplate {
  id: string
  name: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
}

export type RelationLabel = 'A2A' | 'A2H'

export interface GraphRelation {
  id: string
  taskId: string
  from: string
  to: string
  label: RelationLabel
}

const PRIORITY_ORDER: Record<CockpitPriority, number> = {
  P0: 0, P1: 1, P2: 2, P3: 3,
}

export const useCockpitStore = defineStore('cockpit', () => {
  const tasks = ref<CockpitTask[]>([])
  const selectedTaskId = ref<string | null>(null)
  const filters = ref<CockpitFilters>({ priorities: [], statuses: [], categories: [] })
  const collapsed = ref<Record<ColumnKey, boolean>>({ left: false, mid: false, right: false })
  const attention = ref<AttentionItem[]>([])

  const selectedTask = computed(
    () => tasks.value.find((t) => t.id === selectedTaskId.value) ?? null,
  )

  const sortedTasks = computed(() =>
    [...tasks.value].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    ),
  )

  const filteredTasks = computed(() =>
    sortedTasks.value.filter((t) => {
      const f = filters.value
      const ok = <T,>(arr: T[], v: T) => arr.length === 0 || arr.includes(v)
      return (
        ok(f.priorities, t.priority) && ok(f.statuses, t.status) && ok(f.categories, t.category)
      )
    }),
  )

  const tasksByCategory = computed(() => ({
    human: filteredTasks.value.filter((t) => t.category === 'human'),
    cluster: filteredTasks.value.filter((t) => t.category === 'cluster'),
    direct: filteredTasks.value.filter((t) => t.category === 'direct'),
  }))

  const attentionCount = computed(() => attention.value.length)

  function selectTask(id: string | null) {
    selectedTaskId.value = tasks.value.some((t) => t.id === id) ? id : null
    // 切任务时清空节点级时序源（避免上个任务的节点聚焦残留）
    focusedGraphNodeId.value = null
    // 退出归档只读态（recallHistoryItem 会在调用 selectTask 后重新设置）
    archivedMode.value = false
  }
  function toggleCollapsed(col: ColumnKey) {
    collapsed.value[col] = !collapsed.value[col]
  }
  function toggleFilter<K extends keyof CockpitFilters>(
    key: K,
    value: CockpitFilters[K][number],
  ) {
    const arr = filters.value[key] as CockpitFilters[K][number][]
    const i = arr.indexOf(value)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(value)
  }

  // ── P2 state ──
  const events = ref<CockpitEvent[]>([])
  const selectedTimelineNodeId = ref<string | null>(null)
  /** 当前作为时序源的图节点（null=任务级时序流）。点节点 toggle，切任务清空。 */
  const focusedGraphNodeId = ref<string | null>(null)
  const topologyLevel = ref<TopologyLevel>('app')
  const appTopology = ref<GraphNode[]>([])
  const reqTopology = ref<GraphNode[]>([])
  const projTopology = ref<GraphNode[]>([])
  /** 按 taskId 记录用户选中的图节点（多选） */
  const selectedGraphNodeIds = ref<Record<string, string[]>>({})

  // ── P2 getters ──
  const selectedTimelineNode = computed(
    () => events.value.find((e) => e.id === selectedTimelineNodeId.value) ?? null,
  )

  const eventsForSelectedTask = computed(() =>
    selectedTaskId.value
      ? events.value
          .filter((e) => e.taskId === selectedTaskId.value)
          .sort((a, b) => a.ts - b.ts)
      : [],
  )

  /** 时序流真正使用的事件源：无 focusedGraphNodeId 时=任务级；有则按节点筛选。 */
  const eventsForTimeline = computed(() => {
    const taskEvents = eventsForSelectedTask.value
    if (!focusedGraphNodeId.value) return taskEvents
    return taskEvents.filter((e) => (e.nodeIds ?? []).includes(focusedGraphNodeId.value))
  })

  const topologyForSelectedTask = computed(() => {
    const level = topologyLevel.value
    const pool =
      level === 'project'
        ? projTopology.value
        : level === 'req'
          ? reqTopology.value
          : appTopology.value
    const nodes = selectedTaskId.value
      ? pool.filter((n) => n.taskId === selectedTaskId.value)
      : []
    return { level, nodes }
  })

  function recentEventsForSelectedTask(threshold: number) {
    const all = eventsForSelectedTask.value
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    return {
      visible: all.slice(all.length - threshold),
      folded: all.slice(0, all.length - threshold),
    }
  }

  /** 基于 eventsForTimeline 的折叠版本（取代 recentEventsForSelectedTask 的时序流用法）。 */
  function recentEventsForTimeline(threshold: number) {
    const all = eventsForTimeline.value
    if (all.length <= threshold) return { visible: all, folded: [] as CockpitEvent[] }
    return {
      visible: all.slice(all.length - threshold),
      folded: all.slice(0, all.length - threshold),
    }
  }

  // ── P2 methods ──
  function selectTimelineNode(id: string | null) {
    selectedTimelineNodeId.value = events.value.some((e) => e.id === id) ? id : null
  }
  function toggleGraphNode(taskId: string, nodeId: string) {
    const cur = selectedGraphNodeIds.value[taskId] ?? []
    const i = cur.indexOf(nodeId)
    if (i >= 0) cur.splice(i, 1)
    else cur.push(nodeId)
    selectedGraphNodeIds.value = { ...selectedGraphNodeIds.value, [taskId]: cur }
  }
  function setTopologyLevel(level: TopologyLevel) {
    topologyLevel.value = level
  }

  // ── P3 state ──
  const workItems = ref<WorkItem[]>([])
  const fileTrees = ref<Record<string, FileNode[]>>({})
  const selectedFileId = ref<string | null>(null)

  // ── P3 getters ──
  const workItemForSelectedTask = computed(
    () => workItems.value.find((w) => w.taskId === selectedTaskId.value) ?? null,
  )
  const filesForSelectedTask = computed(() =>
    selectedTaskId.value ? (fileTrees.value[selectedTaskId.value] ?? []) : [],
  )

  // ── P3 methods ──
  function selectFile(id: string | null) {
    selectedFileId.value = id
  }
  function updateWorkItem(patch: Partial<Omit<WorkItem, 'id' | 'taskId'>>) {
    const wi = workItemForSelectedTask.value
    if (!wi) return
    Object.assign(wi, patch)
  }
  function toggleRiskTag(tag: string) {
    const wi = workItemForSelectedTask.value
    if (!wi) return
    const i = wi.riskTags.indexOf(tag)
    if (i >= 0) wi.riskTags.splice(i, 1)
    else wi.riskTags.push(tag)
  }

  // ── P4 state ──
  const workspaceMode = ref<WorkspaceMode>('work')
  const channels = ref<CollabChannel[]>([])
  const activeChannelId = ref<string | null>(null)
  const messages = ref<Record<string, ChatMessage[]>>({})
  const maximized = ref(false)

  // ── P4 getters ──
  const channelsForSelectedTask = computed(() =>
    selectedTaskId.value ? channels.value.filter((c) => c.taskId === selectedTaskId.value) : [],
  )
  const activeChannel = computed(
    () => channels.value.find((c) => c.id === activeChannelId.value) ?? null,
  )
  const messagesForActiveChannel = computed(() =>
    activeChannelId.value ? (messages.value[activeChannelId.value] ?? []) : [],
  )

  // ── P4 methods ──
  function setWorkspaceMode(mode: WorkspaceMode) {
    workspaceMode.value = mode
  }
  function selectChannel(id: string | null) {
    activeChannelId.value = id
    if (id) workspaceMode.value = 'chat'
  }
  function sendMessage(text: string) {
    const cid = activeChannelId.value
    if (!cid || !text.trim()) return
    const list = messages.value[cid] ?? []
    list.push({
      id: 'm' + Date.now(),
      channelId: cid,
      author: '你',
      isMe: true,
      text: text.trim(),
      ts: Date.now(),
    })
    messages.value = { ...messages.value, [cid]: list }
  }
  function toggleMaximized() {
    maximized.value = !maximized.value
  }

  // ── P5 state ──
  const terminalMode = ref(false)
  const terminalLines = ref<TerminalLine[]>([
    { kind: 'dim', text: 'Claude Code · sandbox 模式 · 根目录由当前任务 Workspace 决定' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'info', text: '任务上下文已加载，沙箱就绪，读写限定在根目录内' },
    { kind: 'dim', text: '────────────────────────────' },
    { kind: 'warn', text: '! 输入指令开始编程，如「打开 refresh.ts 看并发问题」' },
  ])
  const history = ref<HistoryItem[]>([])
  const historyOpen = ref(false)
  const historyFilters = ref<HistoryFilters>({ actions: [], archived: 'all' })
  const archivedMode = ref(false)
  const _attentionFocusTitle = ref<string | null>(null)
  const _attentionFocusDesc = ref<string | null>(null)

  // ── P5 getters ──
  const filteredHistory = computed(() =>
    history.value.filter((h) => {
      const f = historyFilters.value
      const actionOk = f.actions.length === 0 || f.actions.includes(h.action)
      const archOk =
        f.archived === 'all' ? true : f.archived === 'only' ? h.archived : !h.archived
      return actionOk && archOk
    }),
  )

  // ── P5 methods ──
  function enterTerminal() {
    terminalMode.value = true
    workspaceMode.value = 'term'
  }
  function exitTerminal() {
    terminalMode.value = false
    workspaceMode.value = 'work'
  }
  function sendTerminalCommand(cmd: string) {
    const c = cmd.trim()
    if (!c) return
    terminalLines.value.push({ kind: 'prompt', text: c })
    terminalLines.value.push({ kind: 'info', text: `ℹ sandbox 内执行：${c}` })
  }
  function openHistory() {
    historyOpen.value = true
  }
  function closeHistory() {
    historyOpen.value = false
  }
  function toggleHistoryAction(action: string) {
    const arr = historyFilters.value.actions
    const i = arr.indexOf(action)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(action)
  }
  function setHistoryArchivedFilter(v: 'all' | 'only' | 'exclude') {
    historyFilters.value.archived = v
  }
  function recallHistoryItem(id: string) {
    const item = history.value.find((h) => h.id === id)
    if (!item) return
    selectTask(item.taskId)
    archivedMode.value = item.archived
    setWorkspaceMode('work')
    historyOpen.value = false
  }
  function clearArchivedMode() {
    archivedMode.value = false
  }

  // ── 联动：注意力/时序/拓扑点击 → 右栏工作区 ──
  function focusOnTaskFromAttention(taskId: string, title?: string, desc?: string) {
    selectTask(taskId)
    setWorkspaceMode('work')
    // 暂存注意力点击的文案供 Workspace banner 显示
    _attentionFocusTitle.value = title ?? null
    _attentionFocusDesc.value = desc ?? null
  }
  function focusOnTimelineNode(eventId: string) {
    selectTimelineNode(eventId)
    setWorkspaceMode('work')
  }
  function focusOnGraphNodeForTimeline(nodeId: string) {
    // toggle：点已聚焦节点→取消（回任务级）；点新节点→设为时序源。
    focusedGraphNodeId.value = focusedGraphNodeId.value === nodeId ? null : nodeId
  }

  // ── P6 state ──
  const templates = ref<A2uiTemplate[]>([])
  const templateManagerOpen = ref(false)
  const appRelations = ref<GraphRelation[]>([])

  // ── P6 getters ──
  const relationsForSelectedTask = computed(() =>
    selectedTaskId.value ? appRelations.value.filter((r) => r.taskId === selectedTaskId.value) : [],
  )

  // ── P6 methods ──
  function saveTemplateFromCurrentWorkItem(name: string) {
    const wi = workItemForSelectedTask.value
    if (!wi) return
    templates.value.push({
      id: 'tpl-' + Date.now(),
      name,
      decision: wi.decision,
      riskTags: [...wi.riskTags],
      opinion: wi.opinion,
      modifiedFiles: [...wi.modifiedFiles],
    })
  }
  function deleteTemplate(id: string) {
    const i = templates.value.findIndex((t) => t.id === id)
    if (i >= 0) templates.value.splice(i, 1)
  }
  function applyTemplateToCurrentWorkItem(templateId: string) {
    const tpl = templates.value.find((t) => t.id === templateId)
    const wi = workItemForSelectedTask.value
    if (!tpl || !wi) return
    wi.decision = tpl.decision
    wi.riskTags = [...tpl.riskTags]
    wi.opinion = tpl.opinion
    templateManagerOpen.value = false
  }
  function openTemplateManager() {
    templateManagerOpen.value = true
  }
  function closeTemplateManager() {
    templateManagerOpen.value = false
  }

  return {
    tasks, selectedTaskId, filters, collapsed, attention,
    selectedTask, sortedTasks, filteredTasks, tasksByCategory, attentionCount,
    selectTask, toggleCollapsed, toggleFilter,
    events, selectedTimelineNodeId, focusedGraphNodeId, topologyLevel, appTopology, reqTopology, projTopology, selectedGraphNodeIds,
    selectedTimelineNode, eventsForSelectedTask, eventsForTimeline, topologyForSelectedTask, recentEventsForSelectedTask, recentEventsForTimeline,
    selectTimelineNode, toggleGraphNode, setTopologyLevel,
    workItems, fileTrees, selectedFileId,
    workItemForSelectedTask, filesForSelectedTask,
    selectFile, updateWorkItem, toggleRiskTag,
    workspaceMode, channels, activeChannelId, messages, maximized,
    channelsForSelectedTask, activeChannel, messagesForActiveChannel,
    setWorkspaceMode, selectChannel, sendMessage, toggleMaximized,
    terminalMode, terminalLines, history, historyOpen, historyFilters, archivedMode,
    filteredHistory,
    enterTerminal, exitTerminal, sendTerminalCommand,
    openHistory, closeHistory, toggleHistoryAction, setHistoryArchivedFilter,
    recallHistoryItem, clearArchivedMode,
    _attentionFocusTitle, _attentionFocusDesc,
    focusOnTaskFromAttention, focusOnTimelineNode, focusOnGraphNodeForTimeline,
    templates, templateManagerOpen, appRelations,
    relationsForSelectedTask,
    saveTemplateFromCurrentWorkItem, deleteTemplate, applyTemplateToCurrentWorkItem,
    openTemplateManager, closeTemplateManager,
  }
})
