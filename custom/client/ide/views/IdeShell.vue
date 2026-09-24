<script setup lang="ts">
// IdeShell — IDE 工作台主页面壳（/ide，fullscreen 自带壳）。
//
// 布局（ZCode 3.12.3 对齐，09-18 用户裁定 A 案富侧栏，取代 9780cfe 收敛裁决）：
//   IdeTaskSidebar（富侧栏：新建/搜索/置顶/workspace 分组/归档区 + 底部驾驶舱入口）
//   | 会话列（IdeChatPane）| 右辅助面板（IdeSidePane，终端在其页签）
// 加 IdeStatusBar；顶区 = 共享 IaGlobalTop（页头+注意力条，与沟通协作一致，
// 09-20 裁定移除自有 IdeTopBar：⌘K/命令面板与功能导航入口都在命令面板）；
// RunTrace 弹窗复用 cockpit 组件（经 cockpitStore.openRunTrace 打开，store
// 惰性创建无重初始化成本）。
//
// 纪律：不嵌入 ChatPanel 整面板（自带会话侧栏，嵌套导航）；消息面
// 经 IdeChatPane 复用其子组件（MessageList/ChatInput/SubagentStreamPanel）。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useIdeStore } from '../store/ide'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useChatStore } from '@/stores/hermes/chat'
import { readColWidths, updateColWidth, onColWidthsChange } from '@/custom/ia2/utils/colWidths'
import IaGlobalTop from '@/custom/ia2/components/IaGlobalTop.vue'
import IaColumnControls from '@/custom/ia2/components/IaColumnControls.vue'
import { openPanelWindow } from '@/custom/ia2/wm/popout'
import IdeTaskSidebar from './IdeTaskSidebar.vue'
import IdeChatPane from './IdeChatPane.vue'
import IdeSidePane from './IdeSidePane.vue'
import IdeStatusBar from './IdeStatusBar.vue'
import IdeCommandPalette from '../components/IdeCommandPalette.vue'
import IdeTaskContextBar from '../components/IdeTaskContextBar.vue'
import TaskBriefingPanel from '../components/TaskBriefingPanel.vue'
import { buildAuxMessage, parseRaciFromTask } from '../components/briefing-types'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { listBoards, listTasks } from '@/api/hermes/kanban'
import { request } from '@/api/client'
import { ideGitApi } from '../api/git'

const { t } = useI18n()
const route = useRoute()
const ide = useIdeStore()
const cockpitStore = useCockpitStore()
const chatStore = useChatStore()
const kanbanStore = useKanbanStore()

// ── v12 任务维度深链（/ide?task=<id>，工作台 ⌨ / 管理台 ⌨ 入口）──
// 绑定任务维度并尽力切到任务挂靠的 agent 会话（session_id 命中即 switch）。
watch(() => route.query.task, (taskId) => {
  const id = typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null
  ide.setActiveTask(id)
  if (id) ide.setDimension('task')
}, { immediate: true })

// 深链绑定后跨板解析任务（aipaydev 推演 ide-briefing-cross-board-empty 立项）：
// kanbanStore.tasks 只装当前选中板，agent 自建板（如 aipay-rfd）的任务会解析
// 失败致简报抽屉空态。这里主动逐板查询（当前板缓存优先，一次深链最多 +N 次
// 只读请求），命中后回填并把选中板切过去（简报后续数据均走正确板）。
// resolveBriefingCrossBoard 同时供深链 watch（eager）与简报抽屉打开时兜底重试。
const briefingTaskResolved = ref<null | {
  id: string; title: string; status: string
  priority?: number; assignee?: string | null; body?: string | null; workspacePath?: string | null; raci?: Record<string, string[]> | null
}>(null)
async function resolveBriefingCrossBoard(id: string): Promise<void> {
  const inStore = (kanbanStore.tasks ?? []).find((task: { id: string; session_id?: string | null }) => task.id === id || task.session_id === id)
  if (inStore) {
    briefingTaskResolved.value = inStore as typeof briefingTaskResolved.value
    return
  }
  try {
    const boards = (await listBoards()).map(b => b.slug).filter(Boolean) as string[]
    const order = [kanbanStore.selectedBoard ?? 'default', ...boards.filter(b => b !== kanbanStore.selectedBoard)]
    for (const slug of [...new Set(order)]) {
      const hit = (await listTasks({ board: slug }).catch(() => []))
        .find(task => task.id === id || task.session_id === id)
      if (hit) {
        // stale 守卫：逐板请求期间深链又切了任务，旧结果不回填
        if (ide.activeTaskId !== id) return
        kanbanStore.setBoard(slug)
        briefingTaskResolved.value = {
          id: hit.id, title: hit.title, status: hit.status,
          priority: typeof hit.priority === 'number' ? hit.priority : undefined,
          assignee: (hit as { assignee?: string | null }).assignee ?? null,
          body: hit.body ?? null,
          raci: (hit as { raci?: Record<string, string[]> | null }).raci ?? null,
          workspacePath: (hit as { workspace_path?: string | null }).workspace_path ?? null,
        }
        return
      }
    }
  } catch { /* 解析失败保持空态，简报组件显示"当前无激活任务" */ }
}
watch(() => ide.activeTaskId, async (id) => {
  briefingTaskResolved.value = null
  if (id) await resolveBriefingCrossBoard(id)
}, { immediate: true })
const briefingTask = computed(() => {
  if (briefingTaskResolved.value) return briefingTaskResolved.value
  const id = ide.activeTaskId
  if (!id) return null
  const hit = (kanbanStore.tasks ?? []).find((task: { id: string; session_id?: string | null }) => task.id === id || task.session_id === id)
  if (!hit) return null
  return {
    id: hit.id,
    title: hit.title,
    status: hit.status,
    priority: typeof hit.priority === 'number' ? hit.priority : undefined,
    assignee: (hit as { assignee?: string | null }).assignee ?? null,
    body: hit.body ?? null,
    raci: (hit as { raci?: Record<string, string[]> | null }).raci ?? null,
    workspacePath: (hit as { workspace_path?: string | null }).workspace_path ?? null,
  }
})

onMounted(() => {
  const id = ide.activeTaskId
  if (id) {
    const hit = (chatStore.sessions ?? []).find(s => s.id === id || s.agentSessionId === id)
    if (hit) chatStore.switchSession?.(hit.id)
  }
})

// 命令面板快捷键：Cmd/Ctrl+K 开关（对标 zcode quickPick；终端面板聚焦时
// xterm 可能吞键，面板入口在 TopBar 同步提供）。
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ide.togglePalette()
  }
}
window.addEventListener('keydown', onGlobalKeydown)
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

// ── 三栏折叠/最大化（v12.4 用户裁定：栏控迁各栏顶部控制条右上角）──
type PaneKey = 'sidebar' | 'chat' | 'sidepane'
const anyMax = computed(() => (['sidebar', 'chat', 'sidepane'] as PaneKey[]).some(k => ide.layout[k].maximized))
const sidebarShown = computed(() => !anyMax.value || ide.layout.sidebar.maximized)
const chatShown = computed(() => !anyMax.value || ide.layout.chat.maximized)
const sidepaneShown = computed(() => ide.layout.sidepane.maximized || (ide.sidePane.open && !anyMax.value))
const mainClass = computed(() => ({
  'has-max-sidebar': ide.layout.sidebar.maximized,
  'has-max-chat': ide.layout.chat.maximized,
  'has-max-sidepane': ide.layout.sidepane.maximized,
}))

// 左栏宽度样式（sidebarWidth 拖拽持久化）
const sidebarWidthStyle = computed(() => ide.layout.sidebarWidth ? { width: `${ide.layout.sidebarWidth}px`, flex: '0 0 auto' } : {})
// 右辅助面板宽度样式（sidePane.width 拖拽持久化，走 sidePane 独立 ref）
const sidepaneWidthStyle = computed(() => ide.sidePane.width ? { width: `${ide.sidePane.width}px`, flex: '0 0 auto' } : {})

// ── R6 补充：三栏宽度拖拽 + 同步联动（colWidths 单一事实源，协作沟通 ↔ IDE
// 工作台共享同一套宽度；拖任一边另一边跟随）──
const unsubscribeCols = onColWidthsChange((w) => {
  ide.layout.sidebarWidth = w.left
  ide.sidePane.width = w.right
})
onUnmounted(unsubscribeCols)
// 初次挂载：若 layout/sidePane 与共享源不一致（历史值），以共享源为准回填
{
  const shared = readColWidths()
  if (ide.layout.sidebarWidth !== shared.left) ide.layout.sidebarWidth = shared.left
  if (ide.sidePane.width !== shared.right) ide.sidePane.width = shared.right
}

let ideDragCol: 'sidebar' | 'sidepane' | null = null
let ideDragStartX = 0
let ideDragStartW = 0
function startIdeDrag(col: 'sidebar' | 'sidepane', e: MouseEvent): void {
  ideDragCol = col
  ideDragStartX = e.clientX
  ideDragStartW = col === 'sidebar'
    ? ide.layout.sidebarWidth
    : ide.sidePane.width
  window.addEventListener('mousemove', onIdeDrag)
  window.addEventListener('mouseup', endIdeDrag, { once: true })
  e.preventDefault()
}
function onIdeDrag(e: MouseEvent): void {
  if (!ideDragCol) return
  const delta = e.clientX - ideDragStartX
  const w = Math.round(ideDragCol === 'sidebar' ? ideDragStartW + delta : ideDragStartW - delta)
  // 实时写共享源（广播同步到另一边；mouseup 即最终值）
  // 共享源侧名是 left/right：sidebar→left、sidepane→right（错配会被 writeColWidths
  // 的 {left,right} 摘键静默丢弃，拖了不生效——曾真实发生）
  updateColWidth(ideDragCol === 'sidebar' ? 'left' : 'right', w)
}
function endIdeDrag(): void {
  window.removeEventListener('mousemove', onIdeDrag)
  ideDragCol = null
}

/** 会话栏独立窗口：弹出当前 /ide 路由（standalone=1；合入在独立窗内） */
function onChatPopout(): void {
  void openPanelWindow({ path: route.fullPath })
}

// ── aipaydev 缺口 5：任务简报抽屉（六区块，activeTask 驱动）──
type BriefingTaskView = {
  id: string
  title: string
  status: string
  priority?: number
  body: string | null
  workspacePath: string | null
}
// RACI 块：无结构化字段时回退解析 assignee/正文行（排期卡「责任人：chen」、
// 派单式「团队负责人 @wei」），否则简报恒显 R:—·A:—（aipaydev 实证缺陷）。
const briefingRaci = computed(() => parseRaciFromTask(briefingTask.value))
const briefingOpen = ref(false)
const briefingGit = ref<{ branch: string | null; worktreePath: string | null; commits: { hash: string; subject: string; at?: number }[] }>({ branch: null, worktreePath: null, commits: [] })
// 抽屉打开时的兜底重试：eager watch 的跨板解析若因瞬时失败未命中，这里再试一次
// （同一 resolveBriefingCrossBoard，当前板缓存优先零额外请求），随后刷新 Git 块。
async function resolveBriefingTask(): Promise<void> {
  if (ide.activeTaskId && !briefingTask.value) {
    await resolveBriefingCrossBoard(ide.activeTaskId)
  }
  void loadBriefingGit()
}
// Git 活动块：打开抽屉或切换任务时拉一次，任务 workspace 即 git root；失败静默空态
async function loadBriefingGit(): Promise<void> {
  // 回退链：卡片 workspace_path → 会话 workspace → IDE 工作区（aipaydev 实证：
  // 排期卡/跟踪卡无 workspace_path，简报 Git 块整块空态；IDE 工作区此时即用户
  // 正在开发的仓库，作为回退展示比空态更有信息量）
  const root = briefingTask.value?.workspacePath
    ?? (chatStore.activeSession?.workspace as string | undefined)
    ?? ide.workspace
  briefingGit.value = { branch: null, worktreePath: root ?? null, commits: [] }
  if (!root) return
  try {
    const [st, lg] = await Promise.all([
      ideGitApi.status(root).catch(() => null),
      ideGitApi.log(root, 5).catch(() => ({ commits: [] })),
    ])
    // stale 守卫：await 期间切换任务时丢弃旧响应（慢仓库乱序回写会串显到新任务）
    if (briefingTask.value?.workspacePath !== root) return
    briefingGit.value = {
      branch: st?.branch ?? null,
      worktreePath: root,
      commits: (lg.commits ?? []).map(c => ({ hash: c.hash, subject: c.subject, at: c.timestamp })),
    }
  } catch { /* 简报 Git 块保持空态 */ }
}
// 协作动态块：任务↔群锚点两级回退（aipaydev 推演实证：房间按业务命名
// （如「支付收银台需求分析讨论群」），[taskId] 前缀锚点在真实推演零命中）：
//   ① 群名前缀 [taskId 前 8 位]（manage.ts 裁决#4，保留）
//   ② 需求码回退：从标题/正文提取 RFD-\d+，扫最近活跃房间的最近一页消息，
//      命中提及（任务 id 前 8 位或需求码）即锚定该房。只读、上限 8 房，
//      避免开抽屉放大请求面。
const briefingCollab = ref<{ sender: string; excerpt: string; at?: number }[]>([])
async function loadBriefingCollab(): Promise<void> {
  briefingCollab.value = []
  const id = ide.activeTaskId
  if (!id) return
  try {
    const [{ useMatrixRoomStore }, { matchRoomByPrefix }, { useMatrixClientStore }] = await Promise.all([
      import('@/custom/matrix-chat/stores/matrix-room'),
      import('@/custom/ia2/adapters/manage'),
      import('@/custom/matrix-chat/stores/matrix-client'),
    ])
    const client = useMatrixClientStore().client as any
    if (!client) return
    const rooms = useMatrixRoomStore().sortedRooms as Array<{ roomId: string; name?: string | null }>
    let room = matchRoomByPrefix(rooms, `[${id.slice(0, 8)}]`)
    let chunk: any[] = []
    const fetchPage = async (roomId: string): Promise<any[]> =>
      ((await client.createMessagesRequest(roomId, null, 10, 'b'))?.chunk ?? []) as any[]
    if (room) {
      chunk = await fetchPage(room.roomId)
    } else {
      // ② 需求码回退：任务卡正文常引用 docs/analysis/RFD-xxx-*.md
      const text = `${briefingTask.value?.title ?? ''} ${briefingTask.value?.body ?? ''}`
      const code = text.match(/RFD-\d+/)?.[0]
      const needle = id.slice(0, 8)
      for (const candidate of rooms.slice(0, 8)) {
        const page = await fetchPage(candidate.roomId)
        if (page.some(ev => {
          const b = String(ev?.content?.body ?? '')
          return b.includes(needle) || (code != null && b.includes(code))
        })) {
          room = candidate
          chunk = page
          break
        }
      }
    }
    if (!room) return
    // stale 守卫：await 期间切换任务时丢弃旧响应（旧任务的群消息会串显到新任务）
    if (ide.activeTaskId !== id) return
    briefingCollab.value = chunk
      .filter(ev => ev.type === 'm.room.message' && typeof ev.content?.body === 'string')
      .slice(0, 6)
      .map(ev => ({
        sender: String(ev.sender ?? '').replace(/^@/, '').split(':')[0] ?? '',
        excerpt: String(ev.content.body).slice(0, 80),
        at: typeof ev.origin_server_ts === 'number' ? ev.origin_server_ts : undefined,
      }))
  } catch { /* 协作动态保持空态 */ }
}
// Kanban 状态块：retry 计数经 /api/ide/retry-count（patch 371 与 363 计数链同源），
// 其余维度（阶段/阻塞/依赖）从任务本体推导。
const briefingRetry = ref(0)
async function loadBriefingRetry(): Promise<void> {
  briefingRetry.value = 0
  const id = briefingTask.value?.id
  if (!id) return
  try {
    const res = await request<{ count: number }>(`/api/ide/retry-count?task=${encodeURIComponent(id)}`)
    if (briefingTask.value?.id !== id) return // stale 守卫（同 Git/协作块）
    briefingRetry.value = res.count ?? 0
  } catch { /* 计数读取失败保持 0 */ }
}
const briefingWorkflow = computed(() => {
  const task = briefingTask.value
  if (!task) return { stage: '', parentIds: [], childIds: [], blocked: false, retryCount: 0 }
  return {
    stage: task.status,
    parentIds: [],
    childIds: [],
    blocked: task.status === 'blocked',
    retryCount: briefingRetry.value,
  }
})
watch([briefingOpen, () => ide.activeTaskId], ([open]) => {
  if (open) {
    void resolveBriefingTask().then(() => void loadBriefingRetry())
    void loadBriefingCollab()
  }
})
function onAuxSend(text: string): void {
  // 辅助会话回传：组装任务上下文前缀发往主会话（chat.sendMessage 无活跃会话
  // 时自动建会话；模式对齐 IdeTaskContextBar assistant「带入主会话」裁决）
  const message = buildAuxMessage(briefingTask.value, text)
  if (message) void chatStore.sendMessage(message)
}

onUnmounted(() => {
})
</script>

<template>
  <div class="ide-shell">
    <!-- v12.1 全局顶区常驻双视图；v12.6 维度条（工作空间行）退役——与三栏
         功能重叠（任务/会话在侧栏与会话列直达，辅助面板页签自持） -->
    <IaGlobalTop @notify="cockpitStore.openNotify()" />
    <IdeTaskContextBar />
    <div class="ide-shell__main" :class="mainClass">
      <aside v-show="sidebarShown" class="ide-shell__sidebar" :class="{ 'is-folded': ide.layout.sidebar.folded }" :style="sidebarWidthStyle">
        <div v-if="ide.layout.sidebar.folded" class="ide-shell__fold-handle" data-testid="ide-fold-sidebar" :title="t('ide.pane.expand')" @click="ide.toggleFold('sidebar')">
          <span class="ide-shell__fold-label">›</span>
        </div>
        <div v-else class="ide-shell__col ide-shell__col--sidebar">
          <!-- R6 补充：栏控迁独立控制条行（不占内容区，根治绝对定位遮罩） -->
          <div class="ide-shell__colhead" data-testid="ide-colhead-sidebar">
            <IaColumnControls
              testid="ide-col-sidebar" fold="left" show-max :maximized="ide.layout.sidebar.maximized"
              @fold="ide.toggleFold('sidebar')" @max="ide.toggleMax('sidebar')"
            />
          </div>
          <!-- R6 补充：左栏右缘拖拽分割条（调整左栏宽度） -->
          <div class="ide-shell__split ide-shell__split--l" data-testid="ide-split-l" @mousedown="startIdeDrag('sidebar', $event)" />
          <IdeTaskSidebar class="ide-shell__colbody" />
        </div>
      </aside>
      <div v-show="chatShown" class="ide-shell__chat" :class="{ 'is-folded': ide.layout.chat.folded }">
        <div v-if="ide.layout.chat.folded" class="ide-shell__fold-handle ide-shell__fold-handle--v" data-testid="ide-fold-chat" :title="t('ide.pane.expand')" @click="ide.toggleFold('chat')">
          <span class="ide-shell__fold-label">›</span>
        </div>
        <div v-else class="ide-shell__col ide-shell__col--chat">
          <div class="ide-shell__colhead" data-testid="ide-colhead-chat">
            <IaColumnControls
              testid="ide-col-chat" fold="left" show-max :maximized="ide.layout.chat.maximized" show-popout
              @fold="ide.toggleFold('chat')" @max="ide.toggleMax('chat')" @popout="onChatPopout"
            />
          </div>
          <IdeChatPane class="ide-shell__colbody" />
        </div>
      </div>
      <div v-show="sidepaneShown" class="ide-shell__panewrap" :style="sidepaneWidthStyle">
        <!-- R6 补充：右栏左缘拖拽分割条（调整右辅助面板宽度） -->
        <div class="ide-shell__split ide-shell__split--r" data-testid="ide-split-r" @mousedown="startIdeDrag('sidepane', $event)" />
        <IdeSidePane :class="{ 'is-max': ide.layout.sidepane.maximized }" />
      </div>
      <!-- v12.6：侧板收起态右缘导轨（侧栏 footer 功能行退役后的重开入口） -->
      <div v-if="!ide.sidePane.open && !anyMax" class="ide-shell__pane-rail" data-testid="ide-sidepane-rail">
        <button type="button" class="ide-shell__rail-btn" data-testid="ide-sidepane-open"
          :title="t('ide.sidePane.togglePanel')" @click="ide.sidePane.open = true"
        >◀</button>
      </div>
      <!-- aipaydev 缺口 5：任务简报导轨按钮（常驻右缘） -->
      <div class="ide-shell__pane-rail" data-testid="ide-brief-rail">
        <button type="button" class="ide-shell__rail-btn" data-testid="ide-briefing-toggle"
          :class="{ 'is-active': briefingOpen }"
          :title="t('ide.briefing.toggle', '任务简报')" @click="briefingOpen = !briefingOpen"
        >📋</button>
      </div>
    </div>
    <!-- aipaydev 缺口 5：任务简报抽屉（右侧滑出，不占三栏布局） -->
    <Transition name="brief-drawer">
      <div v-if="briefingOpen" class="ide-shell__briefing" data-testid="ide-briefing-drawer">
        <div class="ide-shell__brief-head">
          <button type="button" class="ide-shell__brief-close" data-testid="ide-briefing-close"
            :title="t('ide.briefing.close', '收起简报')" @click="briefingOpen = false"
          >×</button>
        </div>
        <TaskBriefingPanel v-if="briefingTask" class="ide-shell__brief-body" :task="briefingTask" :raci="briefingRaci" :git="briefingGit" :collab="briefingCollab" :workflow="briefingWorkflow" @aux-send="onAuxSend" />
        <p v-else class="ide-shell__brief-empty">{{ t('ide.briefing.noActiveTask', '当前无激活任务：从看板或任务跳转进入后自动带入简报') }}</p>
      </div>
    </Transition>
    <IdeStatusBar />
    <CockpitRunTraceModal />
    <IdeCommandPalette />
  </div>
</template>

<style scoped lang="scss">
.ide-shell {
  height: calc(var(--vh, 1vh) * 100);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  overflow: hidden;

}

.ide-shell__main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.ide-shell__sidebar {
  flex-shrink: 0;
  display: flex;
  min-height: 0;
  position: relative;
}

/* R6 补充：三栏宽度拖拽分割条（左栏右缘/右栏左缘，hover 加粗可见） */
.ide-shell__split {
  position: absolute; top: 0; bottom: 0; width: 6px; z-index: 100;
  cursor: col-resize; background: transparent;
  /* 命中域加宽：视觉 6px 不变，两侧各外延 5px（6px 真实鼠标打不中；z-index
     须压过 chat-input-area z-80——它曾盖住左分割条底部右半，真实拖拽落空） */
  &::before {
    content: ''; position: absolute; top: 0; bottom: 0; left: -5px; right: -5px;
  }
  &:hover, &:active { background: color-mix(in srgb, #61afef 30%, transparent); }
}
.ide-shell__split--l { right: -3px; }
.ide-shell__split--r { left: -3px; }

/* R6 右辅助面板宽度容器（分割条 relative 父级） */
.ide-shell__panewrap {
  flex-shrink: 0;
  display: flex;
  min-height: 0;
  position: relative;
}

.ide-shell__fold-handle {
  width: 18px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--bg-tertiary, #ebebeb);
  border-right: 1px solid var(--border-color, #e0e0e0);
  color: var(--accent-primary, #4cc9f0);

  &:hover { background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 18%, var(--bg-tertiary, #ebebeb)); }

  &--v { width: 18px; }
}

.ide-shell__fold-label { font-size: 11px; user-select: none; }

/* v12.6 栏控迁独立控制条行（不占内容区，根治绝对定位遮罩，R6 补充） */
.ide-shell__col { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.ide-shell__colhead {
  flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center;
  height: 26px; padding: 0 6px; border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-primary, #14161a); border-radius: 6px 6px 0 0;
}
.ide-shell__colctl { display: none; }
/* 旧绝对定位让位规则已退役（栏控迁 colhead 不占内容区） */
.ide-shell__colbody { flex: 1; min-height: 0; }
.ide-shell__pane-rail {
  flex-shrink: 0; width: 18px; display: flex; align-items: flex-start; justify-content: center;
  padding-top: 4px;
}
.ide-shell__rail-btn {
  width: 16px; height: 40px; border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px;
  background: var(--bg-primary, #14161a); color: var(--text-muted, #9aa0aa); cursor: pointer;
  font-size: 10px; line-height: 1; padding: 0;
  &:hover { color: var(--text-primary, #e6e6e6); background: var(--bg-tertiary, #ebebeb); }
}

.ide-shell__main.has-max-sidebar .ide-shell__sidebar { flex: 1; }
.ide-shell__main.has-max-chat .ide-shell__chat { flex: 1; }
/* 最大化时 panewrap 须接管剩余空间——常态宽度在内联 style 上，不放开会钉死在拖拽宽 */
.ide-shell__main.has-max-sidepane .ide-shell__panewrap { flex: 1; }
.ide-shell__main.has-max-sidepane .ide-sidepane { flex: 1; width: auto !important; }

/* aipaydev 缺口 5：任务简报抽屉（右侧滑出覆盖层，关闭时零占位零遮罩） */
.ide-shell {
  position: relative;
}
.ide-shell__rail-btn.is-active {
  color: var(--accent-primary, #4cc9f0);
  border-color: var(--accent-primary, #4cc9f0);
}
.ide-shell__briefing {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  max-width: 86vw;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #14161a);
  border-left: 1px solid var(--border-color, #e0e0e0);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18);
}
.ide-shell__brief-head {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
.ide-shell__brief-close {
  border: none;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
  &:hover { color: var(--text-primary, #e6e6e6); }
}
.ide-shell__brief-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.ide-shell__brief-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  text-align: center;
}
.brief-drawer-enter-active,
.brief-drawer-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.brief-drawer-enter-from,
.brief-drawer-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

.ide-shell__sidebar.is-folded,
.ide-shell__chat.is-folded { flex: 0 0 18px; min-width: 0; overflow: hidden; }

.ide-shell__chat {
  position: relative;
  flex: 1 1 auto;
  min-width: 320px;
  display: flex;
}
</style>
