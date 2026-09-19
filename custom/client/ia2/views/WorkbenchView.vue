<!-- overlay/custom/client/ia2/views/WorkbenchView.vue -->
<!-- v12 沟通协作工作台（2026-09-19 统一视图）：三栏唯一职责——
     左=工作流导航（会话∪循环统一列表）；中=对象工作区（会话→对话画布；
     循环→运行画布[实时|历史]）；右=任务与决策（等我队列+挂接任务+动态）恒驻。
     选择态经路由子路径承载（s/chat/:sessionId | s/room/:roomId | l/:loopId），
     '' 无选择时自动选首个会话（不写 URL，刷新/深链直达不失真）。
     数据底座：matrix 房间 + hermes agent 会话（会话不分类同列）、loop 实例、
     kanban 任务（tenant 六段式/契约挂接）；派生全走 adapters/flow 纯函数。 -->
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
import { useTeamRegistryStore } from '@/custom/matrix-teams/stores/team-registry'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { useChatStore } from '@/stores/hermes/chat'
import {
  buildSessionRows, buildLoopRows, linkedTaskIdsOfSession, linkedTasksOfLoop, mergeFeed,
  type SessionSourceRow, type StreamSelection,
} from '../adapters/flow'
import { buildWaiting, type WaitItem } from '../adapters/waiting'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import FlowNavPanel from '../components/flow/FlowNavPanel.vue'
import TaskDecisionPanel from '../components/flow/TaskDecisionPanel.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const loopStore = useLoopStore()
const runsStore = useRunCenterStore()
const cockpit = useCockpitStore()
const matrixRoom = useMatrixRoomStore()
const teamRegistry = useTeamRegistryStore()
const kanban = useKanbanStore()
const chatStore = useChatStore()
const kanbanTasks = computed(() => kanban.tasks ?? [])

// ── 选择：路由是选择的唯一持久载体 ──

const routeSel = computed<StreamSelection | null>(() => {
  if (typeof route.params.roomId === 'string') return { kind: 'room', id: route.params.roomId }
  if (typeof route.params.sessionId === 'string') return { kind: 'chat', id: route.params.sessionId }
  if (typeof route.params.loopId === 'string') return { kind: 'loop', id: route.params.loopId }
  return null
})

// ── 会话源：matrix 房间 ∪ hermes agent 会话（不分类同列）──

const chatSessions = computed(() => chatStore.sessions ?? [])

const sessionSources = computed<SessionSourceRow[]>(() => {
  // 房间侧 sortedRooms 已按最近消息倒序——用 rank 时戳保序（SDK Room 形状不直耦合
  // 进纯函数）；会话侧 updatedAt 真值。两路经 buildSessionRows 统一重排。
  const now = Date.now()
  const rooms = (matrixRoom.sortedRooms ?? []) as Array<{ roomId: string; name?: string }>
  const roomRows: SessionSourceRow[] = rooms.map((r, i) => ({
    kind: 'room', id: r.roomId, name: r.name || r.roomId, lastActivityAt: now - i * 1000,
  }))
  const chatRows: SessionSourceRow[] = chatSessions.value.map(s => ({
    kind: 'chat', id: s.id, name: s.title || s.id, lastActivityAt: s.updatedAt ?? null,
  }))
  return [...roomRows, ...chatRows]
})

// ── 任务挂接源（kanban 原始任务优先——带 session_id；退化用 workspace 聚合行）──

const tasksForLink = computed(() => {
  if (kanbanTasks.value?.length) {
    return kanbanTasks.value.map(t => ({ id: t.id, tenant: t.tenant ?? null, session_id: t.session_id ?? null }))
  }
  return workspace.tasks.map(t => ({ id: t.id, tenant: t.tenant ?? null, session_id: null }))
})

// ── 行构建（纯函数 + 视图侧钩子）──

const duties = computed(() => teamRegistry.duties ?? {})
const accounts = computed(() => teamRegistry.accounts ?? [])

function assigneeLabelOf(roomId: string): { dutyName: string | null; teamTag: string } {
  const duty = duties.value[roomId]
  if (!duty) return { dutyName: null, teamTag: '' }
  const account = accounts.value.find(a =>
    duty.assigneeKind === 'account' ? a.userId === duty.assigneeId
      : a.agentTeams.some(at => `${a.userId}/${at.slug}` === duty.assigneeId))
  const teamTag = account?.agentTeams[0]?.slug ?? ''
  return { dutyName: account?.displayName ?? duty.roomName ?? null, teamTag }
}

const sessionRows = computed(() => buildSessionRows(sessionSources.value, {
  unreadOf(id, kind) {
    if (kind === 'chat') return chatStore.unreadMessages?.get(id)?.count ?? 0
    const room = (matrixRoom.sortedRooms ?? []).find((r: { roomId: string }) => r.roomId === id)
    return room ? matrixRoom.getRoomUnreadCount(room) : 0
  },
  taskIdsOf(id, kind) {
    return linkedTaskIdsOfSession({ kind, id }, tasksForLink.value)
  },
  teamTagOf(id) {
    return assigneeLabelOf(id).teamTag
  },
  dutyNameOf(id) {
    return assigneeLabelOf(id).dutyName
  },
}))

const loopRows = computed(() => buildLoopRows(loopStore.loops ?? [], Date.now()))

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

const waitItems = computed(() => buildWaiting(
  tasksForShow.value.map(x => ({ id: x.id, title: x.title, status: x.status, assignee: x.assignee, createdAt: x.createdAt })),
  runsStore.runs ?? [],
  cockpit.fleetSessions ?? [],
  Date.now(),
))

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

// ── 右栏动作（动线②指派 / ④决策 / ⑤编码）──

function onApproveTask(taskId: string): void {
  void kanban.moveTask(taskId, 'done')
}

function onRejectTask(taskId: string): void {
  void kanban.blockTask(taskId, t('ia2.tdp.rejectReason'))
}

function onApproveRun(item: WaitItem): void {
  if (item.runId) void runsStore.resumeRun(item.runId, true)
}

function onApproveFleet(item: WaitItem): void {
  if (item.sessionId && item.approvalId) {
    void cockpit.respondFleetApproval(item.sessionId, item.approvalId, 'once')
  }
}

const drawerTaskId = ref<string | null>(null)
const drawerOpen = ref(false)

function onReassign(taskId: string): void {
  drawerTaskId.value = taskId
  drawerOpen.value = true
}

function onOpenIde(taskId: string): void {
  void router.push({ name: 'ide.shell', query: { task: taskId } })
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

// ── 面板事件 ──

function onSelect(sel: StreamSelection): void {
  if (sel.kind === 'room') void router.push({ name: 'ia2.commsRoom', params: { roomId: sel.id } })
  else if (sel.kind === 'chat') void router.push({ name: 'ia2.collabSession', params: { sessionId: sel.id } })
  else void router.push({ name: 'ia2.loopCanvas', params: { loopId: sel.id } })
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
  <div class="wb" data-testid="wb-root">
    <aside class="wb__left" data-testid="wb-left">
      <FlowNavPanel
        :sessions="sessionRows"
        :loops="loopRows"
        :selection="activeSel"
        @select="onSelect"
        @create-room="onCreateRoom"
        @new-loop="onNewLoop"
        @open-gov="flow.openGov()"
      />
    </aside>
    <section class="wb__center" data-testid="wb-center">
      <!-- Task 6/7：会话→对话画布（链路条+参与方+消息流）；循环→运行画布（实时|历史） -->
      <div class="wb__canvas-ph" :data-testid="`wb-canvas-${activeSel?.kind ?? 'none'}`" />
    </section>
    <aside class="wb__right" data-testid="wb-right">
      <TaskDecisionPanel
        :wait-items="waitItems"
        :linked-tasks="linkedTasks"
        :feed-rows="feedRows"
        :linked-context="linkedContext"
        @approve-task="onApproveTask"
        @reject-task="onRejectTask"
        @approve-run="onApproveRun"
        @approve-fleet="onApproveFleet"
        @reassign="onReassign"
        @open-ide="onOpenIde"
        @handle-task="onHandleTask"
        @new-task="onNewTask"
        @all-timeline="onAllTimeline"
      />
    </aside>
    <!-- 改派/详情：复用看板任务抽屉（含指派编辑） -->
    <KanbanTaskDrawer v-model:show="drawerOpen" :task-id="drawerTaskId" />
  </div>
</template>

<style scoped lang="scss">
/* v12 三栏铁律：250 | 自适应(≥320) | 240，永不换列不堆叠（窄屏由外层整体缩放） */
.wb {
  display: grid;
  grid-template-columns: 250px minmax(320px, 1fr) 240px;
  gap: 10px;
  height: 100%;
  min-width: 0;
}
.wb__left, .wb__right { min-height: 0; }
.wb__center { min-height: 0; min-width: 0; }
.wb__canvas-ph { height: 100%; border: 1px dashed var(--border-color); border-radius: 6px; }
</style>
