<!-- overlay/custom/client/ia2/views/IaShell.vue -->
<!-- 驾驶舱统一壳（2026-09-19 v12 统一视图）：全局页头 IaShellHeader + 双视图场景条
     （沟通协作 /app + IDE 工作台 /ide 直链）+ router-view。
     共享武装（workspace 聚合/runs/loops）自旧驾驶舱壳（已退役）上移；cockpit store 在此
     bootstrap（页头通知/搜索依赖），卸载 disconnect。全局弹窗：通知/日程/RunTrace。
     窗口管理（/goal 追加）：standalone=1 → 精简独立窗口壳（IaPopoutBar，无页头/场景条）；
     max=1 → 最大化（隐藏壳页，浮动还原胶囊 + Esc 退出）；最小化面板收底部任务栏 dock；
     独立窗口「合并回驾驶舱」经 localStorage storage 事件回流导航。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIaStore } from '@/custom/ia2/store/ia'
import { useFlowStore } from '@/custom/ia2/store/flow'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { IA_AREAS } from '@/custom/ia2/routes'
import { buildWaiting, type WaitItem } from '../adapters/waiting'
import IaShellHeader from '../components/IaShellHeader.vue'
import AttentionStrip from '../components/AttentionStrip.vue'
import IaPopoutBar from '../components/IaPopoutBar.vue'
import IaMinimizedDock from '../components/IaMinimizedDock.vue'
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
import { listenMergeBack } from '../wm/popout'
import type { AttentionRow } from '../adapters/overview'
import '@/custom/ia2/styles/ia2.scss'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const store = useIaStore()
const flow = useFlowStore()
const workspace = useWorkspaceStore()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const cockpit = useCockpitStore()

const SUBSCRIBE_CAP = 30
let shellDisposed = false
let mergeBackOff: (() => void) | null = null

/** 独立窗口态（query standalone=1）：本窗口内导航后保持标记不丢 */
const isStandalone = computed(() => route.query.standalone === '1')
let standaloneActive = isStandalone.value
/** 最大化态（query max=1）：壳页头/场景条隐藏，主区满幅 */
const isMaximized = computed(() => route.query.max === '1')

watch(() => route.path, path => store.syncFromPath(path), { immediate: true })
watch(() => route.query.standalone, value => {
  if (value === '1') standaloneActive = true
})
// standalone 窗口内跳转（如运行详情）不带 query 传播——补回标记，防退化为全壳
watch(() => route.fullPath, () => {
  if (standaloneActive && route.query.standalone !== '1') {
    void router.replace({ query: { ...route.query, standalone: '1' } })
  }
})

function exitMaximize(): void {
  const query = { ...route.query }
  delete query.max
  void router.replace({ query })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    // 管理台覆盖层优先吃 Esc（v12：⚙ 是全局覆盖层，Esc 即收）
    if (flow.govOpen) { flow.closeGov(); return }
    if (route.query.max === '1') exitMaximize()
  }
}

// ── 注意力条（v12 壳层常驻置顶）：与右栏「等我」同源（buildWaiting 单一聚合）──

const waitItems = computed<WaitItem[]>(() => buildWaiting(
  workspace.tasks.map(x => ({ id: x.id, title: x.title, status: x.status, assignee: x.assignee, createdAt: x.createdAt })),
  runsStore.runs ?? [],
  cockpit.fleetSessions ?? [],
  Date.now(),
))

const attentionRows = computed<AttentionRow[]>(() =>
  waitItems.value.map(w => ({
    id: w.id,
    taskId: w.taskId ?? '',
    title: w.title,
    status: w.kind === 'task-review' ? 'review' : 'triage',
    severity: w.kind === 'task-review' ? 'medium' : 'low',
    priority: 1,
    createdAt: w.ts,
  })))

function onAttentionSelect(row: AttentionRow): void {
  // 动线④：注意力条 → 等我对象（任务→看板预选；运行→运行详情；fleet→工作台）
  const hit = waitItems.value.find(w => w.id === row.id)
  if (hit?.taskId) void router.push({ name: 'ia2.board', query: { task: hit.taskId } })
  else if (hit?.runId) void router.push({ name: 'ia2.runDetail', params: { runId: hit.runId } })
  else void router.push({ path: '/app' })
}

onMounted(() => {
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void bootShared()
  void cockpit.bootstrap()
  window.addEventListener('keydown', onKeydown)
  // 独立窗口「合并回驾驶舱」：storage 事件跨窗口广播，仅主壳导航。
  // standalone 面板窗不得响应——否则别的面板合并回时本面板被导航劫持串台
  mergeBackOff = listenMergeBack(path => {
    if (!standaloneActive) void router.push(path)
  })
})
onUnmounted(() => {
  shellDisposed = true
  workspace.unwatchKanbanTasks()
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
  cockpit.disconnectOnUnmount()
  window.removeEventListener('keydown', onKeydown)
  mergeBackOff?.()
  mergeBackOff = null
})

async function bootShared(): Promise<void> {
  await runsStore.fetchRuns()
  if (shellDisposed) return
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
}

const activeArea = computed(() => store.currentArea)
</script>

<template>
  <div class="ia-shell">
    <IaPopoutBar v-if="isStandalone" />
    <template v-else>
      <IaShellHeader
        v-if="!isMaximized"
        :notify-count="cockpit.inboxCount"
        :user-name="cockpit.currentUserName"
        @notify="cockpit.openNotify()"
      />
      <AttentionStrip
        v-if="!isMaximized && attentionRows.length > 0"
        :items="attentionRows"
        @select="onAttentionSelect"
      />
      <nav v-if="!isMaximized" class="ia-scenes" data-testid="ia-scenes">
        <router-link
          v-for="area in IA_AREAS"
          :key="area.key"
          :to="{ name: area.name }"
          class="ia-scenes__btn"
          :class="{ 'ia-scenes__btn--on': activeArea === area.key }"
          :data-testid="`ia-scene-${area.key}`"
        >{{ t(area.labelKey) }}</router-link>
        <!-- v12 双视图第二入口：IDE 工作台（独立壳 /ide，此处无高亮态） -->
        <router-link
          :to="{ name: 'ide.shell' }"
          class="ia-scenes__btn ia-scenes__btn--ide"
          data-testid="ia-scene-ide"
        >{{ t('ia2.shell.gotoIde') }}</router-link>
      </nav>
    </template>
    <div class="ia-shell__main">
      <router-view />
    </div>
    <button v-if="isMaximized" type="button" class="ia-shell__restore"
      data-testid="ia-wm-restore-pill" :title="t('ia2.wm.restore')" @click="exitMaximize"
    >⤡ {{ t('ia2.wm.restore') }}</button>
    <IaMinimizedDock v-if="!isStandalone" />

    <div v-if="cockpit.notifyOpen" class="ia-overlay" @click="cockpit.closeNotify()" />
    <CockpitNotifyModal v-if="cockpit.notifyOpen" />
    <div v-if="workspace.scheduleOpen" class="ia-overlay" @click="workspace.closeSchedule()" />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
    <div v-if="cockpit.runTraceOpen" class="ia-overlay" @click="cockpit.closeRunTrace()" />
    <CockpitRunTraceModal />
  </div>
</template>

<style scoped lang="scss">
/* v12 双视图第二入口与首入口的间隔（设计稿 §2.3：隔 10px + 1px 竖分隔线） */
.ia-scenes__btn--ide {
  margin-left: 10px;
  border-left: 1px solid var(--border-color);
  padding-left: 14px;
}
.ia-shell__restore {
  position: fixed; top: 10px; right: 14px; z-index: 40;
  height: 28px; padding: 0 12px; display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--border-color); border-radius: 14px;
  background: var(--bg-card); color: var(--text-secondary);
  cursor: pointer; font-size: 12px; font-family: inherit;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  opacity: 0.55; transition: opacity 0.15s ease;
  &:hover { opacity: 1; color: var(--text-primary); }
}
</style>
