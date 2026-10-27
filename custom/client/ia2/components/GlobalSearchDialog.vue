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
const workspaceFilter = ref('')
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
  workspaceFilter.value = String(route.query.ws ?? '')
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

const SEARCH_QUERY_KEYS = ['search', 'q', 'type', 'ws', 'status', 'assignee', 'time'] as const
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
const workspaceOptions = computed(() => [...new Set(workspace.tasks.map(task => task.workspace).filter(Boolean))].sort())
const assigneeOptions = computed(() => [...new Set(workspace.tasks.map(task => task.assignee).filter(Boolean))].sort())

function wsLabel(path: string): string {
  const parts = String(path).split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

function timeWithin(ts: number | null | undefined): boolean {
  if (timeFilter.value === 'all') return true
  if (!ts) return false
  const span = timeFilter.value === '24h' ? 86_400_000 : timeFilter.value === '7d' ? 604_800_000 : 2_592_000_000
  return Date.now() - ts <= span
}

function hay(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function sessionWorkspace(taskIds: string[]): string {
  for (const id of taskIds) {
    const value = taskById.value.get(id)?.workspace
    if (value) return value
  }
  return ''
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
    const ws = sessionWorkspace(session.taskIds)
    if (workspaceFilter.value && ws !== workspaceFilter.value) return false
    if (!timeWithin(session.lastActivityAt ?? null)) return false
    return !q.value.trim() || hay(session.name, session.kind, ws, ...session.taskIds).includes(q.value.trim().toLowerCase())
  })
  .map((session) => ({
    key: `s:${session.kind}:${session.id}`,
    title: session.name,
    meta: [session.kind === 'room' ? (zh.value ? '房间' : 'Room') : session.kind === 'group' ? (zh.value ? '群聊' : 'Group') : (zh.value ? '会话' : 'Chat'),
      sessionWorkspace(session.taskIds) ? wsLabel(sessionWorkspace(session.taskIds)) : (zh.value ? '未关联工作区' : 'No workspace')].join(' · '),
    icon: session.kind === 'room' ? '#' : session.kind === 'group' ? '👥' : '💬',
    action: zh.value ? '打开' : 'Open',
    open: () => openSession(session.kind, session.id),
  })))

const taskRowsResult = computed<ResultRow[]>(() => workspace.tasks
  .filter((task) => {
    if (workspaceFilter.value && task.workspace !== workspaceFilter.value) return false
    if (statusFilter.value && task.status !== statusFilter.value) return false
    if (assigneeFilter.value && task.assignee !== assigneeFilter.value) return false
    if (!timeWithin(task.createdAt)) return false
    return !q.value.trim() || hay(task.title, task.id, task.workspace, task.assignee).includes(q.value.trim().toLowerCase())
  })
  .map((task) => ({
    key: `t:${task.id}`,
    title: task.title,
    meta: [task.id, task.workspace ? wsLabel(task.workspace) : (zh.value ? '未关联工作区' : 'No workspace'), STATUS_LABEL[task.status]?.[zh.value ? 'zh' : 'en'] ?? task.status, task.assignee].join(' · '),
    icon: '▦',
    action: zh.value ? '看板' : 'Board',
    open: () => void router.push({ name: 'ia2.board', query: { task: task.id } }),
  })))

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

const docRowsResult = computed<ResultRow[]>(() => (workspaceFilter.value ? [] : (workspace.searchDocs ?? [])
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

const peopleRowsResult = computed<ResultRow[]>(() => (workspaceFilter.value ? [] : accounts.value
  .filter((account) => !q.value.trim() || hay(account.displayName, account.userId).includes(q.value.trim().toLowerCase()))
  .map((account) => ({
    key: `p:${account.userId}`,
    title: account.displayName || shortMxName(account.userId),
    meta: [stripHomeserver(account.userId), account.isLeader ? (zh.value ? '团队领导' : 'Team lead') : (zh.value ? '成员' : 'Member')].join(' · '),
    icon: '◉',
    action: zh.value ? '账号' : 'Account',
    open: () => void router.push({ name: 'ia2.stage1', query: { tab: 'accounts', user: account.userId } }),
  }))))

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
  { key: 'sessions', label: zh.value ? '会话与房间' : 'Chats & rooms', rows: () => sessionRowsResult.value },
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
watch([q, type, workspaceFilter, statusFilter, assigneeFilter, timeFilter], () => { activeIndex.value = 0 })
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

function openDeepSearch(): void {
  closeDialog()
  openSessionSearch()
}

function reset(): void {
  cockpit.clearSearch()
  workspaceFilter.value = ''
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
        >{{ { all: zh ? '全部' : 'All', sessions: zh ? '会话' : 'Chats', tasks: zh ? '任务' : 'Tasks', runs: zh ? '运行' : 'Runs', docs: zh ? '文档' : 'Docs', people: zh ? '人员' : 'People' }[tab] }}<span v-if="counts[tab]" class="srch__tab-n" :data-testid="`search-count-${tab}`">{{ counts[tab] }}</span></button>
      </nav>

      <div class="srch__filters">
        <label class="srch__filter">
          <span>{{ zh ? '工作区' : 'Workspace' }}</span>
          <select v-model="workspaceFilter" data-testid="search-filter-workspace">
            <option value="">{{ zh ? '全部' : 'All' }}</option>
            <option v-for="item in workspaceOptions" :key="item" :value="item" :title="item">{{ wsLabel(item) }}</option>
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
        <UiEmptyState v-if="total === 0 && commandRowsResult.length === 0" data-testid="search-empty" icon="🔍" boxed
          :title="zh ? '没有匹配结果' : 'No results'"
          :hint="zh ? '换个关键词，或放宽工作区 / 状态 / 时间过滤。' : 'Try another keyword or relax the workspace / status / time filters.'" />
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
