<!-- overlay/custom/client/ia2/views/LoopCockpitView.vue -->
<!-- 循环驾驶舱 —— 2026-09-15 重设计（用户裁决：这是一个动态增长的活动思维大脑，
     不是人工编排的机械控制台）。
     中央 = 思维大脑 MindViz：核心神经元 + 思想核（循环/自建图）+ 突触末梢（运行）
     自适应生长——分支规模随阶段推进/迭代加成壮大、复用强度驱动突触可塑性、
     事件以记忆脉冲浮现褪色；不做人工编排入口。
     保留两侧驾驶舱读数（介入收件箱/KPI/循环面板）作为大脑的观测仪表。
     挂载点不变：/app（ia2.overview，登录默认落点）与 /hermes/loop（AppSidebar）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useWorkspaceStore } from '../store/workspace'
import AttentionStrip from '../components/AttentionStrip.vue'
import StatusDistributionCard from '../components/StatusDistributionCard.vue'
import MindViz from '../components/MindViz.vue'
import MindViz3D from '../components/MindViz3D.vue'
import { buildMindScene, type MindNode, type MindProjectionDto } from '../adapters/mind'
import type { Mind3DNode } from '../adapters/mind3d'
import { runRest } from '@/custom/loop/runcenter/api'
import {
  aggregateActiveRuns, aggregateInbox, aggregateMetrics, buildTodayPlan, formatDuration,
  mergeAttention, type AttentionRow,
} from '../adapters/overview'

const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const workspace = useWorkspaceStore()

/** 订阅域上限（awaiting + running 实时生长订阅；超出裁 running 尾部） */
const SUBSCRIBE_CAP = 30

// ── 时钟/相对时间基准（60s 步进，卸载即停） ──
const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
/** 首轮数据到位（空态引导防闪） */
const booted = ref(false)
/** 思维大脑数据源（kanban 运行史投影；null = 未加载/不可用 → 空态） */
const mindData = ref<MindProjectionDto | null>(null)
/** 看板事件退订句柄（思维大脑实时生长订阅） */
let mindUnsubscribe: (() => void) | null = null
const clockLabel = computed(() => {
  const d = new Date(nowTick.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})

onMounted(() => {
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 60_000)
  // workspace 待办/看板聚合（与原 OverviewView 同一武装序列，零新增轮询）
  workspace.loadTodos()
  workspace.startReminderScheduler()
  workspace.watchKanbanTasks()
  workspace.initFleetStream()
  void workspace.refreshAllBoards()
  void boot()
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (mindRefreshTimer) clearTimeout(mindRefreshTimer)
  mindUnsubscribe?.()   // 思维大脑实时生长订阅退订（防泄漏）
  mindUnsubscribe = null
  workspace.unwatchKanbanTasks()
  // workspace 流回收随 2026-09-14 重构由 IaShell 移入本视图（两处挂载点
  // /app 与 /hermes/loop 行为一致；InboxView 等子页自行武装，幂等停止）
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
})

/** 思维大脑投影刷新（实时生长：kanban 看板事件驱动重拉，非一次性快照） */
let mindRefreshTimer: ReturnType<typeof setTimeout> | null = null
async function refreshMind(): Promise<void> {
  try { mindData.value = await runRest.getMind() } catch { mindData.value = null }
}
function scheduleMindRefresh(): void {
  // 去抖 800ms（看板事件风暴不空转）
  if (mindRefreshTimer) clearTimeout(mindRefreshTimer)
  mindRefreshTimer = setTimeout(() => { void refreshMind() }, 800)
}

async function boot(): Promise<void> {
  await runsStore.fetchRuns()
  // 生长图实时域：待介入全量 + 运行中（阶段推进经 /graph 订阅实时生长）
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
  // 思维大脑：kanban 运行史投影（已有任务的运行数据）。失败不阻断其余仪表。
  await refreshMind()
  // 实时生长：看板事件驱动投影重拉（大脑随任务活动活起来，非一次性快照）
  mindUnsubscribe = workspace.onBoardEvent(scheduleMindRefresh)
  booted.value = true
}

// ── 投影（全部经纯函数适配器） ──
const attentionRows = computed<AttentionRow[]>(() =>
  mergeAttention(workspace.tasks.map(task => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority ?? null,
    createdAt: task.createdAt ?? null,
  }))))

const activeAgg = computed(() => aggregateActiveRuns(runsStore.runs))
const inboxAgg = computed(() => aggregateInbox(runsStore.runs, nowTick.value))
const metrics = computed(() =>
  aggregateMetrics(runsStore.metricsRaw, runsStore.metricsRaw?.collectedAt ?? nowTick.value))
const todayPlan = computed(() => buildTodayPlan(loopStore.loops, workspace.userTodos, new Date(nowTick.value)))
// 思维大脑场景：kanban 投影驱动（无数据/不可用 → 空场景，仅核心神经元）
const scene = computed(() => buildMindScene(mindData.value ?? { thoughts: [], runs: [], available: false }))

/** 思想核活跃数（有进行中/待介入运行的任务） */
const activeLoopCount = computed(() =>
  (mindData.value?.thoughts ?? []).filter(t => t.status === 'running' || t.status === 'awaiting-review').length)
const statusCounts = computed(() => {
  const c = { running: 0, awaiting: 0, done: 0, failed: 0 }
  for (const r of mindData.value?.runs ?? []) {
    if (r.status === 'running') c.running++
    else if (r.status === 'awaiting-input') c.awaiting++
    else if (r.status === 'completed') c.done++
    else if (r.status === 'failed') c.failed++
  }
  return c
})

/** 收件箱行（待决 run，最多 8 条；loop 名优先展示） */
const inboxRows = computed(() =>
  runsStore.pendingInboxRuns.slice(0, 8).map(run => ({
    run,
    name: loopStore.loops.find(l => l.id === run.graphId)?.name ?? run.graphId,
  })))

/** 空态引导（思维网络未形成：kanban 投影为空/不可用 + 无任何 run） */
const showGuide = computed(() =>
  booted.value && (mindData.value == null || mindData.value.thoughts.length === 0) && runsStore.runs.length === 0)

// ── 导航动作（活大脑只读观察：点击思想核/末梢去看任务详情，不做人工编排） ──
function goTaskFromAttention(row: AttentionRow): void {
  void router.push({ path: '/app/tasks', query: { status: row.status, task: row.taskId } })
}
function onVizNode(node: MindNode): void {
  if (node.to) void router.push(node.to)
}
function onViz3DNode(node: Mind3DNode): void {
  if (node.to) void router.push(node.to)
}
const goRuns = () => void router.push({ name: 'ia2.runs' })
const goInbox = () => void router.push({ name: 'ia2.inbox' })
const goTasks = (status: string) => void router.push({ path: '/app/tasks', query: { status } })
/** 思想核（任务）点击 → 工作项区预选该任务 */
function goThought(taskId: string): void {
  void router.push({ path: '/app/tasks', query: { task: taskId } })
}

/** 3D/2D 视图切换（默认 3D 立体图——用户裁决；2D 分区图为降级/对照） */
const viz3D = ref(true)

// ── 思想列表投影（kanban 任务 + 各自运行计数） ──
const mindThoughts = computed(() => {
  const thoughts = mindData.value?.thoughts ?? []
  // 活跃优先排序（与大脑皮层分布同一语义），再按标题稳定
  const rank = (s: string) => s === 'running' ? 0 : s === 'awaiting-review' ? 1 : s === 'blocked' ? 2 : s === 'completed' ? 3 : s === 'idle' ? 4 : 5
  return [...thoughts].sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title))
})
function thoughtRunCount(thoughtId: string): string {
  const n = (mindData.value?.runs ?? []).filter(r => r.thoughtId === thoughtId).length
  return n > 0 ? `×${n}` : ''
}
function thoughtDotClass(status: string): string {
  return `lcp-dot--${status}`
}

// ── 溢出菜单（次要入口收拢；活大脑已不需人工编排，编排区移出驾驶舱主链） ──
const moreOpen = ref(false)
const MORE_ITEMS = [
  { key: 'inbox', label: 'ia2.nav.inbox', go: goInbox },
  { key: 'tasks', label: 'ia2.nav.tasks', go: () => goTasks('') },
  { key: 'comms', label: 'ia2.nav.comms', go: () => void router.push({ name: 'ia2.comms' }) },
  { key: 'settings', label: 'ia2.nav.settings', go: () => void router.push('/hermes/settings') },
]

function planTimeLabel(at: number | null): string {
  if (at === null) return t('ia2.overview.planNoTime')
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

</script>

<template>
  <div class="lcp" data-testid="loop-cockpit">
    <!-- ═══ 页头：品牌 + 状态 + 动作（驾驶舱指令区） ═══ -->
    <header class="lcp-top">
      <div class="lcp-top__brand">
        <span class="lcp-top__mark" aria-hidden="true" />
        <div class="lcp-top__titles">
          <h2 class="lcp-top__title">{{ t('loopMind.title') }}</h2>
          <span class="lcp-top__tagline">{{ t('loopMind.tagline') }}</span>
        </div>
      </div>

      <div class="lcp-top__status">
        <span class="lcp-pill" :class="runsStore.connection === 'connected' ? 'lcp-pill--on' : 'lcp-pill--off'">
          <i />{{ runsStore.connection === 'connected' ? t('loopCockpit.status.connected') : t('loopCockpit.status.disconnected') }}
        </span>
        <span class="lcp-pill lcp-pill--time">{{ clockLabel }}</span>
      </div>

      <div class="lcp-top__actions">
        <button type="button" class="lcp-btn" data-testid="lcp-all-runs" @click="goRuns">
          {{ t('loopMind.viewRuns') }}
        </button>
        <div class="lcp-more">
          <button
            type="button"
            class="lcp-btn lcp-btn--ghost"
            data-testid="lcp-more"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >⋯</button>
          <div v-if="moreOpen" class="lcp-more__menu" data-testid="lcp-more-menu">
            <button
              v-for="item in MORE_ITEMS"
              :key="item.key"
              type="button"
              class="lcp-more__item"
              :data-testid="`lcp-more-${item.key}`"
              @click="moreOpen = false; item.go()"
            >{{ t(item.label) }}</button>
          </div>
        </div>
      </div>
    </header>

    <!-- ═══ 注意力条（有内容才占高） ═══ -->
    <AttentionStrip v-if="attentionRows.length > 0" :items="attentionRows" @select="goTaskFromAttention" />

    <!-- ═══ KPI 条 ═══ -->
    <div class="lcp-kpis" data-testid="lcp-kpis">
      <div class="lcp-kpi">
        <span class="lcp-kpi__num">{{ activeLoopCount }}</span>
        <span class="lcp-kpi__label">{{ t('loopCockpit.kpi.loopsActive') }} / {{ mindThoughts.length }}</span>
      </div>
      <div class="lcp-kpi">
        <span class="lcp-kpi__num lcp-kpi__num--cyan">{{ activeAgg.running }}</span>
        <span class="lcp-kpi__label">{{ t('loopCockpit.kpi.runsRunning') }}</span>
      </div>
      <div class="lcp-kpi" :class="{ 'lcp-kpi--alert': inboxAgg.awaiting > 0 }">
        <span class="lcp-kpi__num" :class="inboxAgg.awaiting > 0 ? 'lcp-kpi__num--amber' : ''">{{ inboxAgg.awaiting }}</span>
        <span class="lcp-kpi__label">{{ t('loopCockpit.kpi.awaiting') }}</span>
      </div>
      <div class="lcp-kpi">
        <span class="lcp-kpi__num lcp-kpi__num--green">{{ metrics.completed }}</span>
        <span class="lcp-kpi__label">{{ t('loopCockpit.kpi.done7d') }}</span>
      </div>
      <div class="lcp-kpi">
        <span class="lcp-kpi__num">{{ metrics.avgDurationMs == null ? '—' : formatDuration(metrics.avgDurationMs) }}</span>
        <span class="lcp-kpi__label">{{ t('loopCockpit.kpi.avg7d') }}</span>
      </div>
    </div>

    <!-- ═══ 主体三栏 ═══ -->
    <div class="lcp-main">
      <!-- 左：介入收件箱 -->
      <aside class="lcp-panel lcp-panel--inbox" data-testid="lcp-inbox-panel">
        <div class="lcp-panel__head">
          <span>{{ t('loopCockpit.inbox.title') }}</span>
          <button v-if="inboxAgg.awaiting > 0" type="button" class="lcp-panel__more" @click="goInbox">
            {{ t('loopCockpit.inbox.all') }} ›
          </button>
        </div>
        <div v-if="inboxRows.length === 0" class="lcp-panel__empty">{{ t('loopCockpit.inbox.empty') }}</div>
        <div
          v-for="{ run, name } in inboxRows"
          :key="run.runId"
          class="lcp-inbox-row"
          role="button"
          tabindex="0"
          @click="router.push({ name: 'ia2.runDetail', params: { runId: run.runId } })"
          @keydown.enter="router.push({ name: 'ia2.runDetail', params: { runId: run.runId } })"
        >
          <span class="lcp-dot lcp-dot--awaiting-review" />
          <span class="lcp-inbox-row__name" :title="name">{{ name }}</span>
          <span class="lcp-inbox-row__meta">{{ run.stage ? t(`runcenter.stage.${run.stage}`) : '' }}·{{ run.iteration }}</span>
        </div>
      </aside>

      <!-- 中：思维图谱舞台（3D 立体 / 2D 分区可切换） -->
      <section class="lcp-stage" data-testid="lcp-stage">
        <!-- 2D/3D 切换 -->
        <div class="lcp-viz-toggle" data-testid="lcp-viz-toggle">
          <button
            type="button"
            class="lcp-viz-toggle__btn"
            :class="{ 'lcp-viz-toggle__btn--on': viz3D }"
            data-testid="lcp-viz-3d"
            @click="viz3D = true"
          >{{ t('loopMind.view3d') }}</button>
          <button
            type="button"
            class="lcp-viz-toggle__btn"
            :class="{ 'lcp-viz-toggle__btn--on': !viz3D }"
            data-testid="lcp-viz-2d"
            @click="viz3D = false"
          >{{ t('loopMind.view2d') }}</button>
        </div>

        <MindViz3D
          v-if="viz3D"
          :projection="mindData ?? { thoughts: [], runs: [], available: false }"
          @node-click="onViz3DNode"
          @fallback-2d="viz3D = false"
        />
        <MindViz v-else :scene="scene" @node-click="onVizNode" />

        <div v-if="showGuide" class="lcp-stage__guide" data-testid="lcp-guide">
          <p class="lcp-stage__guide-text">{{ t('loopMind.viz.empty') }}</p>
          <div class="lcp-stage__guide-cta">
            <button type="button" class="lcp-btn" @click="goInbox">{{ t('loopMind.viz.emptyCta') }}</button>
          </div>
        </div>
        <div v-if="!viz3D" class="lcp-legend" data-testid="lcp-legend">
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--running" />{{ t('loopCockpit.viz.legendRunning') }} {{ statusCounts.running }}</span>
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--awaiting-review" />{{ t('loopCockpit.viz.legendAwaiting') }} {{ statusCounts.awaiting }}</span>
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--completed" />{{ t('loopCockpit.viz.legendDone') }} {{ statusCounts.done }}</span>
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--failed" />{{ t('loopCockpit.viz.legendFailed') }} {{ statusCounts.failed }}</span>
          <span v-if="scene.hiddenLoops > 0" class="lcp-legend__item lcp-legend__dim">
            {{ t('loopCockpit.viz.moreLoops', { n: String(scene.hiddenLoops) }) }}
          </span>
        </div>
      </section>

      <!-- 右：思想列表面板（已有任务）+ 状态分布 + 今日计划 -->
      <aside class="lcp-panel lcp-panel--loops" data-testid="lcp-loops-panel">
        <div class="lcp-panel__head">
          <span>{{ t('loopMind.loops.title') }}</span>
          <span class="lcp-panel__count">{{ mindThoughts.length }}</span>
        </div>

        <div
          v-if="mindThoughts.length === 0 && booted"
          class="lcp-panel__empty"
          data-testid="lcp-loops-empty"
        >{{ t('loopMind.loops.empty') }}</div>
        <template v-else>
          <div class="lcp-loops-scroll">
            <div
              v-for="thought in mindThoughts"
              :key="thought.id"
              class="lcp-loop-row"
              role="button"
              tabindex="0"
              @click="goThought(thought.id)"
              @keydown.enter="goThought(thought.id)"
            >
              <span class="lcp-dot" :class="thoughtDotClass(thought.status)" />
              <span class="lcp-loop-row__name" :title="thought.title">{{ thought.title }}</span>
              <span class="lcp-loop-row__meta">{{ thoughtRunCount(thought.id) }}</span>
            </div>
          </div>

          <div class="lcp-panel__sub">
            <StatusDistributionCard :tasks="workspace.tasks" @open="goTasks" />
          </div>

          <div class="lcp-panel__sub lcp-plan" data-testid="lcp-plan">
            <div class="lcp-panel__subhead">{{ t('ia2.overview.todayPlan') }}</div>
            <div v-if="todayPlan.length === 0" class="lcp-panel__empty">{{ t('ia2.overview.planEmpty') }}</div>
            <div v-else class="lcp-plan__list">
              <div
                v-for="item in todayPlan.slice(0, 6)"
                :key="`${item.kind}-${item.id}`"
                class="lcp-plan__item"
                :class="{ 'lcp-plan__item--overdue': item.overdue }"
              >
                <span class="lcp-plan__kind">{{ t(item.kind === 'loop' ? 'ia2.overview.planKindLoop' : 'ia2.overview.planKindTodo') }}</span>
                <span class="lcp-plan__title" :title="item.title">{{ item.title }}</span>
                <span class="lcp-plan__time">{{ planTimeLabel(item.at) }}</span>
              </div>
            </div>
          </div>
        </template>
      </aside>
    </div>

  </div>
</template>

<style scoped>
/* ── 驾驶舱容器：全局 Pure Ink 变量（浅色体系，与 app 整体一致；2026-09-15 用户
     反馈修正——去除自带的深色科技底） ── */
.lcp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  padding: 12px 16px;
  gap: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
}

/* ═══ 页头 ═══ */
.lcp-top { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
.lcp-top__brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.lcp-top__mark {
  width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto;
  background: var(--color-primary, #3b82f6);
  animation: lcp-throb 2.6s ease-in-out infinite;
}
@keyframes lcp-throb { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.lcp-top__titles { display: flex; flex-direction: column; min-width: 0; }
.lcp-top__title {
  margin: 0; font-size: 16px; font-weight: 600;
  color: var(--text-primary); white-space: nowrap;
}
.lcp-top__tagline { font-size: 11px; color: var(--text-secondary); }

.lcp-top__status { display: flex; gap: 6px; margin-left: auto; align-items: center; }
.lcp-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 9px; border-radius: 999px; font-size: 11px;
  border: 1px solid var(--border-color); color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.lcp-pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.lcp-pill--on { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }
.lcp-pill--on i { animation: lcp-throb 1.8s ease-in-out infinite; }
.lcp-pill--off { color: var(--color-text-secondary, #878c99); }

.lcp-top__actions { display: flex; align-items: center; gap: 6px; }
.lcp-btn {
  padding: 5px 12px; border-radius: var(--radius-standard); cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary)); color: var(--text-primary);
  font-size: 12.5px; font-family: inherit; white-space: nowrap;
}
.lcp-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.lcp-btn--ghost { padding: 5px 9px; }
.lcp-more { position: relative; }
.lcp-more__menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 30;
  min-width: 132px; padding: 4px;
  border-radius: var(--radius-standard); border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary)); box-shadow: var(--shadow-card, 0 4px 16px rgba(0,0,0,0.12));
  display: flex; flex-direction: column;
}
.lcp-more__item {
  padding: 6px 10px; border: none; border-radius: var(--radius-standard); background: transparent;
  color: var(--text-primary); font-size: 12.5px; text-align: left; cursor: pointer; font-family: inherit;
}
.lcp-more__item:hover { background: var(--bg-hover, var(--bg-card)); }

/* ═══ KPI 条 ═══ */
.lcp-kpis { display: flex; gap: 10px; flex: 0 0 auto; }
.lcp-kpi {
  flex: 1; min-width: 0; padding: 8px 12px;
  border-radius: var(--radius-standard); border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary));
  display: flex; flex-direction: column; gap: 2px;
}
.lcp-kpi--alert { border-color: var(--color-warning, #f59e0b); }
.lcp-kpi__num { font-size: 20px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.2; }
.lcp-kpi__num--cyan { color: var(--color-primary, #3b82f6); }
.lcp-kpi__num--amber { color: var(--color-warning, #f59e0b); }
.lcp-kpi__num--green { color: var(--color-success, #28bf5c); }
.lcp-kpi__label { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ═══ 主体三栏 ═══ */
.lcp-main { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }

.lcp-panel {
  display: flex; flex-direction: column; min-height: 0;
  border-radius: var(--radius-standard); border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary));
  overflow: hidden;
}
.lcp-panel--inbox { flex: 0 0 252px; }
.lcp-panel--loops { flex: 0 0 300px; }
.lcp-panel__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px 7px; font-size: 12px; font-weight: 600;
  color: var(--text-primary); border-bottom: 1px solid var(--border-color);
  flex: 0 0 auto;
}
.lcp-panel__more {
  border: none; background: transparent; color: var(--color-primary, #3b82f6); cursor: pointer;
  font-size: 11.5px; font-family: inherit; padding: 0;
}
.lcp-panel__count { font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.lcp-panel__empty { padding: 14px 12px; font-size: 12px; color: var(--text-secondary); }
.lcp-panel__sub { flex: 0 0 auto; border-top: 1px solid var(--border-color); }
.lcp-panel__subhead { padding: 8px 12px 2px; font-size: 12px; font-weight: 600; color: var(--text-primary); }

/* 收件箱行 */
.lcp-inbox-row {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 12px; cursor: pointer; font-size: 12.5px;
  border-bottom: 1px solid var(--border-color);
}
.lcp-inbox-row:hover { background: var(--bg-hover, var(--bg-card)); }
.lcp-inbox-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.lcp-inbox-row__meta { font-size: 10.5px; color: var(--color-warning, #f59e0b); white-space: nowrap; font-variant-numeric: tabular-nums; }

/* 状态点（全局状态变量词表） */
.lcp-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.lcp-dot--running { background: var(--color-primary, #3b82f6); }
.lcp-dot--awaiting-review, .lcp-dot--awaiting-input { background: var(--color-warning, #f59e0b); }
.lcp-dot--blocked, .lcp-dot--failed { background: var(--color-danger, #e11d48); }
.lcp-dot--completed { background: var(--color-success, #28bf5c); }
.lcp-dot--paused { background: var(--color-text-secondary, #878c99); }
.lcp-dot--idle { background: var(--border-color); }

/* ═══ 中央思维舞台 ═══ */
.lcp-stage {
  position: relative; flex: 1 1 auto; min-width: 0;
  border-radius: var(--radius-standard); overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
}
.lcp-stage__guide {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: var(--bg-primary);
}
.lcp-stage__guide-text { margin: 0; max-width: 420px; text-align: center; color: var(--text-primary); font-size: 13.5px; line-height: 1.7; }
.lcp-stage__guide-cta { display: flex; gap: 8px; }

/* 图例升级为语义说明（什么颜色=什么状态） */
.lcp-legend {
  position: absolute; left: 10px; bottom: 8px; z-index: 4;
  display: flex; flex-wrap: wrap; gap: 12px;
  font-size: 11px; color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  background: var(--bg-card, var(--bg-primary));
  padding: 4px 10px; border-radius: var(--radius-standard);
  border: 1px solid var(--border-color);
}
.lcp-legend__item { display: inline-flex; align-items: center; gap: 5px; }
.lcp-legend__dim { color: var(--color-text-secondary, #878c99); }

/* ═══ 思想列表行（kanban 任务） ═══ */
.lcp-loops-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.lcp-loop-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; cursor: pointer; font-size: 12.5px;
  border-bottom: 1px solid var(--border-color);
}
.lcp-loop-row:hover { background: var(--bg-hover, var(--bg-card)); }
.lcp-loop-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.lcp-loop-row__meta { flex: 0 0 auto; font-size: 10.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

/* 今日计划 */
.lcp-plan__list { padding: 2px 12px 8px; display: flex; flex-direction: column; gap: 3px; }
.lcp-plan__item { display: flex; align-items: center; gap: 6px; font-size: 12px; min-width: 0; }
.lcp-plan__kind { flex: 0 0 auto; font-size: 10px; padding: 0 5px; border-radius: 3px; background: var(--bg-hover, var(--bg-card)); color: var(--color-primary, #3b82f6); }
.lcp-plan__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.lcp-plan__time { flex: 0 0 auto; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.lcp-plan__item--overdue .lcp-plan__time { color: var(--color-danger, #e11d48); }

/* 2D/3D 视图切换 */
.lcp-viz-toggle {
  position: absolute; top: 10px; right: 10px; z-index: 6;
  display: flex; gap: 2px;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 2px;
}
.lcp-viz-toggle__btn {
  padding: 3px 10px; border: none; border-radius: calc(var(--radius-standard) - 2px);
  background: transparent; color: var(--text-secondary);
  font-size: 11px; font-family: inherit; cursor: pointer;
}
.lcp-viz-toggle__btn:hover { color: var(--color-primary, #3b82f6); }
.lcp-viz-toggle__btn--on { background: var(--color-primary, #3b82f6); color: var(--bg-primary); font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  .lcp-top__mark, .lcp-pill--on i { animation: none; }
}
</style>
