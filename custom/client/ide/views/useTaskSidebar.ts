// 文件职责：IdeTaskSidebar 的脚本逻辑（分组/搜索/归档/CLI 混排/会话动作）。
// 拆分纪律：纯移动，无行为变更；defineEmits 留在 SFC 并以参数传入。
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
import { useMessage, type DropdownOption } from 'naive-ui'
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
import { bucketPriority } from '@/custom/shared/adapters/task-adapter'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { useIdeKanbanOverview } from '../composables/useIdeKanbanOverview'
import { useIdeStore, ideAgentToChatAgent } from '../store/ide'
import IdeWorkitemPanorama from '../components/IdeWorkitemPanorama.vue'
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

export function useTaskSidebar(emit: (event: 'open', id: string) => void) {
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
  // emit 由 SFC 传入（defineEmits 只能在 <script setup> 顶层）
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
  // 工作项全景串联（JoyAI 闭环吸收轮 P4）：行内展开，同屏只开一张（再点收起）
  const panoTaskId = ref('')
  function togglePano(id: string): void {
    panoTaskId.value = panoTaskId.value === id ? '' : id
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

  return {
    VIEW_TEXT, zh, chat, ide, modeText, taskModeBadge, categories, newGroupDraft, loadCategories, createGroup, renameDraft, commitRename, removeGroup, kanban, kanbanActiveEntries, kanbanText, kanbanOpen, kanbanTasks, openKanbanTask, openKanbanBoard, panoTaskId, togglePano, sessionTier, query, activeQuery, pinnedSessions, collapsedGroups, cliFiltered, cliCount, cliBillId, toggleCliBill, fmtCliTokens, resumeCli, copyCliId, cliDirShort, toggleGroup, viewCounts, taskGroups, effectiveOrganizeMode, showDeleteAllConfirm, archivedOpen, archivedLoading, archivedLoaded, archived, toggleArchived, deleteAllBusy, confirmDeleteAllArchived, onUnarchive, restoreAllBusy, onRestoreAllArchived, onOpen, onNewTask, sessionMenu, onSessionAction, onSearchClick, onAutomationsClick
  }
}
