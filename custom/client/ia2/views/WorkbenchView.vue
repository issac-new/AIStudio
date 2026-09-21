<!-- overlay/custom/client/ia2/views/WorkbenchView.vue -->
<!-- v12 沟通协作工作台（2026-09-19 统一视图）：三栏唯一职责——
     左=工作流导航（会话∪循环统一列表）；中=对象工作区（会话→对话画布；
     循环→运行画布[实时|历史]）；右=任务与决策（等我队列+挂接任务+动态）恒驻。
     选择态经路由子路径承载（s/chat/:sessionId | s/room/:roomId | l/:loopId），
     '' 无选择时自动选首个会话（不写 URL，刷新/深链直达不失真）。
     v12.3（2026-09-20 用户裁定）：六态势 chips 迁页头（SitlineBar + 内联面板
     在 IaShellHeader，本视图不再渲染态势行）；行装配/决策动作/态势计数收编
     composables（useSessionRows/useDecisionActions/useSitCounts 单一实现）。
     v12.4（2026-09-20 用户裁定）：三栏栏控迁各栏顶部控制条（IaColumnControls
     左=折叠/中=最大化+独立窗口/右=折叠，页头集中簇退役；折叠态 18px 导轨
     就地展开）；右栏「等我」对齐 useDecisionRows（待我决策的任务及会话）。
     v13（2026-09-21 协作感知轮，multica/routa 源码调研落地）：左栏循环行
     运行脉冲（loopRunActivity）+右栏「需关注」节（buildAttention 分诊）+
     运行画布耗时徽章与语义块回放（RunCanvas 内消费）；调研正本
     docs/comm-collab-v13-research.md。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useFlowStore } from '../store/flow'
import { useWorkspaceStore } from '../store/workspace'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useChatStore } from '@/stores/hermes/chat'
import { usePlatformsStore } from '../store/platforms'
import { buildAgentRoster } from '../adapters/agents'
import {
  linkedTaskIdsOfSession, linkedTasksOfLoop, mergeFeed,
  type StreamSelection,
} from '../adapters/flow'
import { buildAttention, loopRunActivity, type AttentionRow, type LoopActivity } from '../adapters/activity'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import FlowNavPanel from '../components/flow/FlowNavPanel.vue'
import TaskDecisionPanel from '../components/flow/TaskDecisionPanel.vue'
import SessionCanvas from '../components/flow/SessionCanvas.vue'
import RunCanvas from '../components/flow/RunCanvas.vue'
import IaColumnControls from '../components/IaColumnControls.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'
import type { ParticipantBadge } from '../components/flow/SessionWorkbenchPanel.vue'
import { useSessionRows } from '../composables/useSessionRows'
import { useSitCounts } from '../composables/useSitCounts'
import { useDecisionRows } from '../composables/useDecisionRows'
import { useDecisionActions } from '../composables/useDecisionActions'
import { useIdeJump } from '../composables/useIdeJump'
import { openPanelWindow } from '../wm/popout'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const loopStore = useLoopStore()
const runsStore = useRunCenterStore()
const cockpit = useCockpitStore()
const matrixRoom = useMatrixRoomStore()
const chatStore = useChatStore()
const platformsStore = usePlatformsStore()

// ── 行装配与决策动作（composables 单一实现，页头态势/通知下拉同源）──

const { sessionRows, chatSessions, tasksForLink, duties, accounts } = useSessionRows()
const { loopRows } = useSitCounts()

// R7-C agent 名册统一面：在线/忙闲/在跑（multica roster 语义）——
// 三源合并：platforms 在线探针 + kanban assignee 在跑 + 会话挂靠。
const agentRoster = computed(() => {
  const tasks = (tasksForLink.value ?? []).map(t => ({
    id: t.id, title: t.title, assignee: t.assignee ?? null, status: t.status,
  }))
  const sessions = (chatStore.sessions ?? []).map(s => ({
    id: s.id, agent: (s as { agent?: string | null }).agent ?? null,
  }))
  return buildAgentRoster(platformsStore.platforms ?? [], tasks, sessions)
})
const { decisionRows: waitItems } = useDecisionRows()
const { approveTask, rejectTask, approveRun, approveFleet } = useDecisionActions()
const { jumpIde } = useIdeJump()

// ── 选择：路由是选择的唯一持久载体 ──

const routeSel = computed<StreamSelection | null>(() => {
  // 按路由名分派：s/room 与 s/group 的参数名同为 roomId，params 判别会互撞
  switch (route.name) {
    case 'ia2.commsRoom': return typeof route.params.roomId === 'string' ? { kind: 'room', id: route.params.roomId } : null
    case 'ia2.groupRoom': return typeof route.params.roomId === 'string' ? { kind: 'group', id: route.params.roomId } : null
    case 'ia2.collabSession': return typeof route.params.sessionId === 'string' ? { kind: 'chat', id: route.params.sessionId } : null
    case 'ia2.loopCanvas': return typeof route.params.loopId === 'string' ? { kind: 'loop', id: route.params.loopId } : null
    default: return null
  }
})

// ── 默认选择与 store 同步（'' 无选择 → 首个会话，不写 URL）──

const defaultSel = computed<StreamSelection | null>(() => {
  const first = sessionRows.value[0]
  return first ? { kind: first.kind, id: first.id } : null
})
const activeSel = computed<StreamSelection | null>(() => routeSel.value ?? defaultSel.value)

watch(activeSel, sel => flow.select(sel), { immediate: true })

// 循环选中时装载该循环的契约/事件（运行画布与右栏挂接任务/动态共用）
watch(activeSel, sel => {
  if (sel?.kind === 'loop' && loopStore.currentLoop?.id !== sel.id) void loopStore.fetchLoop(sel.id)
}, { immediate: true })

// ── 右栏数据（任务与决策恒驻）──

/** 展示任务源：workspace 聚合行（跨板块全量，含 tenant/状态/指派） */
const tasksForShow = computed(() => workspace.tasks)

const linkedTasks = computed<CockpitTask[]>(() => {
  const sel = activeSel.value
  if (!sel) return recentOpenTasks.value
  if (sel.kind === 'loop') {
    return linkedTasksOfLoop(loopStore.currentContracts ?? [], tasksForShow.value)
  }
  const ids = new Set(linkedTaskIdsOfSession(sel, tasksForLink.value))
  return tasksForShow.value.filter(x => ids.has(x.id))
})

/** 无选择/无挂接时的兜底：最近开放任务前 8（非 done/archived，按创建倒序） */
const recentOpenTasks = computed<CockpitTask[]>(() =>
  tasksForShow.value
    .filter(x => x.status !== 'done' && x.status !== 'archived')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8))

const feedRows = computed(() => mergeFeed(
  loopStore.currentEvents ?? [],
  (runsStore.sortedRuns ?? []).slice(0, 5).map(r => ({ runId: r.runId, events: r.events ?? [] })),
  tasksForShow.value.map(x => ({
    id: x.id, title: x.title, createdAt: x.createdAt,
    startedAt: null, completedAt: null,
  })),
  Date.now(),
))

const linkedContext = computed(() => {
  const sel = activeSel.value
  if (!sel) return ''
  if (sel.kind === 'loop') return loopStore.currentLoop?.name ?? sel.id
  return sessionRows.value.find(s => s.kind === sel.kind && s.id === sel.id)?.name ?? ''
})

// ── v13 协作感知：左栏活动索引 + 右栏需关注行（单一计算，两栏消费）──

const loopActivity = computed<Record<string, LoopActivity>>(() => {
  const m = loopRunActivity(runsStore.sortedRuns ?? [])
  return Object.fromEntries(m)
})

// R7-B 开发产出回喂：ide 会话失败/受阻 → 协作感知输入（abortStates 投影）
const sessionAttention = computed(() => {
  const out: Array<{ id: string; title: string; failed?: boolean; blocked?: boolean; updatedAt: number }> = []
  for (const s of chatStore.sessions ?? []) {
    const abort = (chatStore as unknown as { abortStates?: Map<string, { error?: string; timedOut?: boolean; aborting?: boolean }> }).abortStates?.get(s.id)
    if (abort?.error || abort?.timedOut) {
      out.push({ id: s.id, title: s.title, failed: true, updatedAt: s.updatedAt ?? Date.now() })
    } else if (abort?.aborting && !abort.error) {
      // 长时 aborting 未落定 = 受阻
      out.push({ id: s.id, title: s.title, blocked: true, updatedAt: s.updatedAt ?? Date.now() })
    }
  }
  return out
})

const attentionRows = computed<AttentionRow[]>(() =>
  buildAttention(tasksForShow.value, runsStore.sortedRuns ?? [], Date.now(), sessionAttention.value))

/** 需关注行点击分派：任务→看板预选；运行→所属循环画布；会话→ide 会话；兜底全局时间线 */
function onOpenAttention(row: AttentionRow): void {
  if (row.taskId) {
    void router.push({ name: 'ia2.board', query: { task: row.taskId } })
    return
  }
  // R7-B：会话失败/受阻 → ide 会话（开发产出回喂的反向跳）
  if (row.sessionId) {
    void router.push({ name: 'ide.shell', query: { session: row.sessionId } })
    return
  }
  if (row.runId) {
    const run = (runsStore.sortedRuns ?? []).find(r => r.runId === row.runId)
    const loopId = run?.graphId.startsWith('loop-') ? run.graphId.slice(5) : null
    if (loopId) {
      void router.push({ name: 'ia2.loopCanvas', params: { loopId } })
      return
    }
  }
  cockpit.openRunTraceGlobal()
}

// ── 右栏动作（动线②指派 / ④决策 / ⑤编码；决策实现=useDecisionActions）──

const drawerTaskId = ref<string | null>(null)
const drawerOpen = ref(false)

function onReassign(taskId: string): void {
  drawerTaskId.value = taskId
  drawerOpen.value = true
}

function onOpenIde(taskId: string): void {
  jumpIde(taskId)
}

function onHandleTask(taskId: string): void {
  void router.push({ name: 'ia2.board', query: { task: taskId } })
}

function onNewTask(): void {
  void router.push({ name: 'ia2.board' })
}

function onAllTimeline(): void {
  cockpit.openRunTraceGlobal()
}

// ── 中栏 · 会话画布数据（链路条/参与方条）──

const selectedSessionRow = computed(() => {
  const sel = activeSel.value
  if (!sel || sel.kind === 'loop') return null
  return sessionRows.value.find(s => s.kind === sel.kind && s.id === sel.id) ?? null
})

/** 门节点标题：等我队列命中当前对象挂接任务时显示（验收中任务标题） */
const gateTitle = computed(() => {
  const sel = activeSel.value
  if (!sel || sel.kind === 'loop') return null
  const linked = new Set(linkedTasks.value.map(t => t.id))
  const hit = waitItems.value.find(w => w.kind === 'task-review' && w.taskId && linked.has(w.taskId))
  return hit ? t('ia2.chain.gateReview') : null
})

const participants = computed<ParticipantBadge[]>(() => {
  const sel = activeSel.value
  if (!sel || sel.kind === 'loop') return []
  if (sel.kind === 'chat') {
    const s = chatSessions.value.find(x => x.id === sel.id)
    return s?.agent ? [{ kind: 'agent', name: s.agent }] : []
  }
  if (sel.kind === 'group') return [] // 群聊成员面在 GroupChatPanel 自有 UI，面板不投影
  const badges: ParticipantBadge[] = []
  try {
    const members = matrixRoom.getRoomMemberList?.(sel.id)
    for (const m of (members?.defaults ?? []).slice(0, 8)) {
      badges.push({ kind: 'human', name: (m as { name?: string; userId?: string }).name || (m as { userId?: string }).userId || '?' })
    }
  } catch { /* 成员列表需就绪的 client；未就绪时留空 */ }
  const duty = duties.value[sel.id]
  if (duty?.assigneeKind === 'agentTeam') {
    for (const a of accounts.value) {
      for (const at of a.agentTeams) {
        if (`${a.userId}/${at.slug}` === duty.assigneeId) {
          badges.push({ kind: 'agent', name: at.name, team: at.slug })
        }
      }
    }
  }
  return badges
})

function onCanvasOpenTask(taskId: string): void {
  drawerTaskId.value = taskId
  drawerOpen.value = true
}

function onCanvasInvite(): void {
  const sel = activeSel.value
  if (sel) flow.openGov('session', sel.kind === 'loop' ? undefined : sel.id)
}

// ── 中栏 · 运行画布数据（循环面）──

const loopLatestRunId = computed(() => {
  const sel = activeSel.value
  if (!sel || sel.kind !== 'loop') return null
  // run.graphId === `loop-<loopId>`（graph-compiler 约定）
  return (runsStore.sortedRuns ?? []).find(r => r.graphId === `loop-${sel.id}`)?.runId ?? null
})

/** v13 运行画布耗时徽章：最新 run 状态 + 首事件时刻（ISO∪ms 归一 ms） */
const loopLatestRunStatus = computed(() => {
  const sel = activeSel.value
  if (!sel || sel.kind !== 'loop') return null
  return (runsStore.sortedRuns ?? []).find(r => r.graphId === `loop-${sel.id}`)?.status ?? null
})

const loopLatestRunStartMs = computed(() => {
  const sel = activeSel.value
  if (!sel || sel.kind !== 'loop') return null
  const run = (runsStore.sortedRuns ?? []).find(r => r.graphId === `loop-${sel.id}`)
  if (!run || !run.events.length) return null
  let min = Number.POSITIVE_INFINITY
  for (const e of run.events) {
    const ms = typeof e.ts === 'number' ? e.ts : Date.parse(String(e.ts))
    if (!Number.isNaN(ms) && ms < min) min = ms
  }
  return Number.isFinite(min) ? min : null
})

const loopLiveConnected = computed(() => runsStore.connection === 'connected')

const loopParticipants = computed(() => {
  const sel = activeSel.value
  if (!sel || sel.kind !== 'loop') return []
  const byId = new Map(tasksForShow.value.map(x => [x.id, x]))
  const seen = new Set<string>()
  const out: Array<{ kind: 'agent'; name: string; role: string }> = []
  for (const c of loopStore.currentContracts ?? []) {
    const task = c.persistedTaskId ? byId.get(c.persistedTaskId) : null
    if (task?.assignee && !seen.has(task.assignee)) {
      seen.add(task.assignee)
      out.push({ kind: 'agent', name: task.assignee, role: t('ia2.rc.roleExec') })
    }
  }
  return out
})

function onGotoBoard(): void {
  void router.push({ name: 'ia2.board' })
}

/** 中栏独立窗口：弹出当前对象路由（standalone=1 精简壳；合入在独立窗内） */
function onPopout(): void {
  void openPanelWindow({ path: route.fullPath })
}

// ── 面板事件 ──

function onSelect(sel: StreamSelection): void {
  if (sel.kind === 'room') void router.push({ name: 'ia2.commsRoom', params: { roomId: sel.id } })
  else if (sel.kind === 'group') void router.push({ name: 'ia2.groupRoom', params: { roomId: sel.id } })
  else if (sel.kind === 'chat') void router.push({ name: 'ia2.collabSession', params: { sessionId: sel.id } })
  else void router.push({ name: 'ia2.loopCanvas', params: { loopId: sel.id } })
}

/** 任务簇 chip → 看板预选（R4a） */
function onNavOpenTask(taskId: string): void {
  void router.push({ name: 'ia2.board', query: { task: taskId } })
}

/** 行/任务 chip 双击 → IDE 工作台编码动线（R4a 动线⑤；无任务裸进） */
function onNavJumpIde(taskId: string | null): void {
  jumpIde(taskId)
}

async function onCreateRoom(name: string): Promise<void> {
  try {
    // store.createRoom 成功后 selectRoom + refreshRoomList（不回传 room_id）；
    // 按名唯一匹配定位新房间并落路由（多房间同名/未就绪时不导航，列表点击兜底）
    await matrixRoom.createRoom({ name })
    const hits = ((matrixRoom.sortedRooms ?? []) as Array<{ roomId: string; name?: string }>)
      .filter(r => r.name === name)
    if (hits.length === 1) void router.push({ name: 'ia2.commsRoom', params: { roomId: hits[0].roomId } })
  } catch {
    // store 侧已置 error（矩阵连接未就绪等）；此处静默——列表/态势呈现状态
  }
}

function onNewLoop(): void {
  void router.push({ name: 'ia2.eng' })
}
</script>

<template>
  <div
    class="wb"
    :class="{ 'wb--lf': flow.layout.leftFolded, 'wb--rf': flow.layout.rightFolded }"
    data-testid="wb-root"
  >
    <!-- 左栏：折叠态 18px 导轨（▶ 展开）；栏控叠放栏内右上角（v12.6 不占行） -->
    <aside v-if="!flow.layout.leftFolded" class="wb__left" data-testid="wb-left">
      <IaColumnControls class="wb__colctl" testid="ia-col-left" fold="left" @fold="flow.toggleFold('left')" />
      <FlowNavPanel
        :sessions="sessionRows"
        :loops="loopRows"
        :agents="agentRoster"
        :selection="activeSel"
        :loop-activity="loopActivity"
        @select="onSelect"
        @create-room="onCreateRoom"
        @new-loop="onNewLoop"
        @open-gov="flow.openGov()"
        @open-task="onNavOpenTask"
        @jump-ide="onNavJumpIde"
      />
    </aside>
    <div v-else class="wb__rail" data-testid="wb-rail-left">
      <button type="button" class="wb__rail-btn" data-testid="wb-unfold-left"
        :title="t('ia2.wm.unfoldLeft')" @click="flow.toggleFold('left')"
      >▶</button>
    </div>
    <section class="wb__center" data-testid="wb-center">
      <IaColumnControls
        class="wb__colctl" testid="ia-col-center" show-max :maximized="flow.centerMaximized" show-popout
        @max="flow.toggleCenterMax()" @popout="onPopout"
      />
      <SessionCanvas
        v-if="activeSel && activeSel.kind !== 'loop' && selectedSessionRow"
        :key="`${activeSel.kind}:${activeSel.id}`"
        :kind="activeSel.kind"
        :object-name="selectedSessionRow.name"
        :linked-tasks="linkedTasks"
        :gate-title="gateTitle"
        :participants="participants"
        :duty-name="selectedSessionRow.dutyName"
        @open-task="onCanvasOpenTask"
        @open-timeline="onAllTimeline"
        @open-ide="onOpenIde"
        @invite="onCanvasInvite"
      />
      <RunCanvas
        v-else-if="activeSel?.kind === 'loop' && loopStore.currentLoop"
        :key="`loop:${activeSel.id}`"
        :loop="loopStore.currentLoop"
        :loop-row="loopRows.find(l => l.id === activeSel.id) ?? { kind: 'loop', id: activeSel.id, name: loopStore.currentLoop.name, stageIndex: 0, stageTotal: 5, stageTone: 'todo', progressPct: 0, statusKey: 'idle', awaitingYou: false, blocked: false, updatedAt: null }"
        :linked-tasks="linkedTasks"
        :latest-run-id="loopLatestRunId"
        :latest-run-status="loopLatestRunStatus"
        :latest-run-start-ms="loopLatestRunStartMs"
        :live-connected="loopLiveConnected"
        :participants="loopParticipants"
        @open-task="onCanvasOpenTask"
        @open-timeline="onAllTimeline"
        @open-ide="onOpenIde"
        @reassign="onReassign"
        @handle-task="onHandleTask"
        @goto-board="onGotoBoard"
      />
      <div v-else class="wb__canvas-ph" :data-testid="`wb-canvas-${activeSel?.kind ?? 'none'}`" />
    </section>
    <!-- 右栏：折叠态 18px 导轨（◀ 展开）；栏控叠放栏内右上角 -->
    <aside v-if="!flow.layout.rightFolded" class="wb__right" data-testid="wb-right">
      <IaColumnControls class="wb__colctl" testid="ia-col-right" fold="right" @fold="flow.toggleFold('right')" />
      <TaskDecisionPanel
        :wait-items="waitItems"
        :attention-rows="attentionRows"
        :linked-tasks="linkedTasks"
        :feed-rows="feedRows"
        :linked-context="linkedContext"
        @approve-task="approveTask"
        @reject-task="rejectTask"
        @approve-run="approveRun"
        @approve-fleet="approveFleet"
        @reassign="onReassign"
        @open-ide="onOpenIde"
        @handle-task="onHandleTask"
        @new-task="onNewTask"
        @all-timeline="onAllTimeline"
        @open-attention="onOpenAttention"
      />
    </aside>
    <div v-else class="wb__rail" data-testid="wb-rail-right">
      <button type="button" class="wb__rail-btn" data-testid="wb-unfold-right"
        :title="t('ia2.wm.unfoldRight')" @click="flow.toggleFold('right')"
      >◀</button>
    </div>
    <!-- 改派/详情：复用看板任务抽屉（含指派编辑） -->
    <KanbanTaskDrawer v-model:show="drawerOpen" :task-id="drawerTaskId" />
  </div>
</template>

<style scoped lang="scss">
/* v12 三栏铁律：250 | 自适应(≥320) | 240，永不换列不堆叠（窄屏由外层整体缩放）。
 * v12.6 栏控叠放各栏右上角（绝对定位不占行；面板首行右对齐元素让位 62px）；
 * 折叠态 18px 导轨就地展开；中栏最大化 = 两侧齐折（flow.centerMaximized）。 */
.wb {
  height: 100%; min-height: 0; min-width: 0;
  display: grid;
  grid-template-columns: 250px minmax(320px, 1fr) 240px;
  gap: 10px;
}
.wb--lf { grid-template-columns: 18px minmax(320px, 1fr) 240px; }
.wb--rf { grid-template-columns: 250px minmax(320px, 1fr) 18px; }
.wb--lf.wb--rf { grid-template-columns: 18px minmax(320px, 1fr) 18px; }
.wb__left, .wb__right, .wb__center { min-height: 0; position: relative; }
.wb__colctl {
  position: absolute; top: 4px; right: 4px; z-index: 5;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 6px; padding: 1px 2px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
/* 首行右对齐元素让位（栏控宽约 60px；悬停层不遮可点元素） */
.wb__center :deep(.swp__block--acts) { margin-right: 64px; }
.wb__center :deep(.chain) { padding-right: 64px; }
.wb__center :deep(.rc__viewbar) { padding-right: 64px; }
.wb__left :deep(.flow-nav__head) { padding-right: 58px; }
.wb__right :deep(.tdp__head) { padding-right: 58px; }
.wb__rail {
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 4px; cursor: default;
}
.wb__rail-btn {
  width: 16px; height: 40px; border: 1px solid var(--border-color); border-radius: 4px;
  background: var(--bg-card); color: var(--text-muted); cursor: pointer;
  font-size: 10px; line-height: 1; padding: 0;
  &:hover { color: var(--text-primary); background: var(--bg-secondary); }
}
.wb__canvas-ph { height: 100%; border: 1px dashed var(--border-color); border-radius: 6px; }
</style>
