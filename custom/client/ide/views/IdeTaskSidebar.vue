<script setup lang="ts">
// IdeTaskSidebar — /ide 富侧栏（ZCode 3.12.3 实拍结构对齐，用户清单批扩展）：
//   顶部：新建任务（⌘N）/ 搜索（⌘K 命令面板）/ 自动化（JobsView 对应物）
//   组织模式三 chip（organize）：分组（任务会话标签 category）/ 项目（本机
//   workspace 目录）/ 时间线（任务优先级 → 更新时间逆序）
//   任务菜单：置顶 / 移动到分组（含新建分组）/ 归档 / 分享导出（exportSession）/ 删除
//   归档区：展开加载已归档会话（恢复/打开）；底部 ⇄ 工作台 + 功能按钮组
//   （查看文件右移右侧辅助栏，09-20 裁定：文件视图基于任务会话与项目，
//   不与任务平行独立存在）。
// 状态：置顶复用 sessionBrowserPrefs（与 HistoryView 全局一致）；分组走
// /api/studio/session-categories（fetch/create/setSessionCategory）；时间线
// 优先级经 /api/hermes/kanban listTasks 的 session_id 桥接（口径同 cockpit
// bucketPriority：数字越大越高）。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage, NDropdown, NTooltip, type DropdownOption } from 'naive-ui'
import { useChatStore, type Session } from '@/stores/hermes/chat'
import { useIdePins } from '../utils/pins'
import {
  unarchiveSession,
  batchDeleteSessions,
  fetchSessionCategories,
  createSessionCategory,
  setSessionCategory,
  renameSessionCategory,
  deleteSessionCategory,
  exportSession,
  type SessionCategory,
} from '@/api/studio/sessions'
import { bucketPriority } from '@/custom/cockpit/adapters/task-adapter'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { useIdeKanbanOverview } from '../composables/useIdeKanbanOverview'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import { fetchArchivedSessions, type ArchivedSessionItem } from '../api/archivedSessions'
import { restoreAllArchived } from '../utils/archive-restore'
import { formatRelativeTime, workspaceLabel } from '../utils/time'
import { bucketSessions } from '../utils/sessionBuckets'
import { engineDefaultFromCache } from '../utils/engine-models'
import { buildNewTaskOptions, sessionTaskMode } from '../utils/task-mode'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'
// zcode CLI 会话兼容展示（2026-10-19 用户需求批）：与 IDE 会话同栏可折叠分组，
// 数据/动作自持（IdeCliSessions），不进 chatStore（避免伪会话 ID 打断打开链）。
import IdeCliSessions from '../components/IdeCliSessions.vue'
// 遗留项收编（2026-10-21）：混排行复用账单子组件 + 用量共享单例
import IdeCliSessionBill from '../components/IdeCliSessionBill.vue'
import { useZcodeCliUsage } from '../composables/useZcodeCliUsage'
// 项目归类（2026-10-19 组织模式修正）：内部工作区/空 → 未绑项目；真实路径 → 目录名
import { sessionProjectOf, cliProjectOf, filterCliSessions } from '../utils/sessionProjects'
import { fetchCliSessions, launchDevtool, type CliSession } from '../api/devtools'
import { showToast } from '../utils/toast'
// 2026-10-19 视图语义修正批：本地视图文案（覆盖词表 view_*——词表值「已完成」
// 名不副实：done 桶口径是「超过 24h 无活动」而非任务完成，会话无完成态字段，
// 诚实口径=「更早」）。title 写明口径，避免再次误读。
const VIEW_TEXT: Record<'active' | 'done' | 'workspace', { zh: string; en: string; hint: string }> = {
  active: { zh: '进行中', en: 'Active', hint: '24 小时内活跃或正在运行的会话' },
  done: { zh: '更早', en: 'Earlier', hint: '超过 24 小时未活跃的会话（非已完成）' },
  workspace: { zh: '工作空间', en: 'Workspaces', hint: '按工作空间分组查看全部会话' },
}

const { t } = useI18n()
const zh = computed(() => String((useI18n() as unknown as { locale?: { value?: string } }).locale?.value ?? 'zh').startsWith('zh'))
const router = useRouter()
const message = useMessage()
const chat = useChatStore()
// 用户主动点选会话 → 通知外壳收起裸落地引导（本地草稿不是「已进入工作区」）
const emit = defineEmits<{ open: [id: string] }>()
const prefs = useIdePins()
// prefs.pinnedIds 非响应式（闭包数组），经触发器转响应式供 computed 依赖
const pinsVersion = ref(0)
prefs.onChange(() => { pinsVersion.value++ })
const pinnedIds = computed(() => { void pinsVersion.value; return prefs.pinnedIds })
const ide = useIdeStore()
const { root } = useIdeWorkspace()
const { locale } = useI18n()
const modeText = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].mode)
/** 任务模式徽标：编/工（派生自会话，不新增服务端字段） */
function taskModeBadge(s: Session): string {
  return sessionTaskMode(s) === 'work' ? modeText.value.workShort : modeText.value.codingShort
}

// ---- 分组（category）底座 ----
const categories = ref<SessionCategory[]>([])
const newGroupDraft = ref<string | null>(null)
async function loadCategories(): Promise<void> {
  try {
    categories.value = await fetchSessionCategories()
  } catch { /* 分组加载失败不阻塞任务列表 */ }
}
async function createGroup(): Promise<void> {
  const name = (newGroupDraft.value || '').trim()
  newGroupDraft.value = null
  if (!name) return
  try {
    const created = await createSessionCategory(name)
    categories.value = [...categories.value, created]
    message.success(t('ide.task.groupCreated'))
  } catch {
    message.error(t('ide.task.groupCreateFailed'))
  }
}
const renameDraft = ref<{ id: number; name: string } | null>(null)
async function commitRename(): Promise<void> {
  const draft = renameDraft.value
  renameDraft.value = null
  if (!draft || !draft.name.trim() || draft.name.trim() === draft.name) {
    if (draft) await loadCategories() // 还原显示
    return
  }
  try {
    await renameSessionCategory(draft.id, draft.name.trim())
    await loadCategories()
  } catch {
    message.error(t('ide.task.groupRenameFailed'))
  }
}
async function removeGroup(categoryId: number): Promise<void> {
  try {
    await deleteSessionCategory(categoryId)
    for (const s of chat.sessions) if (s.categoryId === categoryId) s.categoryId = null
    await loadCategories()
  } catch {
    message.error(t('ide.task.groupDeleteFailed'))
  }
}

async function moveToGroup(sessionId: string, categoryId: number | null): Promise<void> {
  try {
    await setSessionCategory(sessionId, categoryId)
    const target = chat.sessions.find(s => s.id === sessionId)
    if (target) target.categoryId = categoryId
  } catch {
    message.error(t('ide.task.groupMoveFailed'))
  }
}

// ---- 时间线优先级桥接（kanban task.session_id ↔ chat session.id/agentSessionId）----
// 口径同 cockpit bucketPriority：数字越大优先级越高（3+→P0，1→P2，
// null/<=0→P3）；未关联任务的会话排最后（仅按更新时间逆序）。
const taskPriorityBySession = ref<Map<string, number>>(new Map())
const kanban = useIdeKanbanOverview()
const kanbanActiveEntries = kanban.activeEntries
const kanbanText = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].kanbanBoard)
const kanbanOpen = ref(true)
const kanbanTasks = computed(() =>
  [...kanban.activeEntries.value]
    .sort((a, b) =>
      (b.task.priority ?? 0) - (a.task.priority ?? 0)
      || (b.task.created_at ?? 0) - (a.task.created_at ?? 0))
    .slice(0, 8))
async function loadTaskPriorities(): Promise<void> {
  try {
    await kanban.refresh()
    const map = new Map<string, number>()
    for (const { task } of kanban.entries.value) {
      const sid = task.session_id
      if (!sid) continue
      map.set(sid, Math.max(map.get(sid) ?? 0, task.priority ?? 0))
    }
    taskPriorityBySession.value = map
  } catch { /* 看板不可达不阻塞会话列表 */ }
}
function openKanbanTask(id: string): void {
  void router.push({ path: '/ide', query: { task: id } })
}
function openKanbanBoard(): void {
  void router.push('/app/board')
}
function sessionPriority(s: Session): number | null {
  const map = taskPriorityBySession.value
  const byId = map.get(s.id)
  if (byId !== undefined) return byId
  if (s.agentSessionId) {
    const byAgent = map.get(s.agentSessionId)
    if (byAgent !== undefined) return byAgent
  }
  return null
}
/** P0-P3 徽标文案；null = 无关联任务不显示徽标 */
function sessionTier(s: Session): string | null {
  const p = sessionPriority(s)
  return p === null ? null : bucketPriority(p)
}

// ---- 搜索/过滤（常驻，workspaceSidebar.searchTasks） ----
const query = ref('')
const activeQuery = computed(() => query.value.trim().toLowerCase())
function matches(s: { title?: string | null; workspace?: string | null }): boolean {
  if (!activeQuery.value) return true
  const q = activeQuery.value
  return (
    (s.title || '').toLowerCase().includes(q) ||
    workspaceLabel(t, s.workspace).toLowerCase().includes(q)
  )
}
const visibleSessions = computed(() => chat.sessions.filter(s => matches(s)))

// ---- 已置顶 ----
const pinnedSessions = computed(() =>
  visibleSessions.value.filter(s => pinnedIds.value.includes(s.id)),
)

// ---- 组织模式三分：分组(category) / 项目(workspace) / 时间线 ----
interface TaskGroup {
  key: string
  label: string
  categoryId?: number | null
  workspace?: string
  sessions: Session[]
  /** 混排的 zcode CLI 会话（项目/时间线组织；分组模式 CLI 走独立段） */
  cli?: CliSession[]
}
const collapsedGroups = ref<Set<string>>(new Set())
// ── zcode CLI 会话（单一数据源在侧栏，组件/混排共用）──────────────────────
// 2026-10-19「组织取 zcode 信息」批：CLI 会话库的 directory 是 zcode 的权威
// 项目路径——「项目」「时间线」组织把 CLI 会话按同一维度混排；「分组」模式
// zcode 无自建分组存储，保持独立段。
const cliAll = ref<CliSession[]>([])
const cliFiltered = computed(() => filterCliSessions(cliAll.value, ide.sidebar.sessionView, activeQuery.value, Date.now()))
const cliCount = computed(() => cliFiltered.value.length)
// 用量徽（共享单例：与 IdeCliSessions/落地页同源同一次拉取）+ 混排行账单展开
const { usageOf: cliUsageOf, loadUsage: loadCliUsage } = useZcodeCliUsage()
const cliBillId = ref('')
function toggleCliBill(c: CliSession): void {
  cliBillId.value = cliBillId.value === c.id ? '' : c.id
}
function fmtCliTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}
async function loadCli(): Promise<void> {
  try { cliAll.value = (await fetchCliSessions(30)).sessions } catch { cliAll.value = [] }
  void loadCliUsage()
}
onMounted(() => { void loadCli() })
async function resumeCli(c: CliSession): Promise<void> {
  try { await launchDevtool('terminal-zcode', c.directory || undefined) }
  catch (e) { showToast((e as Error).message, 'error') }
}
async function copyCliId(c: CliSession): Promise<void> {
  try { await navigator.clipboard.writeText(c.id); showToast('会话 ID 已复制', 'info') }
  catch { showToast('剪贴板不可用——请手动复制', 'error') }
}
function cliDirShort(dir: string): string {
  const parts = dir.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || dir
}
function toggleGroup(key: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}
const unpinnedSessions = computed(() =>
  visibleSessions.value.filter(s => !pinnedIds.value.includes(s.id)),
)

// 三段视图（用户截图理念）：进行中/已完成/工作空间。
// bucket 先分桶（active=流式或 24h 内活跃；done=其余非归档；workspace 不按状态分、
// 按 workspace 分桶），桶内会话交给既有 organize 逻辑排。
const sessionViewSessions = computed<Session[]>(() => {
  const all = unpinnedSessions.value
  const view = ide.sidebar.sessionView
  if (view === 'workspace') return all // 工作空间视图展示全部，由 organize='project' 分桶
  const buckets = bucketSessions(all, Date.now())
  return view === 'active' ? buckets.active : buckets.done
})

// 各段计数（chip 角标用）
const viewCounts = computed(() => {
  const all = unpinnedSessions.value
  const buckets = bucketSessions(all, Date.now())
  return {
    active: buckets.active.length,
    done: buckets.done.length,
    // 口径=会话数（此前是工作空间数，与另两视图口径不一致——用户看到的
    // 「工作空间 1」实为 1 个工作空间而非 1 个会话）
    workspace: all.length,
  }
})

const taskGroups = computed<TaskGroup[]>(() => {
  const rest = sessionViewSessions.value
  const effectiveOrganize = ide.sidebar.sessionView === 'workspace' ? 'project' : ide.sidebar.organize
  if (effectiveOrganize === 'timeline') {
    // 2026-10-19 语义修正：时间线=时间分层（今天/近 7 天/更早），段内更新逆序。
    // 此前是「优先级+时间」平铺单列表，名叫时间线却无时间维度。
    const byUpdated = (a: Session, b: Session) => (b.updatedAt || 0) - (a.updatedAt || 0)
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    const tiers: Array<{ key: string; label: string; min: number; max: number }> = [
      { key: '__timeline_today__', label: zh.value ? '今天' : 'Today', min: 0, max: 1 * DAY },
      { key: '__timeline_week__', label: zh.value ? '近 7 天' : 'Last 7 days', min: 1 * DAY, max: 7 * DAY },
      { key: '__timeline_older__', label: zh.value ? '更早' : 'Older', min: 7 * DAY, max: Number.POSITIVE_INFINITY },
    ]
    return tiers
      .map(tier => ({
        key: tier.key,
        label: tier.label,
        sessions: rest
          .filter(s => { const age = now - (s.updatedAt || 0); return age >= tier.min && age < tier.max })
          .sort(byUpdated),
        // zcode CLI 会话同维度分层（时间口径=timeUpdated）
        cli: cliFiltered.value.filter(c => { const age = now - c.timeUpdated; return age >= tier.min && age < tier.max })
          .sort((a, b) => b.timeUpdated - a.timeUpdated),
      }))
      .filter(g => g.sessions.length > 0 || (g.cli?.length ?? 0) > 0)
  }
  if (effectiveOrganize === 'grouped') {
    const groups: TaskGroup[] = categories.value.map(c => ({
      key: `cat-${c.id}`,
      label: c.name,
      categoryId: c.id,
      sessions: rest.filter(s => s.categoryId === c.id)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    }))
    // 2026-10-19：无任何自建分类时未分组桶头给引导提示（否则看起来像分类失效）
    const hasCategories = categories.value.length > 0
    const ungrouped = rest.filter(s => !s.categoryId || !categories.value.some(c => c.id === s.categoryId))
    if (ungrouped.length) {
      groups.push({
        key: '__ungrouped__',
        label: t('ide.task.ungrouped'),
        categoryId: null,
        sessions: ungrouped.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      })
    }
    return groups
  }
  // project：按项目归类（2026-10-19 修正批）——此前按 workspace 原值分组，
  // 引擎内部目录末段（global/scoped）与空值（「默认」）被当项目展示。
  // 现走 sessionProjectOf：真实路径→目录名；内部工作区/空→「未绑项目」（置底）。
  const NO_PROJECT_KEY = '__noproject__'
  const byProject = new Map<string, { label: string; sessions: Session[] }>()
  for (const s of rest) {
    const proj = sessionProjectOf(s)
    const key = proj ?? NO_PROJECT_KEY
    const hit = byProject.get(key) ?? { label: proj ?? (zh.value ? '未绑项目' : 'No project'), sessions: [] }
    hit.sessions.push(s)
    byProject.set(key, hit)
  }
  // zcode CLI 会话按其 directory（zcode 权威项目路径）并入同名组
  const cliByProj = new Map<string, CliSession[]>()
  for (const c of cliFiltered.value) {
    const proj = cliProjectOf(c)
    const k = proj ?? NO_PROJECT_KEY
    const list = cliByProj.get(k) ?? []
    list.push(c)
    cliByProj.set(k, list)
  }
  const seen = new Set<string>()
  const groups = [...byProject.entries()]
    .map(([key, g]) => {
      seen.add(key)
      return {
        key: `proj-${key}`,
        label: g.label,
        workspace: key === NO_PROJECT_KEY ? '' : key,
        sessions: g.sessions.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        cli: (cliByProj.get(key) ?? []).sort((a, b) => b.timeUpdated - a.timeUpdated),
      }
    })
  // 只有 CLI 会话的项目（IDE 无会话）也成组——zcode 项目完整呈现
  for (const [key, list] of cliByProj) {
    if (seen.has(key) || list.length === 0) continue
    groups.push({
      key: `proj-${key}`,
      label: key === NO_PROJECT_KEY ? (zh.value ? '未绑项目' : 'No project') : key,
      workspace: key === NO_PROJECT_KEY ? '' : key,
      sessions: [],
      cli: list.slice().sort((a, b) => b.timeUpdated - a.timeUpdated),
    })
  }
  // 项目按最新会话逆序（IDE 与 CLI 取较新）；「未绑项目」恒置底
  return groups
    .sort((a, b) => {
      if (a.key === `proj-${NO_PROJECT_KEY}`) return 1
      if (b.key === `proj-${NO_PROJECT_KEY}`) return -1
      const at = Math.max(a.sessions[0]?.updatedAt || 0, a.cli?.[0]?.timeUpdated || 0)
      const bt = Math.max(b.sessions[0]?.updatedAt || 0, b.cli?.[0]?.timeUpdated || 0)
      return bt - at
    })
})

const effectiveOrganizeMode = computed(() => (ide.sidebar.sessionView === 'workspace' ? 'project' : ide.sidebar.organize))

// ---- 归档区 ----
const showDeleteAllConfirm = ref(false)
const archivedOpen = ref(false)
const archivedLoading = ref(false)
const archivedLoaded = ref(false)
const archived = ref<ArchivedSessionItem[]>([])
async function toggleArchived(): Promise<void> {
  archivedOpen.value = !archivedOpen.value
  if (archivedOpen.value && !archivedLoaded.value) await loadArchived()
}
async function loadArchived(): Promise<void> {
  archivedLoading.value = true
  try {
    archived.value = await fetchArchivedSessions({ limit: 100 })
    archivedLoaded.value = true
  } catch {
    message.error(t('ide.task.archivedLoadFailed'))
  } finally {
    archivedLoading.value = false
  }
}
const deleteAllBusy = ref(false)
async function onDeleteAllArchived(): Promise<void> {
  if (deleteAllBusy.value || !archived.value.length) return
  deleteAllBusy.value = true
  try {
    const targets = archived.value.map(a => ({ id: a.id }))
    const res = await batchDeleteSessions(targets)
    message.success(t('ide.task.deleteAllArchivedResult', { deleted: res.deleted, skipped: archived.value.length - res.deleted - res.failed, failed: res.failed }))
    archived.value = []
    await chat.loadSessions(chat.sessionProfileFilter)
  } catch {
    message.error(t('ide.task.deleteAllArchivedError'))
  } finally {
    deleteAllBusy.value = false
  }
}

// 确认框动作：成功才收起；失败保留确认框让用户重试（错误详情走 toast）。
// 成功判定 = 归档列表变短（onDeleteAllArchived 成功路径会清空 archived）。
async function confirmDeleteAllArchived(): Promise<void> {
  const before = archived.value.length
  await onDeleteAllArchived()
  if (archived.value.length < before) showDeleteAllConfirm.value = false
}

async function onUnarchive(id: string): Promise<void> {
  const ok = await unarchiveSession(id)
  if (!ok) {
    message.error(t('chat.unarchiveSessionFailed'))
    return
  }
  message.success(t('chat.sessionUnarchived'))
  archived.value = archived.value.filter(s => s.id !== id)
  await chat.loadSessions(chat.sessionProfileFilter)
}

// B11 归档批量恢复（09-19 全景 #5：cc Unarchive all 对照）：逻辑在
// utils/archive-restore.ts 纯函数（单测直连），此处只接线。
const restoreAllBusy = ref(false)
async function onRestoreAllArchived(): Promise<void> {
  if (restoreAllBusy.value || !archived.value.length) return
  restoreAllBusy.value = true
  try {
    const { okIds, failedIds } = await restoreAllArchived(archived.value.map((s) => s.id), unarchiveSession)
    if (okIds.length) archived.value = archived.value.filter((s) => !okIds.includes(s.id))
    if (failedIds.length) {
      message.error(t('ide.task.restoreAllArchivedFailed', { count: failedIds.length, defaultValue: `${failedIds.length} 条恢复失败（仍在归档列）` }))
    } else {
      message.success(t('ide.task.restoreAllArchivedOk', { defaultValue: '归档已全部恢复' }))
    }
    if (okIds.length) await chat.loadSessions(chat.sessionProfileFilter)
  } finally {
    restoreAllBusy.value = false
  }
}

// ---- 会话操作 ----
async function onOpen(id: string): Promise<void> {
  emit('open', id)
  await chat.switchSession(id)
  // 打开哪类任务，新建任务模式跟随（模型取源随会话类型，避免 Ycode 模型写到
  // Hermes 会话上误报失效）；界面模式不跟随（呈现偏好是全局的）。
  const opened = chat.sessions.find((s) => s.id === id)
  if (opened) ide.setTaskMode(sessionTaskMode(opened))
  ide.setChatFocus()
}

async function onNewTask(): Promise<void> {
  // 编程/工作双模式（2026-10-18）：编程任务走 zcode 编码会话 + 工作区；
  // 工作任务走 hermes 通用助手，不绑仓库（Qoder 通用模式 / OpenAI Work 同型）。
  const mode = ide.taskMode ?? 'coding'
  const d = mode === 'coding' ? engineDefaultFromCache() : null
  const created = chat.newChat(buildNewTaskOptions({
    mode,
    codingAgentId: ide.agentId,
    chatAgent: ideAgentToChatAgent(ide.agentId),
    workspace: root.value,
    model: d?.model,
    provider: d?.provider,
  }) as unknown as Parameters<typeof chat.newChat>[0])
  // 新建即进入会话：外壳据此收起裸落地引导（否则新任务被「从一个任务开始」挡在
  // 后面，用户要点一下「进入会话工作区」才看得见刚建的任务）。
  emit('open', created.id)
  ide.setChatFocus()
}

// ⌘N 新建任务：按钮旁的 kbd 提示此前无 handler（假快捷键）。
// 输入框聚焦时 cmd+N 不劫持（与 ⌘K 同样只在非编辑态生效的口径）。
function onTaskbarKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    void onNewTask()
  }
}
window.addEventListener('keydown', onTaskbarKeydown)
onUnmounted(() => window.removeEventListener('keydown', onTaskbarKeydown))

async function onDelete(id: string): Promise<void> {
  const ok = await chat.deleteSession(id)
  if (!ok) message.error(t('chat.deleteSessionFailed'))
}

async function onArchive(id: string): Promise<void> {
  const ok = await chat.archiveSession(id)
  if (!ok) {
    message.error(t('chat.archiveSessionFailed'))
    return
  }
  archivedLoaded.value = false
  if (archivedOpen.value) await loadArchived()
}

function onShareExport(id: string): void {
  exportSession(id, 'full', 'json').catch(() => message.error(t('ide.task.shareFailed')))
}

function sessionMenu(s: Session): DropdownOption[] {
  const moveChildren: DropdownOption[] = [
    ...categories.value.map(c => ({
      label: c.name,
      key: `move-cat-${c.id}`,
    })),
    { label: t('ide.task.ungrouped'), key: 'move-none' },
    { type: 'divider', key: 'move-div' },
    { label: t('ide.task.newGroup'), key: 'move-new-group' },
  ]
  return [
    { label: t(prefs.isPinned(s.id) ? 'chat.unpin' : 'chat.pin'), key: 'pin' },
    { label: t('ide.task.moveToGroup'), key: 'move', children: moveChildren },
    { label: t('ide.task.shareExport'), key: 'share' },
    { label: t('chat.archiveSession'), key: 'archive' },
    { label: t('chat.deleteSession'), key: 'delete' },
  ]
}
async function onSessionAction(key: string, s: Session): Promise<void> {
  if (key === 'pin') prefs.togglePinned(s.id)
  else if (key === 'share') onShareExport(s.id)
  else if (key === 'archive') await onArchive(s.id)
  else if (key === 'delete') await onDelete(s.id)
  else if (key === 'move-none') await moveToGroup(s.id, null)
  else if (key === 'move-new-group') newGroupDraft.value = ''
  else if (key.startsWith('move-cat-')) await moveToGroup(s.id, Number(key.slice('move-cat-'.length)))
}

function onSearchClick(): void {
  ide.openPalette()
}

function onAutomationsClick(): void {
  router.push({ name: 'hermes.jobs' })
}

onMounted(async () => {
  if (!chat.sessionsLoaded) await chat.loadSessions(chat.sessionProfileFilter)
  await loadCategories()
  void loadTaskPriorities()
})
</script>

<template>
  <aside class="ide-taskbar" :aria-label="t('ide.task.sectionLabel')">
    <!-- 编程/工作双模式：决定「新建任务」创建哪种内核（编程=编码引擎+工作区；
         工作=通用助手，不绑仓库）。呈现层差异见 ide.interfaceMode。 -->
    <div class="ide-taskbar__modes" role="group" :aria-label="modeText.desc">
      <button
        type="button"
        class="ide-taskbar__mode-btn"
        :class="{ 'is-active': (ide.taskMode ?? 'coding') === 'coding' }"
        :title="modeText.newCodingHint"
        data-testid="ide-task-mode-coding"
        @click="ide.setTaskMode('coding')"
      >{{ modeText.newCoding }}</button>
      <button
        type="button"
        class="ide-taskbar__mode-btn"
        :class="{ 'is-active': ide.taskMode === 'work' }"
        :title="modeText.newWorkHint"
        data-testid="ide-task-mode-work"
        @click="ide.setTaskMode('work')"
      >{{ modeText.newWork }}</button>
    </div>
    <div class="ide-taskbar__actions">
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-new" @click="onNewTask">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
          {{ t('ide.task.new') }}
        </span>
        <kbd class="ide-taskbar__kbd">⌘N</kbd>
      </button>
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-search" @mousedown.prevent @click="onSearchClick">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          {{ t('ide.task.search') }}
        </span>
        <kbd class="ide-taskbar__kbd">⌘K</kbd>
      </button>
      <button type="button" class="ide-taskbar__action" data-testid="ide-task-automations" @click="onAutomationsClick">
        <span class="ide-taskbar__action-label">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M8 14h8" /></svg>
          {{ t('ide.task.automations') }}
        </span>
      </button>
    </div>

    <!-- 任务视图（查看文件已右移 IdeSidePane files 页签，09-20 裁定） -->
    <div class="ide-taskbar__body">
      <div v-if="newGroupDraft !== null" class="ide-taskbar__newgroup">
        <input
          v-model="newGroupDraft"
          class="ide-taskbar__newgroup-input"
          type="text"
          :placeholder="t('ide.task.newGroupName')"
          :aria-label="t('ide.task.newGroupName')"
          data-testid="ide-task-newgroup-input"
          @keydown.enter.prevent="createGroup"
          @keydown.esc.prevent="newGroupDraft = null"
        >
        <button type="button" class="ide-taskbar__newgroup-ok" :aria-label="t('common.ok')" @click="createGroup">✓</button>
      </div>

      <div class="ide-taskbar__filter">
        <input
          v-model="query"
          class="ide-taskbar__filter-input"
          type="text"
          :placeholder="t('ide.task.searchPlaceholder')"
          :aria-label="t('ide.task.search')"
          data-testid="ide-task-filter"
        >
      </div>

      <div class="ide-taskbar__views" role="group" :aria-label="t('ide.task.views')">
        <!-- 2026-10-19 视图语义修正：文案走本地 VIEW_TEXT（done 桶口径=超 24h
             无活动而非完成，词表「已完成」名不副实）；title 写明口径。 -->
        <button
          v-for="vk in (['active', 'done', 'workspace'] as const)"
          :key="vk"
          type="button"
          class="ide-taskbar__view"
          :class="{ 'is-active': ide.sidebar.sessionView === vk }"
          :data-testid="`ide-task-view-${vk}`"
          :title="VIEW_TEXT[vk].hint"
          @click="ide.setSessionView(vk)"
        >{{ zh ? VIEW_TEXT[vk].zh : VIEW_TEXT[vk].en }} <span class="ide-taskbar__view-count">{{ viewCounts[vk] }}</span></button>
      </div>

      <div v-if="ide.sidebar.sessionView !== 'workspace'" class="ide-taskbar__organize" role="group" :aria-label="t('ide.task.organize')">
        <button
          type="button"
          class="ide-taskbar__chip"
          :class="{ 'is-active': ide.sidebar.organize === 'grouped' }"
          data-testid="ide-task-organize-grouped"
          @click="ide.setOrganize('grouped')"
        ># {{ t('ide.task.organize_grouped') }}</button>
        <button
          type="button"
          class="ide-taskbar__chip"
          :class="{ 'is-active': ide.sidebar.organize === 'project' }"
          data-testid="ide-task-organize-project"
          @click="ide.setOrganize('project')"
        >📁 {{ t('ide.task.organize_project') }}</button>
        <button
          type="button"
          class="ide-taskbar__chip"
          :class="{ 'is-active': ide.sidebar.organize === 'timeline' }"
          data-testid="ide-task-organize-timeline"
          @click="ide.setOrganize('timeline')"
        >{{ t('ide.task.organize_timeline') }}</button>
      </div>

      <div class="ide-taskbar__scroll">
        <section v-if="kanbanTasks.length" class="ide-taskbar__section" data-testid="ide-task-kanban">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="kanbanOpen = !kanbanOpen">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': !kanbanOpen }">▾</span>
            <span class="ide-taskbar__section-title">{{ kanbanText.section }}</span>
            <span class="ide-taskbar__section-count">{{ kanbanActiveEntries.length }}</span>
          </header>
          <template v-if="kanbanOpen">
            <ul class="ide-taskbar__list">
              <li
                v-for="entry in kanbanTasks"
                :key="entry.task.id"
                class="ide-taskbar__item"
                :data-testid="`ide-task-kanban-item-${entry.task.id}`"
              >
                <button
                  type="button"
                  class="ide-taskbar__item-main"
                  :title="`${entry.task.title} · ${entry.board}`"
                  @click="openKanbanTask(entry.task.id)"
                >
                  <span class="ide-taskbar__kanban-row">
                    <span class="ide-taskbar__kanban-title">{{ entry.task.title }}</span>
                    <span class="ide-taskbar__kanban-meta">{{ entry.board }} · {{ entry.task.status }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <button type="button" class="ide-taskbar__kanban-more" data-testid="ide-task-kanban-open-board" @click="openKanbanBoard">
              {{ kanbanText.open }} →
            </button>
          </template>
        </section>

        <section v-if="pinnedSessions.length" class="ide-taskbar__section" data-testid="ide-task-pinned">
          <header class="ide-taskbar__section-head">{{ t('ide.task.pinned') }}</header>
          <ul class="ide-taskbar__list">
            <li
              v-for="s in pinnedSessions"
              :key="s.id"
              class="ide-taskbar__item"
              :class="{ 'is-active': s.id === chat.activeSessionId }"
              :data-testid="`ide-task-item-${s.id}`"
            >
              <button type="button" class="ide-taskbar__item-main" @click="onOpen(s.id)">
                <span
                  class="ide-taskbar__mode-badge"
                  :class="`is-${sessionTaskMode(s)}`"
                  :data-testid="`ide-task-mode-badge-${s.id}`"
                  :title="sessionTaskMode(s) === 'work' ? modeText.newWork : modeText.newCoding"
                >{{ taskModeBadge(s) }}</span>
                <span class="ide-taskbar__item-title">{{ s.title || t('ide.chatUntitled') }}</span>
                <span class="ide-taskbar__item-time">{{ formatRelativeTime(t, s.updatedAt || s.createdAt) }}</span>
              </button>
              <NDropdown trigger="click" :options="sessionMenu(s)" @select="(k: string) => onSessionAction(k, s)">
                <button type="button" class="ide-taskbar__item-more" :aria-label="t('ide.task.more')" @click.stop>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                </button>
              </NDropdown>
            </li>
          </ul>
        </section>

        <section
          v-for="g in taskGroups"
          :key="g.key"
          class="ide-taskbar__section"
          :data-testid="`ide-task-group-${g.label}`"
        >
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleGroup(g.key)">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': collapsedGroups.has(g.key) }">▾</span>
            <template v-if="renameDraft !== null && renameDraft.id === g.categoryId">
              <input
                v-model="renameDraft.name"
                class="ide-taskbar__rename-input"
                :data-testid="`ide-task-rename-${g.categoryId}`"
                @click.stop
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="renameDraft = null; loadCategories()"
              >
            </template>
            <template v-else>
              <span class="ide-taskbar__section-title">{{ g.label }}</span>
              <span v-if="g.categoryId != null" class="ide-taskbar__group-actions" @click.stop>
                <button type="button" class="ide-taskbar__group-btn" :title="t('ide.task.renameGroup')" :aria-label="t('ide.task.renameGroup')" @click="renameDraft = { id: g.categoryId!, name: g.label }">✎</button>
                <button type="button" class="ide-taskbar__group-btn ide-taskbar__group-btn--danger" :title="t('ide.task.deleteGroup')" :aria-label="t('ide.task.deleteGroup')" @click="removeGroup(g.categoryId!)">✕</button>
              </span>
              <span class="ide-taskbar__section-count">{{ g.sessions.length }}</span>
            </template>
          </header>
          <!-- 2026-10-19：无自建分类时未分组桶给创建引导（否则像分类失效） -->
          <p
            v-if="g.key === '__ungrouped__' && categories.length === 0 && g.sessions.length"
            class="ide-taskbar__group-hint"
            data-testid="ide-task-ungrouped-hint"
          >{{ zh ? '还没有自建分组：任务菜单「移动到分组 → 新建分组」可创建' : 'No custom groups yet: create one via task menu “Move to group”' }}</p>
          <ul v-show="!collapsedGroups.has(g.key)" class="ide-taskbar__list">
            <li
              v-for="s in g.sessions"
              :key="s.id"
              class="ide-taskbar__item"
              :class="{ 'is-active': s.id === chat.activeSessionId }"
              :data-testid="`ide-task-item-${s.id}`"
            >
              <button type="button" class="ide-taskbar__item-main" @click="onOpen(s.id)">
                <span
                  v-if="ide.sidebar.organize === 'timeline' && sessionTier(s)"
                  class="ide-taskbar__prio"
                  :class="`ide-taskbar__prio--${(sessionTier(s) || '').toLowerCase()}`"
                  :data-testid="`ide-task-prio-${sessionTier(s)}`"
                >{{ sessionTier(s) }}</span>
                <span
                  class="ide-taskbar__mode-badge"
                  :class="`is-${sessionTaskMode(s)}`"
                  :data-testid="`ide-task-mode-badge-${s.id}`"
                  :title="sessionTaskMode(s) === 'work' ? modeText.newWork : modeText.newCoding"
                >{{ taskModeBadge(s) }}</span>
                <span class="ide-taskbar__item-title">{{ s.title || t('ide.chatUntitled') }}</span>
                <span class="ide-taskbar__item-time">{{ formatRelativeTime(t, s.updatedAt || s.createdAt) }}</span>
              </button>
              <NDropdown trigger="click" :options="sessionMenu(s)" @select="(k: string) => onSessionAction(k, s)">
                <button type="button" class="ide-taskbar__item-more" :aria-label="t('ide.task.more')" @click.stop>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                </button>
              </NDropdown>
            </li>
            <!-- zcode CLI 会话混排（项目/时间线组织取 zcode directory/时间）：
                 行=徽标+标题+工作区+终端继续；与 IDE 会话同组同维度。 -->
            <li
              v-for="c in g.cli ?? []"
              :key="`cli-${c.id}`"
              class="ide-taskbar__item ide-taskbar__item--cli"
              :class="{ 'ide-taskbar__item--bill-open': cliBillId === c.id }"
              :data-testid="`ide-task-cli-${c.id}`"
            >
              <div class="ide-taskbar__clirow">
                <button type="button" class="ide-taskbar__item-main" :title="`${c.title} · ${c.directory}`" @click="resumeCli(c)">
                  <span class="ide-taskbar__mode-badge is-cli" title="zcode CLI 会话（终端）">zcode</span>
                  <span class="ide-taskbar__item-title">{{ c.title }}</span>
                  <span class="ide-taskbar__item-time">{{ c.directory ? cliDirShort(c.directory) : '' }}</span>
                  <span
                    v-if="cliUsageOf(c.id)"
                    class="ide-taskbar__cli-usage"
                    :title="`轮 ${cliUsageOf(c.id)!.turns}（错 ${cliUsageOf(c.id)!.turnErrors}）· 模型调用 ${cliUsageOf(c.id)!.modelCalls} · 工具 ${cliUsageOf(c.id)!.toolCalls} · 计费 ${fmtCliTokens(cliUsageOf(c.id)!.billedTokens)} token`"
                  >· {{ cliUsageOf(c.id)!.turns }} 轮 · {{ fmtCliTokens(cliUsageOf(c.id)!.billedTokens) }} tok</span>
                </button>
                <button
                  v-if="cliUsageOf(c.id)"
                  type="button"
                  class="ide-taskbar__group-btn"
                  :class="{ 'is-on': cliBillId === c.id }"
                  :data-testid="`ide-cli-bill-${c.id}`"
                  title="展开逐轮用量、上下文趋势/构成与工具时间线（本机 zcode 用量库）"
                  @click.stop="toggleCliBill(c)"
                >账</button>
                <button type="button" class="ide-taskbar__group-btn" :title="`复制会话 ID：${c.id}`" @click="copyCliId(c)">⧉</button>
              </div>
              <IdeCliSessionBill v-if="cliBillId === c.id" :session-id="c.id" />
            </li>
          </ul>
        </section>

        <!-- 分组模式下 zcode 无自建分组存储 → CLI 保持独立段；项目/时间线模式已混排进组 -->
        <section v-if="effectiveOrganizeMode === 'grouped'" class="ide-taskbar__section" data-testid="ide-task-zcode-cli">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleGroup('zcode-cli')">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': collapsedGroups.has('zcode-cli') }">▾</span>
            <span class="ide-taskbar__section-title">zcode CLI 会话</span>
            <span v-if="cliCount" class="ide-taskbar__section-count">{{ cliCount }}</span>
          </header>
          <div v-show="!collapsedGroups.has('zcode-cli')" class="ide-taskbar__cli-body">
            <IdeCliSessions :boxed="false" :view="ide.sidebar.sessionView" :query="activeQuery" :sessions="cliFiltered" />
          </div>
        </section>

        <section class="ide-taskbar__section" data-testid="ide-task-archived">
          <header class="ide-taskbar__section-head ide-taskbar__section-head--toggle" @click="toggleArchived">
            <span class="ide-taskbar__section-caret" :class="{ 'is-collapsed': !archivedOpen }">▾</span>
            <span class="ide-taskbar__section-title">{{ t('ide.task.archived') }}</span>
            <span v-if="archived.length" class="ide-taskbar__archived-count">{{ t('ide.task.archivedTaskCount', { count: archived.length }) }}</span>
            <button
              v-if="archived.length"
              type="button"
              class="ide-taskbar__group-btn"
              :disabled="restoreAllBusy"
              data-testid="ide-task-restore-all-archived"
              :title="t('ide.task.restoreAllArchived', '全部恢复')"
              @click.stop="onRestoreAllArchived"
            >⇪</button>
            <button
              v-if="archived.length"
              type="button"
              class="ide-taskbar__group-btn ide-taskbar__group-btn--danger"
              :disabled="deleteAllBusy"
              data-testid="ide-task-delete-all-archived"
              :title="t('ide.task.deleteAllArchivedMenu')"
              @click.stop="showDeleteAllConfirm = true"
            >🗑</button>
          </header>
          <div v-if="showDeleteAllConfirm" class="ide-taskbar__confirm" data-testid="ide-task-delete-all-confirm">
            <p>{{ t('ide.task.deleteAllArchivedTitle', { count: archived.length }) }}</p>
            <div class="ide-taskbar__confirm-actions">
              <button type="button" class="ide-taskbar__group-btn ide-taskbar__group-btn--danger" :disabled="deleteAllBusy" data-testid="ide-task-delete-all-ok" @click="confirmDeleteAllArchived">{{ t('ide.task.deleteAllArchivedMenu') }}</button>
              <button type="button" class="ide-taskbar__group-btn" @click="showDeleteAllConfirm = false">{{ t('common.cancel') }}</button>
            </div>
          </div>
          <div v-if="archivedOpen" class="ide-taskbar__archived-body">
            <p v-if="archivedLoading" class="ide-taskbar__hint">{{ t('ide.task.archivedLoading') }}</p>
            <p v-else-if="archivedLoaded && !archived.length" class="ide-taskbar__hint">{{ t('ide.task.archivedEmpty') }}</p>
            <ul v-else class="ide-taskbar__list">
              <li v-for="s in archived" :key="s.id" class="ide-taskbar__item" :data-testid="`ide-task-archived-${s.id}`">
                <button type="button" class="ide-taskbar__item-main" @click="onUnarchive(s.id)">
                  <span class="ide-taskbar__item-title">{{ s.title || t('ide.chatUntitled') }}</span>
                  <span class="ide-taskbar__item-time">{{ formatRelativeTime(t, s.last_active) }}</span>
                </button>
                <NTooltip trigger="hover">
                  <template #trigger>
                    <button type="button" class="ide-taskbar__item-more" :aria-label="t('chat.unarchiveSession')" @click.stop="onUnarchive(s.id)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h13M13 4l4 4-4 4M21 12v6a2 2 0 0 1-2 2H7" /></svg>
                    </button>
                  </template>
                  {{ t('chat.unarchiveSession') }}
                </NTooltip>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

  </aside>
</template>

<style scoped lang="scss">
.ide-taskbar {
  /* 跟随 IdeShell 侧栏拖拽宽度：曾固定 270px——aside 拖动改变不了可见面板，
   * 左分割条「拖了不动」根因（2026-09-22）。列 flex 交叉轴默认拉伸，此处显式 100%。 */
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  min-height: 0;
}

/* 编程/工作任务双按钮：决定新建任务的内核（不是界面模式开关） */
.ide-taskbar__modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 8px 8px 0;
}
.ide-taskbar__mode-btn {
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.ide-taskbar__mode-btn:hover { color: var(--text-primary); border-color: var(--primary-color); }
.ide-taskbar__mode-btn.is-active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  font-weight: 600;
}

.ide-taskbar__actions {
  padding: 8px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ide-taskbar__action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover { background: var(--bg-tertiary); }
}

.ide-taskbar__action-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
}

.ide-taskbar__kbd {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: inherit;
}

.ide-taskbar__newgroup {
  display: flex;
  gap: 4px;
  padding: 4px 8px 2px;
}

.ide-taskbar__newgroup-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--accent-primary);
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.ide-taskbar__newgroup-ok {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--accent-primary);
  cursor: pointer;

  &:hover { background: color-mix(in srgb, var(--accent-primary) 20%, transparent); }
}

.ide-taskbar__filter { padding: 4px 8px 4px; }

.ide-taskbar__filter-input {
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;

  &::placeholder { color: var(--text-muted); }
  &:focus { border-color: var(--accent-primary); }
}

/* 三段视图 chip 行（进行中/已完成/工作空间） */
.ide-taskbar__views {
  display: flex;
  gap: 4px;
  padding: 6px 10px 0;
}

.ide-taskbar__view {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border-color);
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;

  &:hover { border-color: var(--primary-color); }

  &.is-active {
    background: rgba(97, 175, 239, 0.12);
    border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
    color: var(--primary-color);
    font-weight: 600;
  }
}

.ide-taskbar__view-count {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.ide-taskbar__organize {
  display: flex;
  gap: 2px;
  padding: 0 8px 4px;
}

.ide-taskbar__chip {
  flex: 1;
  height: 24px;
  border: none;
  border-radius: 12px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;

  &:hover { color: var(--text-primary); }
  &.is-active {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--accent-primary) 22%, var(--bg-tertiary));
  }
}

.ide-taskbar__scroll { flex: 1 1 0; height: 0; overflow-y: auto; min-height: 0; padding: 0 4px 8px; }
.ide-taskbar__body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }

.ide-taskbar__section { margin-top: 6px; }

.ide-taskbar__section-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: none;
  letter-spacing: 0.02em;

  &--toggle { cursor: pointer; user-select: none; &:hover { color: var(--text-primary); } }
}

.ide-taskbar__section-caret {
  font-size: 9px;
  transition: transform 0.12s ease;
  &.is-collapsed { transform: rotate(-90deg); }
}

.ide-taskbar__kanban-row { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ide-taskbar__kanban-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-taskbar__kanban-meta { font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-taskbar__kanban-more { display: block; width: 100%; border: 0; background: transparent; color: var(--accent-primary); font-size: 11px; text-align: left; padding: 3px 8px 5px; cursor: pointer; }

.ide-taskbar__rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 11px;
  outline: none;
}

.ide-taskbar__group-actions {
  display: inline-flex;
  gap: 2px;
  margin-left: auto;
}

.ide-taskbar__group-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;

  &:hover { color: var(--text-primary); background: var(--bg-tertiary); }
  &--danger:hover { color: var(--error-color); }
}

.ide-taskbar__section-count { margin-left: auto; opacity: 0.7; }

.ide-taskbar__list { list-style: none; margin: 0; padding: 0; }

.ide-taskbar__item {
  display: flex;
  align-items: center;
  border-radius: 6px;
  margin: 1px 0;

  &:hover { background: var(--bg-tertiary); .ide-taskbar__item-more { opacity: 1; } }
  &.is-active {
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    .ide-taskbar__item-title { color: var(--accent-primary); }
  }
}

.ide-taskbar__item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.ide-taskbar__item-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 任务模式徽标：编程=蓝、工作=绿（与状态栏 chip 同色系） */
.ide-taskbar__mode-badge {
  flex-shrink: 0;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 16px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}
.ide-taskbar__mode-badge.is-coding { color: var(--primary-color); border-color: color-mix(in srgb, var(--primary-color) 45%, transparent); }
.ide-taskbar__mode-badge.is-work { color: var(--success-color); border-color: color-mix(in srgb, var(--success-color) 45%, transparent); }

.ide-taskbar__item-time { flex-shrink: 0; font-size: 11px; color: var(--text-muted); }

/* 时间线优先级徽标（P0-P3，口径同 cockpit bucketPriority） */
.ide-taskbar__prio {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  background: color-mix(in srgb, var(--text-muted) 18%, transparent);
  color: var(--text-muted);

  &--p0 { background: rgba(224, 108, 117, 0.18); color: var(--error-color); }
  &--p1 { background: rgba(240, 164, 76, 0.18); color: var(--ia-stale); }
  &--p2 { background: rgba(76, 201, 240, 0.16); color: var(--accent-info); }
}

.ide-taskbar__item-more {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s ease;

  &:hover { color: var(--text-primary); background: var(--bg-primary); }
  svg { width: 14px; height: 14px; fill: currentColor; stroke: none; }
}

.ide-taskbar__archived-count {
  margin-left: auto;
  opacity: 0.7;
}

.ide-taskbar__confirm {
  margin: 4px 8px;
  padding: 8px 10px;
  border: 1px solid rgba(224, 108, 117, 0.5);
  border-radius: 7px;
  background: var(--bg-secondary);

  p { margin: 0 0 6px; font-size: 12px; color: var(--text-primary); }
}

.ide-taskbar__confirm-actions { display: flex; gap: 6px; }

.ide-taskbar__archived-body { padding-bottom: 4px; max-height: 320px; overflow-y: auto; }
.ide-taskbar__group-hint { margin: 2px 4px 6px; font-size: 10.5px; color: var(--text-muted); }
.ide-taskbar__item--cli .ide-taskbar__mode-badge.is-cli {
  color: var(--accent-info, #3b82f6); border: 1px solid var(--accent-info, #3b82f6); border-radius: 6px;
  font-size: 9px; padding: 0 4px; flex-shrink: 0;
}
/* 账单展开时行变列容器（行内容包 .ide-taskbar__clirow，账单体占满宽） */
.ide-taskbar__item--cli { display: flex; }
.ide-taskbar__item--bill-open { flex-direction: column; align-items: stretch; }
.ide-taskbar__clirow { display: flex; align-items: center; min-width: 0; }
.ide-taskbar__cli-usage {
  font-size: 9.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums;
  flex-shrink: 0; margin-left: 2px;
}
.ide-taskbar__group-btn.is-on { color: var(--accent-info, #3b82f6); border-color: var(--accent-info, #3b82f6); }
/* zcode CLI 分组体：内滚上限——侧栏无滚动容器（overflow visible），12 行全展
   会画穿侧栏底、被状态栏背景遮住（2026-10-19 左下角遮罩走查实锚：
   cliSec.bottom=1204 vs sidebar.bottom=871）。上限 ≈7 行，其余组内滚动。 */
.ide-taskbar__cli-body {
  padding: 0 4px 6px;
  max-height: 208px;
  overflow-y: auto;
}

.ide-taskbar__hint { margin: 4px 12px; font-size: 12px; color: var(--text-muted); }







</style>
