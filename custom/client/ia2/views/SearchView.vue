<!-- overlay/custom/client/ia2/views/SearchView.vue
     全站检索（2026-10-18 左侧栏批）：跨 matrix 会话/房间、看板任务、运行、
     治理文档、人员五类对象检索。顶栏搜索框保留快搜，这里给完整结果与过滤。
     分类聚类以 workspace_path 为跨对象键：会话经挂接任务反查工作区，任务直接
     带工作区；工作区过滤同时作用于会话与任务。所有行一击直达对象，不设中间页。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionRows } from '../composables/useSessionRows'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { fetchGovernanceOverview, type GovernanceDocMeta } from '@/custom/governance/api/governance'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'

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
const workspace = useWorkspaceStore()
const runsStore = useRunCenterStore()
// 任务结果就地开抽屉（不再跳看板）；会话/运行/文档仍按对象打开
const drawerTaskId = ref<string | null>(null)
const drawerOpen = ref(false)

const q = ref(String(route.query.q ?? ''))
const type = ref<SearchType>(normalizeType(route.query.type))
const workspaceFilter = ref(String(route.query.ws ?? ''))
const statusFilter = ref(String(route.query.status ?? ''))
const assigneeFilter = ref(String(route.query.assignee ?? ''))
const timeFilter = ref<'all' | '24h' | '7d' | '30d'>(normalizeTime(route.query.time))
const searchInput = ref<HTMLInputElement | null>(null)

const docs = ref<GovernanceDocMeta[]>([])
const docsError = ref('')

function normalizeType(raw: unknown): SearchType {
  const v = String(raw ?? '')
  return (['all', 'sessions', 'tasks', 'runs', 'docs', 'people'] as const).includes(v as SearchType)
    ? v as SearchType
    : 'all'
}

function normalizeTime(raw: unknown): 'all' | '24h' | '7d' | '30d' {
  const v = String(raw ?? '')
  return (['24h', '7d', '30d'] as const).includes(v as '24h' | '7d' | '30d')
    ? v as '24h' | '7d' | '30d'
    : 'all'
}

/**
 * 筛选状态入 URL（可刷新/分享/后退恢复）；检索词不入 URL——
 * 查询词可能含内部对象名，避免进入浏览器历史与日志。
 */
watch([type, workspaceFilter, statusFilter, assigneeFilter, timeFilter], () => {
  const next: Record<string, string> = { ...route.query as Record<string, string> }
  const set = (key: string, value: string, fallback = '') => {
    if (value && value !== fallback) next[key] = value
    else delete next[key]
  }
  set('type', type.value, 'all')
  set('ws', workspaceFilter.value)
  set('status', statusFilter.value)
  set('assignee', assigneeFilter.value)
  set('time', timeFilter.value, 'all')
  void router.replace({ query: next })
})

watch(() => route.query.type, (v) => { type.value = normalizeType(v) })
watch(() => route.query.time, (v) => { timeFilter.value = normalizeTime(v) })
watch(() => route.query.ws, (v) => { workspaceFilter.value = String(v ?? '') })
watch(() => route.query.status, (v) => { statusFilter.value = String(v ?? '') })
watch(() => route.query.assignee, (v) => { assigneeFilter.value = String(v ?? '') })

onMounted(() => {
  searchInput.value?.focus()
  void fetchGovernanceOverview()
    .then((res) => { docs.value = res.docs ?? [] })
    .catch(() => { docsError.value = zh.value ? '文档索引暂不可达' : 'Document index unavailable' })
})

const STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  triage: { zh: '分诊', en: 'Triage' }, todo: { zh: '待开始', en: 'To do' },
  scheduled: { zh: '已排期', en: 'Scheduled' }, ready: { zh: '就绪', en: 'Ready' },
  running: { zh: '进行中', en: 'In progress' }, blocked: { zh: '阻塞', en: 'Blocked' },
  review: { zh: '待评审', en: 'In review' }, done: { zh: '完成', en: 'Done' },
  archived: { zh: '归档', en: 'Archived' },
}

const taskById = computed(() => {
  const map = new Map<string, (typeof workspace.tasks)[number]>()
  for (const t of workspace.tasks) map.set(t.id, t)
  return map
})
const workspaceOptions = computed(() => [...new Set(workspace.tasks.map(t => t.workspace).filter(Boolean))].sort())
const assigneeOptions = computed(() => [...new Set(workspace.tasks.map(t => t.assignee).filter(Boolean))].sort())

/** 工作区显示只取路径末两层；完整绝对路径留在 option title / 结果 title。 */
function wsLabel(p: string): string {
  const parts = String(p).split('/').filter(Boolean)
  return parts.slice(-2).join('/') || p
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
    const ws = taskById.value.get(id)?.workspace
    if (ws) return ws
  }
  return ''
}

function openSession(kind: string, id: string): void {
  if (kind === 'room') void router.push({ name: 'ia2.commsRoom', params: { roomId: id } })
  else if (kind === 'group') void router.push({ name: 'ia2.groupRoom', params: { roomId: id } })
  else void router.push({ name: 'ia2.collabSession', params: { sessionId: id } })
}

const sessionRowsResult = computed<ResultRow[]>(() => sessionRows.value
  .filter((s) => {
    const ws = sessionWorkspace(s.taskIds)
    if (workspaceFilter.value && ws !== workspaceFilter.value) return false
    if (!timeWithin(s.lastActivityAt ?? null)) return false
    return !q.value.trim() || hay(s.name, s.kind, ws, ...s.taskIds).includes(q.value.trim().toLowerCase())
  })
  .map((s) => ({
    key: `s:${s.kind}:${s.id}`,
    title: s.name,
    meta: [s.kind === 'room' ? (zh.value ? '房间' : 'Room') : s.kind === 'group' ? (zh.value ? '群聊' : 'Group') : (zh.value ? '会话' : 'Chat'),
      sessionWorkspace(s.taskIds) ? wsLabel(sessionWorkspace(s.taskIds)!) : (zh.value ? '未关联工作区' : 'No workspace')].join(' · '),
    icon: s.kind === 'room' ? '#' : s.kind === 'group' ? '👥' : '💬',
    action: zh.value ? '打开' : 'Open',
    open: () => openSession(s.kind, s.id),
  })))

const taskRowsResult = computed<ResultRow[]>(() => workspace.tasks
  .filter((t) => {
    if (workspaceFilter.value && t.workspace !== workspaceFilter.value) return false
    if (statusFilter.value && t.status !== statusFilter.value) return false
    if (assigneeFilter.value && t.assignee !== assigneeFilter.value) return false
    if (!timeWithin(t.createdAt)) return false
    return !q.value.trim() || hay(t.title, t.id, t.workspace, t.assignee).includes(q.value.trim().toLowerCase())
  })
  .map((t) => ({
    key: `t:${t.id}`,
    title: t.title,
    meta: [t.id, t.workspace ? wsLabel(t.workspace) : (zh.value ? '未关联工作区' : 'No workspace'), STATUS_LABEL[t.status]?.[zh.value ? 'zh' : 'en'] ?? t.status, t.assignee].join(' · '),
    icon: '▦',
    action: zh.value ? '看板' : 'Board',
    open: () => { drawerTaskId.value = t.id; drawerOpen.value = true },
  })))

const runRowsResult = computed<ResultRow[]>(() => (runsStore.sortedRuns ?? [])
  .filter((r) => {
    const ts = r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : r.updatedAt ? new Date(r.updatedAt).getTime() : null
    if (!timeWithin(ts)) return false
    return !q.value.trim() || hay(r.runId, r.status, r.stage).includes(q.value.trim().toLowerCase())
  })
  .map((r) => ({
    key: `r:${r.runId}`,
    title: r.runId,
    meta: [r.status, r.stage ?? '', r.iteration ? `#${r.iteration}` : ''].filter(Boolean).join(' · '),
    icon: '◎',
    action: zh.value ? '推演' : 'Run',
    open: () => void router.push({ name: 'ia2.sim', query: { run: r.runId } }),
  })))

const docRowsResult = computed<ResultRow[]>(() => (workspaceFilter.value ? [] : docs.value
  .filter((d) => {
    const ts = d.committedAt ? new Date(d.committedAt).getTime() : null
    if (!timeWithin(ts)) return false
    return !q.value.trim() || hay(d.title, d.path, d.kind, d.group).includes(q.value.trim().toLowerCase())
  })
  .map((d) => ({
    key: `d:${d.kind}`,
    title: d.title,
    meta: [d.kind, d.group, d.exists ? (zh.value ? '在仓' : 'present') : (zh.value ? '缺件' : 'missing')].join(' · '),
    icon: '📄',
    action: zh.value ? '评审' : 'Review',
    open: () => void router.push({ name: 'ia2.stage6', query: { tab: 'docs', doc: d.kind } }),
  }))))

const peopleRowsResult = computed<ResultRow[]>(() => (workspaceFilter.value ? [] : accounts.value
  .filter((a) => !q.value.trim() || hay(a.displayName, a.userId).includes(q.value.trim().toLowerCase()))
  .map((a) => ({
    key: `p:${a.userId}`,
    title: a.displayName || a.userId,
    meta: [a.userId, a.isLeader ? (zh.value ? '团队领导' : 'Team lead') : (zh.value ? '成员' : 'Member')].join(' · '),
    icon: '◉',
    action: zh.value ? '账号' : 'Account',
    open: () => void router.push({ name: 'ia2.stage1', query: { tab: 'accounts' } }),
  }))))

const GROUPS: ReadonlyArray<{ key: GroupKey; label: string; rows: () => ResultRow[] }> = [
  { key: 'sessions', label: zh.value ? '会话与房间' : 'Chats & rooms', rows: () => sessionRowsResult.value },
  { key: 'tasks', label: zh.value ? '看板任务' : 'Tasks', rows: () => taskRowsResult.value },
  { key: 'runs', label: zh.value ? '运行' : 'Runs', rows: () => runRowsResult.value },
  { key: 'docs', label: zh.value ? '治理文档' : 'Documents', rows: () => docRowsResult.value },
  { key: 'people', label: zh.value ? '人员' : 'People', rows: () => peopleRowsResult.value },
]

const visibleGroups = computed(() => GROUPS
  .filter(g => type.value === 'all' || type.value === g.key)
  .map(g => ({ ...g, rows: g.rows() }))
  .filter(g => g.rows.length > 0 || type.value === g.key))

const total = computed(() => visibleGroups.value.reduce((n, g) => n + g.rows.length, 0))

// 2026-10-19 P2 批（走查 §四 P2-8）：类型页签带计数——先看数量再决定钻哪一类。
const counts = computed<Record<SearchType, number>>(() => {
  const map = { all: 0, sessions: 0, tasks: 0, runs: 0, docs: 0, people: 0 } as Record<SearchType, number>
  for (const g of GROUPS) {
    const n = g.rows().length
    map[g.key] = n
    map.all += n
  }
  return map
})

function reset(): void {
  q.value = ''
  workspaceFilter.value = ''
  statusFilter.value = ''
  assigneeFilter.value = ''
  timeFilter.value = 'all'
}
</script>

<template>
  <div class="srch" data-testid="search-page">
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
          :placeholder="zh ? '搜索会话、任务、运行、文档、人员…' : 'Search chats, tasks, runs, docs, people…'"
        >
        <button v-if="q" type="button" class="srch__clear" data-testid="search-clear" :aria-label="zh ? '清空' : 'Clear'" @click="q = ''">×</button>
      </div>
      <span class="srch__count" data-testid="search-count">{{ total }}</span>
    </header>

    <nav class="srch__tabs" role="tablist" :aria-label="zh ? '结果类型' : 'Result type'">
      <button
        v-for="t in (['all', 'sessions', 'tasks', 'runs', 'docs', 'people'] as const)"
        :key="t"
        type="button"
        role="tab"
        class="srch__tab"
        :class="{ 'srch__tab--on': type === t }"
        :aria-selected="type === t"
        :data-testid="`search-type-${t}`"
        @click="type = t"
      >{{ { all: zh ? '全部' : 'All', sessions: zh ? '会话' : 'Chats', tasks: zh ? '任务' : 'Tasks', runs: zh ? '运行' : 'Runs', docs: zh ? '文档' : 'Docs', people: zh ? '人员' : 'People' }[t] }}<span v-if="counts[t]" class="srch__tab-n" :data-testid="`search-count-${t}`">{{ counts[t] }}</span></button>
    </nav>

    <div class="srch__filters">
      <label class="srch__filter">
        <span>{{ zh ? '工作区' : 'Workspace' }}</span>
        <select v-model="workspaceFilter" data-testid="search-filter-workspace">
          <option value="">{{ zh ? '全部' : 'All' }}</option>
          <option v-for="w in workspaceOptions" :key="w" :value="w" :title="w">{{ wsLabel(w) }}</option>
        </select>
      </label>
      <label class="srch__filter">
        <span>{{ zh ? '状态' : 'Status' }}</span>
        <select v-model="statusFilter" data-testid="search-filter-status">
          <option value="">{{ zh ? '全部' : 'All' }}</option>
          <option v-for="(v, k) in STATUS_LABEL" :key="k" :value="k">{{ zh ? v.zh : v.en }}</option>
        </select>
      </label>
      <label class="srch__filter">
        <span>{{ zh ? '负责人' : 'Assignee' }}</span>
        <select v-model="assigneeFilter" data-testid="search-filter-assignee">
          <option value="">{{ zh ? '全部' : 'All' }}</option>
          <option v-for="a in assigneeOptions" :key="a" :value="a">{{ a }}</option>
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

    <div class="srch__body">
      <section v-for="g in visibleGroups" :key="g.key" class="srch__group" :data-testid="`search-group-${g.key}`">
        <h2 class="srch__gh">{{ g.label }}<span class="srch__gn">{{ g.rows.length }}</span></h2>
        <button
          v-for="row in g.rows.slice(0, 20)"
          :key="row.key"
          type="button"
          class="srch__row"
          :data-testid="`search-row-${row.key}`"
          @click="row.open()"
        >
          <span class="srch__ico2" aria-hidden="true">{{ row.icon }}</span>
          <span class="srch__body2">
            <strong class="srch__rt">{{ row.title }}</strong>
            <span class="srch__rm">{{ row.meta }}</span>
          </span>
          <span class="srch__go">{{ row.action }} →</span>
        </button>
        <p v-if="g.rows.length > 20" class="srch__more">{{ zh ? '仅显示前 20 条，缩小关键词查看更多。' : 'Showing first 20; narrow the query to see more.' }}</p>
      </section>

      <p v-if="docsError && (type === 'all' || type === 'docs')" class="srch__err">{{ docsError }}</p>
      <div v-if="total === 0" class="srch__empty" data-testid="search-empty">
        <p>{{ zh ? '没有匹配结果。' : 'No results.' }}</p>
        <p class="srch__empty-sub">{{ zh ? '换个关键词，或放宽工作区 / 状态 / 时间过滤。' : 'Try another keyword or relax the workspace / status / time filters.' }}</p>
      </div>
    </div>

    <KanbanTaskDrawer v-if="drawerOpen" v-model:show="drawerOpen" :task-id="drawerTaskId" />
  </div>
</template>

<style scoped>
.srch { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 18px 16px; overflow: hidden; }
.srch__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.srch__title { margin: 0; font-size: 16px; }
.srch__box { flex: 1; min-width: 220px; max-width: 720px; display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 7px; background: var(--bg-secondary); }
.srch__box:focus-within { border-color: var(--accent-primary); }
.srch__ico { color: var(--text-muted); font-size: 13px; }
.srch__input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 13px; outline: none; }
.srch__clear { border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 15px; }
.srch__count { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.srch__tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.srch__tab-n { margin-left: 4px; font-size: 10px; opacity: .72; }
.srch__tab { border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 7px 11px; font-family: inherit; font-size: 12.5px; color: var(--text-muted); cursor: pointer; white-space: nowrap; }
.srch__tab:hover { color: var(--text-primary); }
.srch__tab--on { color: var(--accent-primary); border-bottom-color: var(--accent-primary); font-weight: 600; }
.srch__filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
.srch__filter { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--text-muted); }
.srch__filter select { border: 1px solid var(--border-color); border-radius: 5px; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 11.5px; padding: 2px 6px; max-width: 200px; }
.srch__reset { border: 1px solid var(--border-color); border-radius: 5px; background: transparent; color: var(--text-muted); font-family: inherit; font-size: 11.5px; padding: 2px 8px; cursor: pointer; }
.srch__reset:hover { color: var(--text-primary); background: var(--bg-secondary); }
.srch__body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
.srch__group { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; flex-shrink: 0; }
.srch__gh { margin: 0; padding: 8px 12px; font-size: 12px; color: var(--text-muted); background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); }
.srch__gn { margin-left: 6px; font-variant-numeric: tabular-nums; }
.srch__row { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--border-color); background: transparent; text-align: left; font-family: inherit; color: inherit; cursor: pointer; }
.srch__row:last-child { border-bottom: 0; }
.srch__row:hover { background: var(--bg-secondary); }
.srch__row:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.srch__ico2 { width: 18px; text-align: center; color: var(--text-muted); flex-shrink: 0; }
.srch__body2 { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.srch__rt { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srch__rm { font-size: 10.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srch__go { font-size: 11px; color: var(--accent-primary); white-space: nowrap; }
.srch__more { margin: 0; padding: 6px 12px; font-size: 10.5px; color: var(--text-muted); }
.srch__err { margin: 0; font-size: 11.5px; color: var(--ia-stale); }
.srch__empty { padding: 28px 16px; text-align: center; border: 1px dashed var(--border-color); border-radius: 8px; }
.srch__empty p { margin: 0; font-size: 13px; }
.srch__empty-sub { margin-top: 4px !important; font-size: 11.5px !important; color: var(--text-muted); }
</style>
