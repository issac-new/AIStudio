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
import LoopGraph from '@/custom/loop/components/LoopGraph.vue'
import { buildMindScene, type MindNode } from '../adapters/mind'
import {
  aggregateActiveRuns, aggregateInbox, aggregateMetrics, buildTodayPlan, formatDuration,
  mergeAttention, type AttentionRow,
} from '../adapters/overview'
import type { LoopStatus } from '@/custom/loop/types'

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
  workspace.unwatchKanbanTasks()
  // workspace 流回收随 2026-09-14 重构由 IaShell 移入本视图（两处挂载点
  // /app 与 /hermes/loop 行为一致；InboxView 等子页自行武装，幂等停止）
  workspace.stopFleetStream()
  workspace.stopReminderScheduler()
})

async function boot(): Promise<void> {
  await runsStore.fetchRuns()
  // 生长图实时域：待介入全量 + 运行中（阶段推进经 /graph 订阅实时生长）
  const awaiting = runsStore.awaitingRuns.map(r => r.runId)
  const running = runsStore.sortedRuns.filter(r => r.status === 'running').map(r => r.runId)
  runsStore.syncVisibleRunIds([...awaiting, ...running].slice(0, SUBSCRIBE_CAP))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
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
const scene = computed(() => buildMindScene(loopStore.loops, runsStore.runs))

const activeLoopCount = computed(() => loopStore.loops.filter(l => l.status === 'running').length)
const statusCounts = computed(() => {
  const c = { running: 0, awaiting: 0, done: 0, failed: 0 }
  for (const r of runsStore.runs) {
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

const showGuide = computed(() =>
  booted.value && loopStore.loops.length === 0 && runsStore.runs.length === 0)

// ── 导航动作（活大脑只读观察：点击思想核/run 去看状态，不做人工编排） ──
function goTaskFromAttention(row: AttentionRow): void {
  void router.push({ path: '/app/tasks', query: { status: row.status, task: row.taskId } })
}
function onVizNode(node: MindNode): void {
  if (node.to) void router.push(node.to)
}
const goRuns = () => void router.push({ name: 'ia2.runs' })
const goInbox = () => void router.push({ name: 'ia2.inbox' })
const goTasks = (status: string) => void router.push({ path: '/app/tasks', query: { status } })
function goLoopRuns(id: string): void {
  void router.push({ name: 'ia2.runs', query: { loop: id } })
}

// ── 循环面板动作 ──
async function onTick(id: string): Promise<void> { await loopStore.tickLoop(id).catch(() => {}) }
async function onPause(id: string): Promise<void> { await loopStore.pauseLoop(id).catch(() => {}) }
async function onDelete(id: string): Promise<void> {
  if (!window.confirm(t('loopCockpit.loops.deleteConfirm'))) return
  await loopStore.deleteLoop(id).catch(() => {})
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

function loopStatusClass(status: LoopStatus): string {
  return `lcp-dot--${status}`
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
        <span class="lcp-kpi__label">{{ t('loopCockpit.kpi.loopsActive') }} / {{ loopStore.loops.length }}</span>
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

      <!-- 中：思维大脑舞台 -->
      <section class="lcp-stage" data-testid="lcp-stage">
        <MindViz :scene="scene" @node-click="onVizNode" />
        <div v-if="showGuide" class="lcp-stage__guide" data-testid="lcp-guide">
          <p class="lcp-stage__guide-text">{{ t('loopMind.viz.empty') }}</p>
          <div class="lcp-stage__guide-cta">
            <button type="button" class="lcp-btn" @click="goInbox">{{ t('loopMind.viz.emptyCta') }}</button>
          </div>
        </div>
        <div class="lcp-legend" data-testid="lcp-legend">
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--running" />{{ t('loopCockpit.viz.legendRunning') }} {{ statusCounts.running }}</span>
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--awaiting-review" />{{ t('loopCockpit.viz.legendAwaiting') }} {{ statusCounts.awaiting }}</span>
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--completed" />{{ t('loopCockpit.viz.legendDone') }} {{ statusCounts.done }}</span>
          <span class="lcp-legend__item"><i class="lcp-dot lcp-dot--failed" />{{ t('loopCockpit.viz.legendFailed') }} {{ statusCounts.failed }}</span>
          <span v-if="scene.hiddenLoops > 0" class="lcp-legend__item lcp-legend__dim">
            {{ t('loopCockpit.viz.moreLoops', { n: String(scene.hiddenLoops) }) }}
          </span>
        </div>
      </section>

      <!-- 右：循环面板 + 状态分布 + 今日计划 -->
      <aside class="lcp-panel lcp-panel--loops" data-testid="lcp-loops-panel">
        <div class="lcp-panel__head">
          <span>{{ t('loopMind.loops.title') }}</span>
          <span class="lcp-panel__count">{{ loopStore.loops.length }}</span>
        </div>

        <div
          v-if="loopStore.loops.length === 0 && !loopStore.loading"
          class="lcp-panel__empty"
          data-testid="lcp-loops-empty"
        >{{ t('loopMind.loops.empty') }}</div>
        <template v-else>
          <div class="lcp-loops-scroll">
            <div
              v-for="loop in loopStore.loops"
              :key="loop.id"
              class="lcp-loop-row"
              role="button"
              tabindex="0"
              @click="goLoopRuns(loop.id)"
              @keydown.enter="goLoopRuns(loop.id)"
            >
              <span class="lcp-dot" :class="loopStatusClass(loop.status)" />
              <span class="lcp-loop-row__name" :title="`${loop.name} · ${loop.goal}`">{{ loop.name }}</span>
              <LoopGraph class="lcp-loop-row__graph" :current-stage="loop.stage" :status="loop.status" :events="[]" compact />
              <span class="lcp-loop-row__actions" @click.stop @keydown.stop>
                <button type="button" :title="t('graph.actions.run')" @click="onTick(loop.id)"><span class="lcp-ico lcp-ico--run" /></button>
                <button type="button" :title="t('graph.actions.pause')" @click="onPause(loop.id)"><span class="lcp-ico lcp-ico--pause" /></button>
                <button type="button" :title="t('graph.actions.delete')" @click="onDelete(loop.id)"><span class="lcp-ico lcp-ico--trash" /></button>
              </span>
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
/* ── 驾驶舱容器：自带深色科技底（显式设计偏离，见 specs/2026-09-14 设计稿 D5） ── */
.lcp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  padding: 10px 14px 12px;
  gap: 8px;
  background:
    radial-gradient(1100px 520px at 18% -10%, rgba(34, 211, 238, 0.07), transparent 60%),
    radial-gradient(900px 460px at 92% 112%, rgba(167, 139, 250, 0.06), transparent 55%),
    linear-gradient(180deg, #0a1420 0%, #070d15 100%);
  color: #cfe6f5;
  overflow: hidden;
}

/* ═══ 页头 ═══ */
.lcp-top { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
.lcp-top__brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.lcp-top__mark {
  width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto;
  background: #22d3ee;
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.9), 0 0 26px rgba(34, 211, 238, 0.4);
  animation: lcp-throb 2.6s ease-in-out infinite;
}
@keyframes lcp-throb { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.lcp-top__titles { display: flex; flex-direction: column; min-width: 0; }
.lcp-top__title {
  margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 1px;
  color: #e8f6ff; white-space: nowrap;
}
.lcp-top__tagline { font-size: 10.5px; letter-spacing: 3px; text-transform: uppercase; color: rgba(103, 232, 249, 0.55); }

.lcp-top__status { display: flex; gap: 6px; margin-left: auto; align-items: center; }
.lcp-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 9px; border-radius: 999px; font-size: 11px;
  border: 1px solid rgba(148, 197, 226, 0.18); color: rgba(207, 230, 245, 0.8);
  font-variant-numeric: tabular-nums;
}
.lcp-pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.lcp-pill--on { color: #67e8f9; border-color: rgba(34, 211, 238, 0.4); }
.lcp-pill--on i { animation: lcp-throb 1.8s ease-in-out infinite; }
.lcp-pill--off { color: #94a3b8; }

.lcp-top__actions { display: flex; align-items: center; gap: 6px; }
.lcp-btn {
  padding: 5px 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid rgba(148, 197, 226, 0.22);
  background: rgba(15, 32, 48, 0.65); color: #cfe6f5;
  font-size: 12.5px; font-family: inherit; white-space: nowrap;
}
.lcp-btn:hover { border-color: rgba(34, 211, 238, 0.55); color: #e8f6ff; }
.lcp-btn--primary {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(59, 130, 246, 0.22));
  border-color: rgba(34, 211, 238, 0.55); color: #a5f3fc; font-weight: 600;
}
.lcp-btn--ghost { padding: 5px 9px; }
.lcp-more { position: relative; }
.lcp-more__menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 30;
  min-width: 132px; padding: 4px;
  border-radius: 8px; border: 1px solid rgba(34, 211, 238, 0.3);
  background: #0c1a28; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  display: flex; flex-direction: column;
}
.lcp-more__item {
  padding: 6px 10px; border: none; border-radius: 5px; background: transparent;
  color: #cfe6f5; font-size: 12.5px; text-align: left; cursor: pointer; font-family: inherit;
}
.lcp-more__item:hover { background: rgba(34, 211, 238, 0.12); }

/* ═══ KPI 条 ═══ */
.lcp-kpis {
  display: flex; gap: 8px; flex: 0 0 auto;
}
.lcp-kpi {
  flex: 1; min-width: 0; padding: 7px 12px 6px;
  border-radius: 8px; border: 1px solid rgba(148, 197, 226, 0.14);
  background: rgba(12, 26, 40, 0.55);
  display: flex; flex-direction: column; gap: 1px;
}
.lcp-kpi--alert { border-color: rgba(251, 191, 36, 0.4); background: rgba(251, 191, 36, 0.06); }
.lcp-kpi__num { font-size: 21px; font-weight: 700; color: #e8f6ff; font-variant-numeric: tabular-nums; line-height: 1.15; }
.lcp-kpi__num--cyan { color: #22d3ee; }
.lcp-kpi__num--amber { color: #fbbf24; }
.lcp-kpi__num--green { color: #34d399; }
.lcp-kpi__label { font-size: 10.5px; letter-spacing: 1px; color: rgba(148, 197, 226, 0.66); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ═══ 主体三栏 ═══ */
.lcp-main { flex: 1 1 auto; min-height: 0; display: flex; gap: 8px; }

.lcp-panel {
  display: flex; flex-direction: column; min-height: 0;
  border-radius: 10px; border: 1px solid rgba(148, 197, 226, 0.14);
  background: rgba(10, 21, 33, 0.72);
  overflow: hidden;
}
.lcp-panel--inbox { flex: 0 0 252px; }
.lcp-panel--loops { flex: 0 0 300px; }
.lcp-panel__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px 7px; font-size: 12px; letter-spacing: 1.5px;
  color: rgba(148, 197, 226, 0.85); border-bottom: 1px solid rgba(148, 197, 226, 0.1);
  flex: 0 0 auto;
}
.lcp-panel__more {
  border: none; background: transparent; color: #67e8f9; cursor: pointer;
  font-size: 11.5px; font-family: inherit; padding: 0;
}
.lcp-panel__count { font-size: 11px; color: rgba(148, 197, 226, 0.6); font-variant-numeric: tabular-nums; }
.lcp-panel__empty { padding: 14px 12px; font-size: 12px; color: rgba(148, 197, 226, 0.5); }
.lcp-panel__sub { flex: 0 0 auto; border-top: 1px solid rgba(148, 197, 226, 0.1); }
.lcp-panel__subhead { padding: 8px 12px 2px; font-size: 12px; letter-spacing: 1.5px; color: rgba(148, 197, 226, 0.85); }

/* 收件箱行 */
.lcp-inbox-row {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 12px; cursor: pointer; font-size: 12.5px;
  border-bottom: 1px solid rgba(148, 197, 226, 0.06);
}
.lcp-inbox-row:hover { background: rgba(251, 191, 36, 0.07); }
.lcp-inbox-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2eff9; }
.lcp-inbox-row__meta { font-size: 10.5px; color: rgba(251, 191, 36, 0.85); white-space: nowrap; font-variant-numeric: tabular-nums; }

/* 状态点（驾驶舱词表：loop 状态与 run 状态共用投影） */
.lcp-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.lcp-dot--running { background: #22d3ee; box-shadow: 0 0 6px rgba(34, 211, 238, 0.8); }
.lcp-dot--awaiting-review, .lcp-dot--awaiting-input { background: #fbbf24; box-shadow: 0 0 6px rgba(251, 191, 36, 0.7); }
.lcp-dot--blocked, .lcp-dot--failed { background: #f87171; box-shadow: 0 0 6px rgba(248, 113, 113, 0.7); }
.lcp-dot--completed { background: #34d399; }
.lcp-dot--paused { background: #a78bfa; }
.lcp-dot--idle { background: #64748b; }

/* ═══ 中央生长舞台 ═══ */
.lcp-stage {
  position: relative; flex: 1 1 auto; min-width: 0;
  border-radius: 10px; overflow: hidden;
  border: 1px solid rgba(34, 211, 238, 0.16);
}
.lcp-stage__guide {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(7, 13, 21, 0.45);
}
.lcp-stage__guide-text { margin: 0; max-width: 420px; text-align: center; color: #cfe6f5; font-size: 13.5px; line-height: 1.7; }
.lcp-stage__guide-cta { display: flex; gap: 8px; }

.lcp-legend {
  position: absolute; left: 10px; bottom: 8px; z-index: 4;
  display: flex; flex-wrap: wrap; gap: 12px;
  font-size: 11px; color: rgba(207, 230, 245, 0.75);
  font-variant-numeric: tabular-nums;
}
.lcp-legend__item { display: inline-flex; align-items: center; gap: 5px; }
.lcp-legend__dim { color: rgba(148, 197, 226, 0.5); }

/* ═══ 循环面板行 ═══ */
.lcp-loops-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.lcp-loop-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; cursor: pointer; font-size: 12.5px;
  border-bottom: 1px solid rgba(148, 197, 226, 0.06);
}
.lcp-loop-row:hover { background: rgba(34, 211, 238, 0.06); }
.lcp-loop-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2eff9; }
.lcp-loop-row__graph { flex: 0 0 auto; opacity: 0.9; }
.lcp-loop-row__actions { display: none; gap: 2px; }
.lcp-loop-row:hover .lcp-loop-row__actions, .lcp-loop-row:focus-within .lcp-loop-row__actions { display: flex; }
.lcp-loop-row__actions button {
  padding: 2px 5px; border: 1px solid rgba(148, 197, 226, 0.2); border-radius: 4px;
  background: transparent; cursor: pointer; display: inline-flex;
}
.lcp-loop-row__actions button:hover { border-color: rgba(34, 211, 238, 0.6); }
.lcp-ico { display: inline-block; width: 9px; height: 9px; border: 1.6px solid #9fd8ee; border-radius: 2px; }
.lcp-ico--run { border-style: solid; border-width: 5px 0 5px 8px; border-color: transparent transparent transparent #9fd8ee; border-radius: 0; width: 0; height: 0; }
.lcp-ico--pause { border-left: 3px solid #9fd8ee; border-right: 3px solid #9fd8ee; border-top: 0; border-bottom: 0; width: 7px; height: 9px; border-radius: 1px; }
.lcp-ico--trash { position: relative; border-radius: 0 0 3px 3px; }
.lcp-ico--trash::before {
  content: ''; position: absolute; top: -3.4px; left: -2.6px;
  width: 8px; height: 2px; background: #9fd8ee; border-radius: 1px;
}

/* 今日计划 */
.lcp-plan__list { padding: 2px 12px 8px; display: flex; flex-direction: column; gap: 3px; }
.lcp-plan__item { display: flex; align-items: center; gap: 6px; font-size: 12px; min-width: 0; }
.lcp-plan__kind { flex: 0 0 auto; font-size: 10px; padding: 0 5px; border-radius: 3px; background: rgba(34, 211, 238, 0.12); color: #67e8f9; }
.lcp-plan__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dbeaf6; }
.lcp-plan__time { flex: 0 0 auto; color: rgba(148, 197, 226, 0.6); font-variant-numeric: tabular-nums; }
.lcp-plan__item--overdue .lcp-plan__time { color: #f87171; }

/* 状态分布子卡透传暗色（组件自身卡片样式为浅色变量，此处仅收边距） */
.lcp-panel__sub :deep(.ia-card) { border-color: rgba(148, 197, 226, 0.12); background: transparent; }

@media (prefers-reduced-motion: reduce) {
  .lcp-top__mark, .lcp-pill--on i { animation: none; }
}
</style>
