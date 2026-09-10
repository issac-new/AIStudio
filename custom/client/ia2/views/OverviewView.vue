<!-- overlay/custom/client/ia2/views/OverviewView.vue -->
<!-- 总览（登录默认落点）：注意力条 → 四卡片一行（活跃运行/等你决策/今日日程/
     关键指标）+ 工作项状态分布 → 今日计划列表（到期 loop + 今日待办）→ 空态三步
     引导（R4 首屏不空）。通知克制（R4/§7B.1）：只聚合不推送；挂载期一次性武装
     数据源，零新增轮询——注意力走 workspace 既有聚合 WS（board 事件 → 去抖刷新），
     awaiting 域走 runs store /graph 订阅（可见页=介入集），指标走 fetchMetrics
     （5 分钟 TTL 缓存）。Task 8：cockpit store 退役，数据源改挂 workspace store。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useWorkspaceStore } from '../store/workspace'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import AttentionStrip from '../components/AttentionStrip.vue'
import ActiveRunsCard from '../components/ActiveRunsCard.vue'
import InboxPreviewCard from '../components/InboxPreviewCard.vue'
import ScheduleCard from '../components/ScheduleCard.vue'
import MetricsCards from '../components/MetricsCards.vue'
import StatusDistributionCard from '../components/StatusDistributionCard.vue'
import {
  aggregateActiveRuns, aggregateInbox, aggregateMetrics, buildTodayPlan, mergeAttention,
  type AttentionRow,
} from '../adapters/overview'
import '@/custom/ia2/styles/ia2.scss'

const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const workspace = useWorkspaceStore()

/** 首屏时间锚：挂载时刻（相对时间/今日判定的稳定基准，随重挂载刷新） */
const nowTick = ref(Date.now())
/** 首轮 runs 数据到位（空态引导防闪：首拉完成前不判空） */
const booted = ref(false)

onMounted(() => {
  // workspace 待办：kv 是单一事实源，装载词表与 cockpit 同一（复用 cockpit-kv，零复制）
  workspace.loadTodos()
  workspace.startReminderScheduler()   // 待办闹钟调度（幂等）
  workspace.watchKanbanTasks()         // 看板页编辑 → 轻量去抖同步聚合
  workspace.initFleetStream()          // 既有 kanban 聚合 WS——board 事件驱动 refreshAllBoards
  void workspace.refreshAllBoards()    // 一次性看板拉取（内建 2s 防抖）
  void bootRuns()
})

async function bootRuns(): Promise<void> {
  await runsStore.fetchRuns()
  // 介入域订阅（P3 台账 #2 的"可见页"域在总览的投影 = awaiting 集）：
  // 状态流转（awaiting→running 等）经 /graph 订阅实时反映到卡片数字
  runsStore.syncVisibleRunIds(runsStore.awaitingRuns.map(r => r.runId))
  void runsStore.fetchMetrics()
  void loopStore.fetchLoops()
  booted.value = true
}

// ── 视图投影（全部经 adapters 纯函数，视图不自算）──
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

/** 空态引导（R4）：零 run 零任务时出现；任一数据存在即消失 */
const showGuide = computed(() =>
  booted.value && runsStore.runs.length === 0 && workspace.tasks.length === 0)

const metricsLoading = computed(() => runsStore.metricsLoading && !runsStore.metricsRaw)

// ── 动作 ──
const goRuns = () => void router.push('/app/runs')
const goInbox = () => void router.push('/app/inbox')
const goTasks = () => void router.push('/app/tasks')
/** 状态分布行点击 → 工作项区带状态预选（TasksView.applyQuery 词表校验，非法忽略） */
const goTaskByStatus = (status: string) =>
  void router.push({ path: '/app/tasks', query: { status } })
const goOrchestrate = () => void router.push('/app/orchestrate')
const openSchedule = () => workspace.openSchedule()

// 注意力条点击 → 工作项区带筛选预选（P3 Task 7 欠账清偿）：
// status = 注意力梯队（blocked/review/triage 均为合法 kanban 状态，TasksView 端再做词表校验）
// task = 搜索框预选该任务 id（看板过滤到目标任务，落点即焦点）
function goTaskFromAttention(row: AttentionRow): void {
  void router.push({
    path: '/app/tasks',
    query: { status: row.status, task: row.taskId },
  })
}

const GUIDE_STEPS = ['ia2.overview.guideStep1', 'ia2.overview.guideStep2', 'ia2.overview.guideStep3']

function planTimeLabel(at: number | null): string {
  if (at === null) return t('ia2.overview.planNoTime')
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <div class="ia-area ia-overview">
    <AttentionStrip :items="attentionRows" @select="goTaskFromAttention" />

    <div class="ia-overview__body">
      <section v-if="showGuide" class="ia-guide" data-testid="ia-guide">
        <div class="ia-guide__title">{{ t('ia2.overview.guideTitle') }}</div>
        <ol class="ia-guide__steps">
          <li v-for="(step, i) in GUIDE_STEPS" :key="step" class="ia-guide__step">
            <span class="ia-guide__num">{{ i + 1 }}</span>
            <span class="ia-guide__text">{{ t(step) }}</span>
          </li>
        </ol>
        <button type="button" class="ia-guide__cta" @click="goOrchestrate">
          {{ t('ia2.overview.guideCta') }}
        </button>
      </section>

      <div class="ia-overview__cards">
        <ActiveRunsCard :agg="activeAgg" :now="nowTick" @open="goRuns" />
        <InboxPreviewCard :agg="inboxAgg" :now="nowTick" @open="goInbox" />
        <ScheduleCard :todos="workspace.userTodos" :now-ms="nowTick" @open="openSchedule" />
        <MetricsCards :metrics="metrics" :loading="metricsLoading" />
      </div>

      <!-- 观察者聚合最小版（P3 Task 8）：TaskLifecycleView 生命周期漏斗的等价收编
           ——跨任务状态分布条形图（useTaskLifecycle.statusCounts，纯前端聚合零新 API） -->
      <StatusDistributionCard :tasks="workspace.tasks" @open="goTaskByStatus" />

      <section class="ia-plan" data-testid="ia-plan">
        <div class="ia-plan__head">{{ t('ia2.overview.todayPlan') }}</div>
        <div v-if="todayPlan.length === 0" class="ia-plan__empty">{{ t('ia2.overview.planEmpty') }}</div>
        <div v-else class="ia-plan__list">
          <div
            v-for="item in todayPlan"
            :key="`${item.kind}-${item.id}`"
            class="ia-plan__item"
            :class="{ 'ia-plan__item--overdue': item.overdue }"
          >
            <span class="ia-plan__kind">
              {{ t(item.kind === 'loop' ? 'ia2.overview.planKindLoop' : 'ia2.overview.planKindTodo') }}
            </span>
            <span class="ia-plan__title">{{ item.title }}</span>
            <span v-if="item.overdue" class="ia-plan__overdue">{{ t('ia2.overview.planOverdue') }}</span>
            <span class="ia-plan__time">{{ planTimeLabel(item.at) }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- 日程弹窗：workspace 单例状态承载，弹窗本体复用（cockpit 组件保留复用） -->
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
  </div>
</template>
