<!-- overlay/custom/client/ia2/views/scenes/OpsScene.vue -->
<!-- 运维场景（2026-09-16 多视图重构）：值班/告警/工单——
     左 告警+工单分诊（inbox-center 五源聚合与 kv 分诊状态，/app/inbox 同源同键）；
     中 值班台（今日计划 + 进行中/待介入 runs 表）；右 快捷动作。
     零新增武装：runs/metrics/loops/workspace 流由壳统一武装（Task 3）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useWorkspaceStore } from '../../store/workspace'
import AlarmList from '../../components/AlarmList.vue'
import TriageQueue from '../../components/TriageQueue.vue'
import RunListTable from '@/custom/loop/runcenter/components/RunListTable.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'
import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import {
  buildTriageEntries, projectTriage,
  loadTriagedMap, markTriaged, unmarkTriaged, writeTriagedMap, pruneTriaged,
  loadResolvedMap, resolveEntry, pruneResolved, writeResolvedMap,
  type TriageEntry, type TriageProjection,
} from '../../adapters/inbox-center'
import { buildTodayPlan, localDateStr } from '../../adapters/overview'
import type { RunSummary } from '@/custom/loop/runcenter/types'

const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const workspace = useWorkspaceStore()

/** 视图时间锚（与 InboxView 同语义：挂载时刻为稳定基准） */
const nowTick = ref(Date.now())
const dayKey = computed(() => localDateStr(new Date(nowTick.value)))

// ── 本地 kv：已分诊 ∪ 自动归档（与 InboxView 同源同键，单一事实源；
//    挂载即裁剪写回——onMounted 时机与 InboxView 一致） ──
const triagedMap = ref<Record<string, string>>(
  pruneTriaged(loadTriagedMap(), dayKey.value))
const resolvedMap = ref(
  pruneResolved(loadResolvedMap(), nowTick.value))
onMounted(() => {
  writeTriagedMap(triagedMap.value)
  writeResolvedMap(resolvedMap.value)
})

// ── 五源聚合投影（纯函数，视图不自算） ──
const loopNames = computed<Record<string, string>>(() =>
  Object.fromEntries(loopStore.loops.map(l => [l.id, l.name])))

const entries = computed<TriageEntry[]>(() =>
  buildTriageEntries({
    approvals: runsStore.awaitingRuns,
    tasks: workspace.tasks,
    alarms: runsStore.metricsRaw?.loopEvents ?? [],
    reminders: workspace.userTodos,
  }, nowTick.value, dayKey.value, loopNames.value))

/** 审批离场自动记档（与 InboxView 同一规则：loading 窗口不判离场） */
watch(entries, (curr, prev) => {
  if (runsStore.loading) return
  const currIds = new Set(curr.map(e => e.id))
  for (const e of prev) {
    if (e.kind !== 'approval' || currIds.has(e.id)) continue
    resolvedMap.value = resolveEntry(e.id, e, new Date().toISOString())
  }
})

const projection = computed<TriageProjection>(() =>
  projectTriage(entries.value, {
    triaged: triagedMap.value,
    resolved: resolvedMap.value,
    dayKey: dayKey.value,
    now: nowTick.value,
  }))

const alarmEntries = computed(() => entries.value.filter(e => e.kind === 'alarm'))

function onTriage(entry: TriageEntry): void {
  triagedMap.value = markTriaged(entry.id, dayKey.value)
}
function onUntriage(entry: TriageEntry): void {
  triagedMap.value = unmarkTriaged(entry.id)
}
function onOpen(entry: TriageEntry): void {
  void router.push(entry.route)
}

// ── 值班台 ──
const todayPlan = computed(() =>
  buildTodayPlan(loopStore.loops, workspace.userTodos, new Date(nowTick.value)))
const activeRuns = computed(() =>
  runsStore.sortedRuns
    .filter(r => r.status === 'running' || r.status === 'awaiting-input')
    .slice(0, 12))

// 运行详情路由（2026-09-18 统一导航：/hermes/loop 壳家族退役，恒走 ia2.runDetail）
function onRunSelect(run: RunSummary): void {
  void router.push({ name: 'ia2.runDetail', params: { runId: run.runId } })
}
// 行内动作（approve/peek/replay 等）统一进详情页处理——详情页动作链完整，
// 值班台不复制（MVP 取舍，已声明）
function onRunAction(payload: { kind: string; run: RunSummary }): void {
  onRunSelect(payload.run)
}

// ── 快捷动作 ──
const wizardOpen = ref(false)
// 2026-09-18 统一导航 Task 3：协作中心落点 /hermes/cockpit 退役 → 协作场景
const goCockpit = () => void router.push({ name: 'ia2.collab' })

function planTimeLabel(at: number | null): string {
  if (at === null) return t('ia2.overview.planNoTime')
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <section class="ops" data-testid="scene-ops">
    <div class="ops__body">
      <!-- 左：告警 + 工单分诊 -->
      <aside class="ops__left">
        <AlarmList :entries="alarmEntries" @open="onOpen" />
        <div class="ops__triage">
          <TriageQueue
            :pending="projection.pending"
            :done="projection.done"
            :runs="runsStore.awaitingRuns"
            @triage="onTriage"
            @untriage="onUntriage"
            @open="onOpen"
          />
        </div>
      </aside>

      <!-- 中：值班台 -->
      <main class="ops__mid">
        <div class="ops__panel">
          <div class="ops__panel-head">{{ t('loopScenes.ops.duty') }} · {{ t('ia2.overview.todayPlan') }}</div>
          <div v-if="todayPlan.length === 0" class="ops__empty">{{ t('ia2.overview.planEmpty') }}</div>
          <div
            v-for="item in todayPlan.slice(0, 8)"
            :key="`${item.kind}-${item.id}`"
            class="ops__plan-row"
            :class="{ 'ops__plan-row--overdue': item.overdue }"
          >
            <span class="ops__plan-kind">{{ t(item.kind === 'loop' ? 'ia2.overview.planKindLoop' : 'ia2.overview.planKindTodo') }}</span>
            <span class="ops__plan-title" :title="item.title">{{ item.title }}</span>
            <span class="ops__plan-time">{{ planTimeLabel(item.at) }}</span>
          </div>
        </div>

        <div class="ops__panel ops__panel--runs">
          <div class="ops__panel-head">{{ t('loopScenes.ops.activeRuns') }}</div>
          <div class="ops__runs" data-testid="ops-runs">
            <RunListTable :runs="activeRuns" @select="onRunSelect" @action="onRunAction" />
          </div>
        </div>
      </main>

      <!-- 右：快捷动作 -->
      <aside class="ops__right">
        <div class="ops__panel-head">{{ t('loopScenes.ops.quickActions') }}</div>
        <button type="button" class="ops__action" data-testid="ops-new-loop" @click="wizardOpen = true">
          {{ t('loopScenes.ops.newLoop') }}</button>
        <button type="button" class="ops__action" data-testid="ops-schedule" @click="workspace.openSchedule()">
          {{ t('loopScenes.ops.schedule') }}</button>
        <button type="button" class="ops__action" data-testid="ops-cockpit" @click="goCockpit">
          {{ t('loopScenes.ops.cockpitLink') }} ›</button>
        <div class="ops__right-note">{{ t('loopCockpit.kpi.runsRunning') }} {{ activeRuns.length }}</div>
      </aside>
    </div>

    <LoopCreateWizard
      v-if="wizardOpen"
      @close="wizardOpen = false"
      @created="wizardOpen = false"
    />
    <CockpitScheduleModal v-if="workspace.scheduleOpen" />
  </section>
</template>

<style scoped>
.ops { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ops__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.ops__left {
  flex: 0 0 320px; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
}
.ops__triage { flex: 1 1 auto; min-height: 0; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-standard); }
.ops__mid { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.ops__panel {
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 10px 12px;
}
.ops__panel--runs { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ops__panel-head { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.ops__empty { font-size: 12px; color: var(--text-secondary); }
.ops__runs { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.ops__plan-row { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 0; }
.ops__plan-kind { flex: 0 0 auto; font-size: 10px; padding: 0 5px; border-radius: 3px; background: var(--bg-hover, var(--bg-card)); color: var(--color-primary, #3b82f6); }
.ops__plan-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.ops__plan-time { flex: 0 0 auto; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ops__plan-row--overdue .ops__plan-time { color: var(--color-danger, #e11d48); }
.ops__right {
  flex: 0 0 180px; display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); padding: 10px 12px;
}
.ops__action {
  padding: 6px 10px; border-radius: var(--radius-standard); cursor: pointer;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  font-size: 12px; font-family: inherit; text-align: left;
}
.ops__action:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.ops__right-note { margin-top: auto; font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
</style>
