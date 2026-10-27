<!-- 统一全局检索弹窗：顶部输入与 Cmd/Ctrl+K 共用 cockpit 关键词，
     五类对象、命令、筛选和键盘导航只保留这一套结果模型。 -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NModal } from 'naive-ui'
import { useSessionRows } from '../composables/useSessionRows'
import { useChatStore } from '@/stores/hermes/chat'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import { useWorkspaceStore } from '../store/workspace'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useMsgSurfaceText } from '../i18n-msg-surface'
import { useSessionSearch } from '@/composables/useSessionSearch'
import UiEmptyState from '@/custom/ui/UiEmptyState.vue'
import { shortMxName, stripHomeserver } from '@/custom/ui/mxid-display'

type SearchType = 'all' | 'sessions' | 'tasks' | 'runs' | 'docs' | 'people'
type GroupKey = Exclude<SearchType, 'all'>

interface ResultRow {
  key: string
  title: string
  meta: string
  icon: string
  action: string
  open: () => void
  /** 推演来源行：渲染紫色徽章（跨实例标识，用户裁定） */
  sim?: boolean
}

const route = useRoute()
const router = useRouter()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const { sessionRows, accounts } = useSessionRows()
const chatStore = useChatStore()
const groupChat = useGroupChatStore()
const workspace = useWorkspaceStore()
const cockpit = useCockpitStore()
const matrixRoom = useMatrixRoomStore()
const runsStore = useRunCenterStore()
const tx = useMsgSurfaceText()
const { openSessionSearch } = useSessionSearch()

const q = computed({
  get: () => cockpit.searchQuery ?? '',
  set: (value: string) => cockpit.runSearch(value),
})
const type = ref<SearchType>('all')
const boardFilter = ref('')
const statusFilter = ref('')
const assigneeFilter = ref('')
const timeFilter = ref<'all' | '24h' | '7d' | '30d'>('all')
const searchInput = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

// 文档索引缓存与失败态在 workspace store（跨壳复用，一次会话只取一次）。
const docsError = computed(() => workspace.searchDocsFailed
  ? (zh.value ? '文档索引暂不可达' : 'Document index unavailable')
  : '')

function normalizeType(raw: unknown): SearchType {
  const value = String(raw ?? '')
  return (['all', 'sessions', 'tasks', 'runs', 'docs', 'people'] as const).includes(value as SearchType)
    ? value as SearchType
    : 'all'
}

function normalizeTime(raw: unknown): 'all' | '24h' | '7d' | '30d' {
  const value = String(raw ?? '')
  return (['24h', '7d', '30d'] as const).includes(value as '24h' | '7d' | '30d')
    ? value as '24h' | '7d' | '30d'
    : 'all'
}

function applyDeepLink(): void {
  cockpit.searchQuery = String(route.query.q ?? '')
  type.value = normalizeType(route.query.type)
  boardFilter.value = String(route.query.board ?? '')
  statusFilter.value = String(route.query.status ?? '')
  assigneeFilter.value = String(route.query.assignee ?? '')
  timeFilter.value = normalizeTime(route.query.time)
}

watch(() => route.fullPath, (_next, prev) => {
  if (route.query.search === '1') {
    applyDeepLink()
    workspace.openSearch()
    return
  }
  // 仅离开检索深链时收起（浏览器后退）；手工打开不随背景导航误关。
  if (prev && prev.includes('search=1') && workspace.searchOpen) {
    workspace.closeSearch()
  }
}, { immediate: true })

// ws 为旧工作区筛选深链键：不再消费，关闭时一并清理防残留
const SEARCH_QUERY_KEYS = ['search', 'q', 'type', 'board', 'ws', 'status', 'assignee', 'time'] as const
function closeDialog(): void {
  workspace.closeSearch()
  if (route.query.search !== '1') return
  const next = { ...route.query }
  for (const key of SEARCH_QUERY_KEYS) delete next[key]
  void router.replace({ query: next })
}

function onModalShow(value: boolean): void {
  if (!value) closeDialog()
}

let returnFocus: HTMLElement | null = null
watch(() => workspace.searchOpen, async (open) => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void loadDocs()
    void workspace.loadSearchPeople?.()
    loadSessionSources()
    await nextTick()
    searchInput.value?.focus()
    return
  }
  const target = returnFocus
  returnFocus = null
  await nextTick()
  target?.focus()
}, { immediate: true })

function loadDocs(): void {
  if (workspace.searchDocsLoaded) return
  void workspace.loadSearchDocs()
}

// 会话两源（agent 单聊/群聊）只在各自聊天页访问后才有数据——弹窗打开时
// 主动装载一次；store 请求序号守卫兜底重复装载，失败静默（fail-soft 读面）。
function loadSessionSources(): void {
  if (!chatStore.sessionsLoaded) void chatStore.loadSessions(chatStore.sessionProfileFilter).catch(() => undefined)
  void groupChat.loadRooms().catch(() => undefined)
}

const STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  triage: { zh: '分诊', en: 'Triage' }, todo: { zh: '待开始', en: 'To do' },
  scheduled: { zh: '已排期', en: 'Scheduled' }, ready: { zh: '就绪', en: 'Ready' },
  running: { zh: '进行中', en: 'In progress' }, blocked: { zh: '阻塞', en: 'Blocked' },
  review: { zh: '待评审', en: 'In review' }, done: { zh: '完成', en: 'Done' },
  archived: { zh: '归档', en: 'Archived' },
}

const taskById = computed(() => {
  const map = new Map<string, (typeof workspace.tasks)[number]>()
  for (const task of workspace.tasks) map.set(task.id, task)
  return map
})
const boardNameOf = computed(() => {
  const m = new Map<string, string>()
  for (const b of (workspace.boards ?? [])) m.set(b.slug, b.name || b.slug)
  for (const t of workspace.tasks) if (!m.has(t.boardSlug)) m.set(t.boardSlug, t.boardSlug)
  return m
})
const boardOptions = computed(() => (workspace.boards ?? []).map(b => ({
  slug: b.slug,
  label: `${b.name || b.slug}${b.source === 'sim' ? '（推演）' : ''}`,
})))
const assigneeOptions = computed(() => [...new Set(workspace.tasks.map(task => task.assignee).filter(Boolean))].sort())

function timeWithin(ts: number | null | undefined): boolean {
  if (timeFilter.value === 'all') return true
  if (!ts) return false
  const span = timeFilter.value === '24h' ? 86_400_000 : timeFilter.value === '7d' ? 604_800_000 : 2_592_000_000
  return Date.now() - ts <= span
}

function hay(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function sessionBoardSlugs(taskIds: string[]): Set<string> {
  const slugs = new Set<string>()
  for (const id of taskIds) {
    const slug = taskById.value.get(id)?.boardSlug
    if (slug) slugs.add(slug)
  }
  return slugs
}

function openSession(kind: string, id: string): void {
  if (kind === 'room') {
    matrixRoom.selectRoom(id)
    void router.push({ name: 'ia2.commsRoom', params: { roomId: id } })
  } else if (kind === 'group') {
    void router.push({ name: 'ia2.groupRoom', params: { roomId: id } })
  } else {
    void router.push({ name: 'ia2.collabSession', params: { sessionId: id } })
  }
}

const sessionRowsResult = computed<ResultRow[]>(() => sessionRows.value
  .filter((session) => {
    if (boardFilter.value && !sessionBoardSlugs(session.taskIds).has(boardFilter.value)) return false
    if (!timeWithin(session.lastActivityAt ?? null)) return false
    return !q.value.trim() || hay(session.name, session.kind, ...session.taskIds).includes(q.value.trim().toLowerCase())
  })
  .map((session) => {
    const boards = [...sessionBoardSlugs(session.taskIds)].map(slug => boardNameOf.value.get(slug) ?? slug)
    return {
      key: `s:${session.kind}:${session.id}`,
      title: session.name,
      meta: [session.kind === 'room' ? (zh.value ? '房间' : 'Room') : session.kind === 'group' ? (zh.value ? '群聊' : 'Group') : (zh.value ? '会话' : 'Chat'),
        boards.length ? boards.join('/') : (zh.value ? '未挂看板' : 'No board')].join(' · '),
      icon: session.kind === 'room' ? '#' : session.kind === 'group' ? '👥' : '💬',
      action: zh.value ? '打开' : 'Open',
      open: () => openSession(session.kind, session.id),
    }
  }))

const taskRowsResult = computed<ResultRow[]>(() => workspace.tasks
  .filter((task) => {
    if (boardFilter.value && task.boardSlug !== boardFilter.value) return false
    if (statusFilter.value && task.status !== statusFilter.value) return false
    if (assigneeFilter.value && task.assignee !== assigneeFilter.value) return false
    if (!timeWithin(task.createdAt)) return false
    return !q.value.trim() || hay(task.title, task.id, task.workspace, task.assignee).includes(q.value.trim().toLowerCase())
  })
  .map((task) => ({
    key: `t:${task.id}`,
    title: task.title,
    meta: [task.id, boardNameOf.value.get(task.boardSlug) ?? task.boardSlug, STATUS_LABEL[task.status]?.[zh.value ? 'zh' : 'en'] ?? task.status, task.assignee].join(' · '),
    icon: '▦',
    action: zh.value ? '看板' : 'Board',
    open: () => void router.push({ name: 'ia2.board', query: { task: task.id } }),
  })))

// SIM_STUDIO_URL（vite env 注入）配置时提供真跳转；缺席只提示不伪造深链
const simStudioUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SIM_STUDIO_URL ?? ''
const simSessionRowsResult = computed<ResultRow[]>(() => {
  if (!workspace.searchSimAvailable || !q.value.trim()) return []
  const needle = q.value.trim().toLowerCase()
  return (workspace.searchSimSessions ?? [])
    .filter((hit) => hit.displayName.toLowerCase().includes(needle) || hit.profile.toLowerCase().includes(needle) || hit.id.toLowerCase().includes(needle))
    .map((hit) => ({
      key: `sim:${hit.id}`,
      title: hit.displayName || hit.id,
      meta: [hit.profile, hit.chatType === 'group' ? (zh.value ? '群聊' : 'Group') : hit.chatType === 'dm' ? (zh.value ? '单聊' : 'DM') : hit.chatType, hit.id].join(' · '),
      icon: '◎',
      action: simStudioUrl ? (zh.value ? '推演实例' : 'Sim') : (zh.value ? '在推演实例中查看' : 'View in sim'),
      sim: true,
      open: () => {
        if (simStudioUrl) window.open(simStudioUrl, '_blank', 'noopener')
      },
    }))
})

const runRowsResult = computed<ResultRow[]>(() => (runsStore.sortedRuns ?? [])
  .filter((run) => {
    const ts = run.lastActivityAt ? new Date(run.lastActivityAt).getTime() : run.updatedAt ? new Date(run.updatedAt).getTime() : null
    if (!timeWithin(ts)) return false
    return !q.value.trim() || hay(run.runId, run.status, run.stage).includes(q.value.trim().toLowerCase())
  })
  .map((run) => ({
    key: `r:${run.runId}`,
    title: run.runId,
    meta: [run.status, run.stage ?? '', run.iteration ? `#${run.iteration}` : ''].filter(Boolean).join(' · '),
    icon: '◎',
    action: zh.value ? '推演' : 'Run',
    open: () => void router.push({ name: 'ia2.sim', query: { run: run.runId } }),
  })))

const docRowsResult = computed<ResultRow[]>(() => ((workspace.searchDocs ?? [])
  .filter((doc) => {
    const ts = doc.committedAt ? new Date(doc.committedAt).getTime() : null
    if (!timeWithin(ts)) return false
    return !q.value.trim() || hay(doc.title, doc.path, doc.kind, doc.group).includes(q.value.trim().toLowerCase())
  })
  .map((doc) => ({
    key: `d:${doc.kind}`,
    title: doc.title,
    meta: [doc.kind, doc.group, doc.exists ? (zh.value ? '在仓' : 'present') : (zh.value ? '缺件' : 'missing')].join(' · '),
    icon: '📄',
    action: zh.value ? '评审' : 'Review',
    open: () => void router.push({ name: 'ia2.stage6', query: { tab: 'docs', doc: doc.kind } }),
  }))))

const normalizeAccountId = (u: string): string => u.trim().toLowerCase().replace(/^@/, '').split(':')[0] ?? ''

/** 人员=roster（主源）∪ 团队注册表账号，按归一化账号名去重 */
const peopleEntries = computed<Array<{ userId: string; displayName: string; meta: string[] }>>(() => {
  const out: Array<{ userId: string; displayName: string; meta: string[] }> = []
  const seen = new Set<string>()
  for (const row of (workspace.searchPeopleRows ?? [])) {
    const userId = row[0] ?? ''
    if (!userId) continue
    const key = normalizeAccountId(userId)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ userId, displayName: shortMxName(userId), meta: [row[2] ?? '', row[1] ?? ''].filter(Boolean) })
  }
  for (const account of accounts.value) {
    const key = normalizeAccountId(String(account.userId ?? ''))
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      userId: String(account.userId),
      displayName: account.displayName || shortMxName(String(account.userId)),
      meta: [account.isLeader ? (zh.value ? '团队领导' : 'Team lead') : (zh.value ? '成员' : 'Member')],
    })
  }
  return out
})

const peopleRowsResult = computed<ResultRow[]>(() => peopleEntries.value
  .filter((person) => !q.value.trim() || hay(person.displayName, person.userId, ...person.meta).includes(q.value.trim().toLowerCase()))
  .map((person) => ({
    key: `p:${person.userId}`,
    title: person.displayName,
    meta: [stripHomeserver(person.userId), ...person.meta].join(' · '),
    icon: '◉',
    action: zh.value ? '账号' : 'Account',
    open: () => void router.push({ name: 'ia2.stage1', query: { tab: 'accounts', user: person.userId } }),
  })))

const COMMANDS = computed<Array<{ key: string; label: string; icon: string; to: { name: string; query?: Record<string, string> } }>>(() => [
  { key: 'overview', label: tx.value.cmdOverview, icon: '🏠', to: { name: 'ia2.dash' } },
  { key: 'journey', label: '流程总览（搭建五步＋交付五阶段）', icon: '🧭', to: { name: 'ia2.journey' } },
  { key: 'board', label: tx.value.cmdBoard, icon: '📋', to: { name: 'ia2.board' } },
  { key: 'inbox', label: tx.value.cmdInbox, icon: '📥', to: { name: 'ia2.inbox' } },
  { key: 'runs', label: tx.value.cmdRuns, icon: '🛰️', to: { name: 'ia2.sim' } },
  { key: 'sim-supervision', label: '监督面板（全流程推演）', icon: '🛰️', to: { name: 'ia2.simSupervision' } },
  { key: 'sim-delivery', label: '交付健康（⑤验收）', icon: '🚚', to: { name: 'ia2.simDelivery' } },
  { key: 'gov', label: tx.value.cmdGov, icon: '🏛️', to: { name: 'ia2.governance' } },
  { key: 'gov-docs', label: '文档评审（②⑤⑥）', icon: '📄', to: { name: 'ia2.govDocs' } },
  { key: 'cases', label: tx.value.cmdCases, icon: '📦', to: { name: 'ia2.deliveryCases' } },
  { key: 'ide', label: tx.value.cmdIde, icon: '⌨️', to: { name: 'ide.shell' } },
  { key: 'settings', label: tx.value.cmdSettings, icon: '🛠️', to: { name: 'hermes.settings' } },
])

const commandRowsResult = computed<ResultRow[]>(() => {
  if (type.value !== 'all') return []
  const needle = q.value.trim().toLowerCase()
  return COMMANDS.value
    .filter(command => !needle || command.label.toLowerCase().includes(needle))
    .map(command => ({
      key: `c:${command.key}`,
      title: command.label,
      meta: zh.value ? '命令' : 'Command',
      icon: command.icon,
      action: zh.value ? '打开' : 'Open',
      open: () => void router.push(command.to as never),
    }))
})

const GROUPS: ReadonlyArray<{ key: GroupKey; label: string; rows: () => ResultRow[] }> = [
  { key: 'sessions', label: zh.value ? '会话与房间' : 'Chats & rooms', rows: () => [...sessionRowsResult.value, ...simSessionRowsResult.value] },
  { key: 'tasks', label: zh.value ? '看板任务' : 'Tasks', rows: () => taskRowsResult.value },
  { key: 'runs', label: zh.value ? '运行' : 'Runs', rows: () => runRowsResult.value },
  { key: 'docs', label: zh.value ? '治理文档' : 'Documents', rows: () => docRowsResult.value },
  { key: 'people', label: zh.value ? '人员' : 'People', rows: () => peopleRowsResult.value },
]

const visibleGroups = computed(() => GROUPS
  .filter(group => type.value === 'all' || type.value === group.key)
  .map(group => ({ ...group, rows: group.rows() }))
  .filter(group => group.rows.length > 0 || type.value === group.key))

const total = computed(() => visibleGroups.value.reduce((count, group) => count + group.rows.length, 0))
const counts = computed<Record<SearchType, number>>(() => {
  const map = { all: 0, sessions: 0, tasks: 0, runs: 0, docs: 0, people: 0 } as Record<SearchType, number>
  for (const group of GROUPS) {
    const count = group.rows().length
    map[group.key] = count
    map.all += count
  }
  return map
})

const keyboardRows = computed<ResultRow[]>(() => [
  ...commandRowsResult.value,
  ...visibleGroups.value.flatMap(group => group.rows.slice(0, 20)),
])
const activeIndex = ref(0)
watch([q, type, boardFilter, statusFilter, assigneeFilter, timeFilter], () => { activeIndex.value = 0 })
// 跨实例推演会话：随检索词装载（服务端 60s 缓存挡连续击键）
watch(q, (needle) => { void workspace.loadSimSessions?.(needle) }, { immediate: true })
watch(() => keyboardRows.value.length, count => {
  if (activeIndex.value >= count) activeIndex.value = 0
})

function setActive(key: string): void {
  const index = keyboardRows.value.findIndex(row => row.key === key)
  if (index >= 0) activeIndex.value = index
}

function activateRow(row: ResultRow): void {
  workspace.closeSearch()
  row.open()
}

function activate(index?: number): void {
  const row = keyboardRows.value[index ?? activeIndex.value]
  if (row) activateRow(row)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeDialog()
    return
  }
  // Enter 与方向键只在关键词输入框内接管；其余按钮保留原生键盘行为。
  if (event.target !== searchInput.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    const count = keyboardRows.value.length
    if (count) activeIndex.value = (activeIndex.value + 1) % count
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    const count = keyboardRows.value.length
    if (count) activeIndex.value = (activeIndex.value - 1 + count) % count
  } else if (event.key === 'Enter') {
    event.preventDefault()
    activate()
  } else {
    return
  }
  void nextTick(() => listRef.value?.querySelector('.srch__row--on')?.scrollIntoView({ block: 'nearest' }))
}

function gotoSim(): void {
  closeDialog()
  void router.push({ name: 'ia2.sim' })
}

function openDeepSearch(): void {
  closeDialog()
  openSessionSearch()
}

function reset(): void {
  cockpit.clearSearch()
  boardFilter.value = ''
  statusFilter.value = ''
  assigneeFilter.value = ''
  timeFilter.value = 'all'
}
</script>

<template>
  <NModal
    :show="workspace.searchOpen"
    preset="card"
    class="global-search-modal"
    style="width: min(1080px, calc(100vw - 32px)); max-width: 1080px"
    :closable="false"
    :close-on-esc="true"
    :mask-closable="true"
    @update:show="onModalShow"
  >
    <div v-if="workspace.searchOpen" class="srch" data-testid="global-search-dialog" @keydown="onKeydown">
      <header class="srch__head">
        <h1 class="srch__title">{{ zh ? '检索' : 'Search' }}</h1>
        <div class="srch__box">
          <span class="srch__ico" aria-hidden="true">⌕</span>
          <input
            ref="searchInput"
            v-model="q"
            class="srch__input"
            data-testid="search-input"
            type="text"
            :placeholder="zh ? '搜索会话、任务、运行、文档、人员或命令…' : 'Search chats, tasks, runs, docs, people, or commands…'"
          >
          <button v-if="q" type="button" class="srch__clear" data-testid="search-clear" :aria-label="zh ? '清空' : 'Clear'" @click="cockpit.clearSearch()">×</button>
        </div>
        <span class="srch__count" data-testid="search-count">{{ total }}</span>
        <button type="button" class="srch__close" data-testid="global-search-close" :aria-label="zh ? '关闭检索' : 'Close search'" @click="closeDialog">×</button>
      </header>

      <nav class="srch__tabs" role="tablist" :aria-label="zh ? '结果类型' : 'Result type'">
        <button
          v-for="tab in (['all', 'sessions', 'tasks', 'runs', 'docs', 'people'] as const)"
          :key="tab"
          type="button"
          role="tab"
          class="srch__tab"
          :class="{ 'srch__tab--on': type === tab }"
          :aria-selected="type === tab"
          :data-testid="`search-type-${tab}`"
          @click="type = tab"
        >{{ { all: zh ? '全部' : 'All', sessions: zh ? '会话' : 'Chats', tasks: zh ? '任务' : 'Tasks', runs: zh ? '运行' : 'Runs', docs: zh ? '文档' : 'Docs', people: zh ? '人员' : 'People' }[tab] }}<span v-if="counts[tab] || type === tab" class="srch__tab-n" :data-testid="`search-count-${tab}`">{{ counts[tab] }}</span></button>
      </nav>

      <div class="srch__filters">
        <label class="srch__filter">
          <span>{{ zh ? '看板' : 'Board' }}</span>
          <select v-model="boardFilter" data-testid="search-filter-board">
            <option value="">{{ zh ? '全部' : 'All' }}</option>
            <option v-for="item in boardOptions" :key="item.slug" :value="item.slug">{{ item.label }}</option>
          </select>
        </label>
        <label class="srch__filter">
          <span>{{ zh ? '状态' : 'Status' }}</span>
          <select v-model="statusFilter" data-testid="search-filter-status">
            <option value="">{{ zh ? '全部' : 'All' }}</option>
            <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ zh ? label.zh : label.en }}</option>
          </select>
        </label>
        <label class="srch__filter">
          <span>{{ zh ? '负责人' : 'Assignee' }}</span>
          <select v-model="assigneeFilter" data-testid="search-filter-assignee">
            <option value="">{{ zh ? '全部' : 'All' }}</option>
            <option v-for="item in assigneeOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label class="srch__filter">
          <span>{{ zh ? '时间' : 'Time' }}</span>
          <select v-model="timeFilter" data-testid="search-filter-time">
            <option value="all">{{ zh ? '全部' : 'All' }}</option>
            <option value="24h">{{ zh ? '24 小时' : '24 hours' }}</option>
            <option value="7d">{{ zh ? '7 天' : '7 days' }}</option>
            <option value="30d">{{ zh ? '30 天' : '30 days' }}</option>
          </select>
        </label>
        <button type="button" class="srch__reset" data-testid="search-reset" @click="reset">{{ zh ? '重置过滤' : 'Reset' }}</button>
      </div>

      <div ref="listRef" class="srch__body">
        <section v-if="commandRowsResult.length" class="srch__group" data-testid="search-group-commands">
          <h2 class="srch__gh">{{ zh ? '命令' : 'Commands' }}<span class="srch__gn">{{ commandRowsResult.length }}</span></h2>
          <button
            v-for="row in commandRowsResult"
            :key="row.key"
            type="button"
            class="srch__row"
            :class="{ 'srch__row--on': keyboardRows[activeIndex]?.key === row.key }"
            :data-testid="`search-command-${row.key}`"
            @mouseenter="setActive(row.key)"
            @click="activateRow(row)"
          >
            <span class="srch__ico2" aria-hidden="true">{{ row.icon }}</span>
            <span class="srch__body2"><strong class="srch__rt">{{ row.title }}</strong><span class="srch__rm">{{ row.meta }}</span></span>
            <span class="srch__go">{{ row.action }} →</span>
          </button>
        </section>

        <section v-if="simSessionRowsResult.length && (type === 'all' || type === 'sessions')" class="srch__group srch__group--sim" data-testid="search-group-sim-sessions">
          <h2 class="srch__gh">{{ zh ? '推演会话' : 'Simulation sessions' }}<span class="srch__gn">{{ simSessionRowsResult.length }}</span></h2>
          <button
            v-for="row in simSessionRowsResult.slice(0, 10)"
            :key="row.key"
            type="button"
            class="srch__row"
            :data-testid="`search-row-${row.key}`"
            @click="row.open()"
          >
            <span class="srch__ico2" aria-hidden="true">{{ row.icon }}</span>
            <span class="srch__body2"><strong class="srch__rt">{{ row.title }}</strong><span class="srch__rm">{{ row.meta }}</span></span>
            <span class="srch__simbadge srch__simbadge--sim" data-testid="sim-badge">{{ zh ? '推演' : 'SIM' }}</span>
            <span class="srch__go">{{ row.action }}</span>
          </button>
          <p v-if="simSessionRowsResult.length > 10" class="srch__more">{{ zh ? '仅显示前 10 条推演会话，输入更精确关键词收敛。' : 'Showing first 10 sim sessions.' }}</p>
        </section>

        <section v-for="group in visibleGroups" :key="group.key" class="srch__group" :data-testid="`search-group-${group.key}`">
          <h2 class="srch__gh">{{ group.label }}<span class="srch__gn">{{ group.rows.length }}</span></h2>
          <button
            v-for="row in group.rows.slice(0, 20)"
            :key="row.key"
            type="button"
            class="srch__row"
            :class="{ 'srch__row--on': keyboardRows[activeIndex]?.key === row.key }"
            :data-testid="`search-row-${row.key}`"
            @mouseenter="setActive(row.key)"
            @click="activateRow(row)"
          >
            <span class="srch__ico2" aria-hidden="true">{{ row.icon }}</span>
            <span class="srch__body2"><strong class="srch__rt">{{ row.title }}</strong><span class="srch__rm">{{ row.meta }}</span></span>
            <span class="srch__go">{{ row.action }} →</span>
          </button>
          <p v-if="group.rows.length > 20" class="srch__more">{{ zh ? '仅显示前 20 条，缩小关键词查看更多。' : 'Showing first 20; narrow the query to see more.' }}</p>
        </section>

        <p v-if="docsError && (type === 'all' || type === 'docs')" class="srch__err">{{ docsError }}</p>
        <div v-if="type === 'runs' && counts.runs === 0" class="srch__runsempty" data-testid="search-runs-empty">
          <p>{{ zh ? '日常实例暂无运行记录，运行在全流程推演专区查看。' : 'No runs in the daily instance — runs live in full-run simulation.' }}</p>
          <button type="button" class="srch__goto" data-testid="search-runs-goto-sim" @click="gotoSim">{{ zh ? '去全流程推演 →' : 'Open full-run simulation →' }}</button>
        </div>
        <UiEmptyState v-else-if="total === 0 && commandRowsResult.length === 0" data-testid="search-empty" icon="🔍" boxed
          :title="zh ? '没有匹配结果' : 'No results'"
          :hint="zh ? '换个关键词，或放宽看板 / 状态 / 时间过滤。' : 'Try another keyword or relax the board / status / time filters.'" />
      </div>

      <footer class="srch__footer">
        <button type="button" class="srch__deep" data-testid="spotlight-deep-search" @click="openDeepSearch">{{ tx.deepSearchSessions }}</button>
        <span class="srch__keys">↑↓ {{ zh ? '选择' : 'Select' }} · Enter {{ zh ? '打开' : 'Open' }} · Esc {{ zh ? '关闭' : 'Close' }}</span>
      </footer>
    </div>
  </NModal>
</template>

<style scoped>
.srch { height: min(76vh, 760px); min-height: 320px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
.srch__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.srch__title { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 650; letter-spacing: -0.01em; }
.srch__box { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--border-color); border-radius: 9px; background: var(--bg-secondary); }
.srch__box:focus-within { border-color: var(--accent-primary); }
.srch__ico { color: var(--text-muted); font-size: 14px; }
.srch__input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 13.5px; outline: none; }
.srch__input:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; border-radius: 4px; }
.srch__clear, .srch__close { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; }
.srch__close { width: 28px; height: 28px; font-size: 20px; line-height: 1; }
.srch__clear:hover, .srch__close:hover { color: var(--text-primary); }
.srch__count { font-size: 12.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.srch__tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; overflow-x: auto; }
.srch__tab-n { margin-left: 4px; font-size: 10.5px; opacity: .72; }
.srch__tab { border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 9px 14px; font-family: inherit; font-size: 13px; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
.srch__tab:hover { color: var(--text-primary); }
.srch__tab--on { color: var(--accent-primary); border-bottom-color: var(--accent-primary); font-weight: 600; }
.srch__filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
.srch__filter { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-muted); }
.srch__filter select { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 3px 8px; max-width: 200px; }
.srch__reset { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-muted); font-family: inherit; font-size: 12px; padding: 3px 10px; cursor: pointer; }
.srch__reset:hover { color: var(--text-primary); background: var(--bg-secondary); }
.srch__body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
.srch__group { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
.srch__gh { margin: 0; padding: 9px 14px; font-size: 12.5px; color: var(--text-muted); background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); }
.srch__gn { margin-left: 6px; font-variant-numeric: tabular-nums; }
.srch__row { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border: 0; border-bottom: 1px solid var(--border-color); background: transparent; text-align: left; font-family: inherit; color: inherit; cursor: pointer; }
.srch__row:last-child { border-bottom: 0; }
.srch__row:hover, .srch__row--on { background: var(--bg-secondary); }
.srch__row:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.srch__ico2 { width: 18px; text-align: center; color: var(--text-muted); flex-shrink: 0; }
.srch__body2 { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.srch__rt { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srch__rm { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srch__go { font-size: 12px; color: var(--accent-primary); white-space: nowrap; }
.srch__more { margin: 0; padding: 7px 14px; font-size: 11px; color: var(--text-muted); }
.srch__err { margin: 0; font-size: 12px; color: var(--ia-stale); }
.srch__simbadge { flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 999px; letter-spacing: .02em; }
.srch__simbadge--sim { color: var(--ia-sim-on, #fff); background: var(--ia-sim, #7c3aed); border: 1px solid rgba(255,255,255,.25); }
.srch__group--sim { border-color: rgba(124, 58, 237, .45); }
.srch__group--sim .srch__gh { color: var(--ia-sim-deep, #6d28d9); }
.srch__runsempty { padding: 28px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.srch__runsempty p { margin: 0 0 10px; }
.srch__goto { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--accent-primary); font-family: inherit; font-size: 12px; padding: 5px 14px; cursor: pointer; }
.srch__goto:hover { background: var(--bg-secondary); }
.srch__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-color); padding-top: 10px; }
.srch__deep { border: 0; background: transparent; color: var(--accent-primary); font-family: inherit; font-size: 12px; padding: 4px 0; cursor: pointer; }
.srch__deep:hover { color: var(--text-primary); }
.srch__keys { color: var(--text-muted); font-size: 11px; white-space: nowrap; }

@media (max-width: 720px) {
  .srch { height: 78vh; }
  .srch__title { font-size: 18px; }
  .srch__keys { display: none; }
}
</style>
