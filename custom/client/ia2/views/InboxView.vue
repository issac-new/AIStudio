<!-- overlay/custom/client/ia2/views/InboxView.vue -->
<!-- 介入中心（P3 Task 5，§8 介入 + §7B.4 Triage + §7B.1 通知克制）：
     五源聚合收件箱——①审批/中断（runs store awaiting 域，既有 /graph 订阅）
     ②阻塞 ③待审（cockpit 跨 board 聚合任务，既有聚合 WS）④熔断/停滞告警
     （runs store fetchMetrics 的 loop 事件切片，5 分钟 TTL 既有通道）
     ⑤待办提醒（cockpit userTodos，kv 单一事实源）——零新轮询。
     布局：分组侧栏（按源筛选 + 告警列表）+ Triage 主视图（今日待分诊 /
     已分诊两态）。分诊标记与自动归档走本地 kv（日切重置 / 7 天衰减）；
     审批条目随 run 恢复离场时自动记档（批准后条目流转）。
     通知克制：本区域只聚合不推送，桌面横幅逻辑维持现状。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { loadUserTodos } from '@/custom/cockpit/store/cockpit-kv'
import TriageQueue from '../components/TriageQueue.vue'
import AlarmList from '../components/AlarmList.vue'
import {
  buildTriageEntries, projectTriage,
  loadTriagedMap, markTriaged, unmarkTriaged, writeTriagedMap, pruneTriaged,
  loadResolvedMap, resolveEntry, pruneResolved, writeResolvedMap,
  type TriageEntry, type TriageKind, type TriageProjection,
} from '../adapters/inbox-center'
import { localDateStr } from '../adapters/overview'
import '@/custom/ia2/styles/ia2.scss'

const router = useRouter()
const { t } = useI18n()
const runsStore = useRunCenterStore()
const loopStore = useLoopStore()
const cockpit = useCockpitStore()

/** 视图时间锚：挂载时刻（等待时长/今日判定的稳定基准，随重挂载刷新） */
const nowTick = ref(Date.now())
const dayKey = computed(() => localDateStr(new Date(nowTick.value)))

// ── 本地 kv：已分诊（日切重置）∪ 自动归档（7 天衰减）──
// 挂载即裁剪写回：过期日切键与超窗归档不落kv（读取层本就过滤，写回防无界）
const triagedMap = ref<Record<string, string>>(
  pruneTriaged(loadTriagedMap(), localDateStr(new Date(nowTick.value))),
)
const resolvedMap = ref(
  pruneResolved(loadResolvedMap(), nowTick.value),
)

onMounted(() => {
  writeTriagedMap(triagedMap.value)
  writeResolvedMap(resolvedMap.value)
  // cockpit 待办：kv 单一事实源 + 既有闹钟调度/看板聚合 WS（与总览同款武装，幂等）
  cockpit.userTodos = loadUserTodos()
  cockpit.startReminderScheduler()
  cockpit.initFleetStream()
  void cockpit.refreshAllBoards()
  void boot()
})

async function boot(): Promise<void> {
  await runsStore.fetchRuns()
  void runsStore.fetchMetrics()   // 告警源通道（TTL 缓存，非轮询）
  void loopStore.fetchLoops()     // 告警条目的 loop 名
}

// 介入域订阅 = awaiting 集（"可见页"投影在本视图的持续跟进）：run 流转进出
// awaiting 时重发订阅域（服务端 join 幂等）；响应式驱动，零新轮询
watch(() => runsStore.awaitingRuns.map(r => r.runId), (ids) => {
  runsStore.syncVisibleRunIds(ids)
})

// ── 五源聚合（adapters 纯函数归一，视图不自算）──
const loopNames = computed<Record<string, string>>(() =>
  Object.fromEntries(loopStore.loops.map(l => [l.id, l.name])))

const entries = computed<TriageEntry[]>(() =>
  buildTriageEntries({
    approvals: runsStore.awaitingRuns,
    tasks: cockpit.tasks,
    alarms: runsStore.metricsRaw?.loopEvents ?? [],
    reminders: cockpit.userTodos,
  }, nowTick.value, dayKey.value, loopNames.value))

/** 自动归档：审批条目随 run 恢复离场（批准/拒绝/超时）→ 记档快照，
 *  已分诊视图保留 7 天；同一 run 再次中断（reject→repair 重开 / escalation
 *  重试）后二次离场时覆盖式重记——快照 ts 与内容始终是最近一次离场，
 *  衰减窗口从最新离场起算，done 不残留首次旧 ts */
watch(entries, (curr, prev) => {
  const currIds = new Set(curr.map(e => e.id))
  for (const e of prev) {
    if (e.kind !== 'approval' || currIds.has(e.id)) continue
    resolvedMap.value = resolveEntry(e.id, e, new Date().toISOString())
  }
})

// ── 分诊两视图 + 源筛选 ──
const projection = computed<TriageProjection>(() =>
  projectTriage(entries.value, {
    triaged: triagedMap.value,
    resolved: resolvedMap.value,
    dayKey: dayKey.value,
    now: nowTick.value,
  }))

type SourceFilter = 'all' | TriageKind
const filter = ref<SourceFilter>('all')

const SOURCE_KINDS: TriageKind[] = ['approval', 'blocked', 'review', 'alarm', 'reminder']

/** 侧栏计数：待分诊口径（要处理的事才数） */
const countByKind = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const e of projection.value.pending) m[e.kind] = (m[e.kind] ?? 0) + 1
  return m
})

const filteredPending = computed(() =>
  filter.value === 'all'
    ? projection.value.pending
    : projection.value.pending.filter(e => e.kind === filter.value))
const filteredDone = computed(() =>
  filter.value === 'all'
    ? projection.value.done
    : projection.value.done.filter(d => d.entry.kind === filter.value))

const alarmEntries = computed(() => entries.value.filter(e => e.kind === 'alarm'))

// ── 动作 ──
function onTriage(entry: TriageEntry): void {
  triagedMap.value = markTriaged(entry.id, dayKey.value)
}
function onUntriage(entry: TriageEntry): void {
  triagedMap.value = unmarkTriaged(entry.id)
}
function onOpen(entry: TriageEntry): void {
  void router.push(entry.route)
}
function groupLabel(kind: SourceFilter): string {
  return kind === 'all' ? t('ia2.inbox.groupAll') : t(`ia2.inbox.kind.${kind}`)
}
</script>

<template>
  <div class="ia-area ia-inbox">
    <header class="ia-inbox__head">
      <h2 class="ia-inbox__title">{{ t('ia2.inbox.title') }}</h2>
      <span v-if="runsStore.error" class="ia-inbox__error">{{ runsStore.error }}</span>
    </header>

    <div class="ia-inbox__body">
      <!-- 分组侧栏：按源筛选 -->
      <aside class="ia-inbox__side">
        <div class="ia-inbox__side-head">{{ t('ia2.inbox.sidebarTitle') }}</div>
        <nav class="ia-inbox__groups">
          <button
            class="ia-inbox__group"
            :class="{ 'ia-inbox__group--active': filter === 'all' }"
            @click="filter = 'all'"
          >
            <span class="ia-inbox__group-label">{{ t('ia2.inbox.groupAll') }}</span>
            <span class="ia-inbox__group-count">{{ projection.pending.length }}</span>
          </button>
          <button
            v-for="kind in SOURCE_KINDS"
            :key="kind"
            class="ia-inbox__group"
            :class="[`ia-inbox__group--${kind}`, { 'ia-inbox__group--active': filter === kind }]"
            @click="filter = kind"
          >
            <span class="ia-inbox__group-label">{{ t(`ia2.inbox.kind.${kind}`) }}</span>
            <span v-if="countByKind[kind]" class="ia-inbox__group-count">{{ countByKind[kind] }}</span>
          </button>
        </nav>

        <AlarmList :entries="alarmEntries" @open="onOpen" />
      </aside>

      <!-- 主视图：Triage 分诊队列 -->
      <main class="ia-inbox__main">
        <TriageQueue
          :pending="filteredPending"
          :done="filteredDone"
          :runs="runsStore.awaitingRuns"
          @triage="onTriage"
          @untriage="onUntriage"
          @open="onOpen"
        />
      </main>
    </div>
  </div>
</template>

<style scoped>
.ia-inbox__head {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 14px 16px 0;
}
.ia-inbox__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.ia-inbox__error {
  font-size: 12px;
  color: var(--error, var(--color-danger, #e11d48));
  word-break: break-all;
}
.ia-inbox__body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 12px 16px 16px;
}
.ia-inbox__side {
  flex: 0 0 200px;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 12px;
  border-right: 1px solid var(--border-color);
}
.ia-inbox__side-head {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.ia-inbox__groups {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ia-inbox__group {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-left: 3px solid transparent;
  border-radius: var(--radius-standard, 4px);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover, var(--bg-card));
    color: var(--text-primary);
  }
  &:focus-visible {
    outline: 2px solid var(--primary-color, var(--text-primary));
    outline-offset: -2px;
  }
}
.ia-inbox__group--active {
  border-left-color: var(--primary-color, var(--text-primary));
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
}
.ia-inbox__group--approval .ia-inbox__group-count { background: var(--error, var(--color-danger, #e11d48)); }
.ia-inbox__group--blocked .ia-inbox__group-count { background: var(--error, var(--color-danger, #e11d48)); }
.ia-inbox__group--review .ia-inbox__group-count,
.ia-inbox__group--alarm .ia-inbox__group-count { background: var(--warning, var(--color-warning, #f59e0b)); }
.ia-inbox__group--reminder .ia-inbox__group-count { background: var(--text-muted, var(--color-text-secondary, #878c99)); }
.ia-inbox__group-label {
  flex: 1;
  min-width: 0;
}
.ia-inbox__group-count {
  flex-shrink: 0;
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-secondary);
  color: var(--color-on-accent, #fff);
  font-size: 11px;
  text-align: center;
}
.ia-inbox__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
</style>
