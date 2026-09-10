<!-- overlay/custom/client/ia2/components/TraceabilityMatrix.vue -->
<!-- 追溯矩阵（P3 Task 7，spec §7B.2）：需求(loop goal) → run（状态/迭代）→ 产出任务
     （标题/状态）→ 验证轮次，按 loop 分组的表格。挂载于 TasksView"追溯"页签。
     数据组织在 adapters/traceability.buildTraceMatrix 纯函数（组件薄壳）：
     - loop 事件：loopRest.listLoops + 每 loop getEvents（关联链显式 taskId/runId）；
     - 产出任务标题/状态：join kanban store 既有任务缓存（TasksView 同源，零新请求面）；
     - run 状态：join runs store 投影（未拉到时显示未知，不阻塞矩阵）。
     本页只读；任务/run 深链分别回工作项看板与运行详情。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { NSpin } from 'naive-ui'
import { loopRest } from '@/custom/loop/api/loop-rest'
import { useKanbanStore } from '@/stores/hermes/kanban'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import RunStageBadge from '@/custom/loop/runcenter/components/RunStageBadge.vue'
import type { RunStatus } from '@/custom/loop/runcenter/types'
import {
  buildTraceMatrix,
  type TraceLoopEvent, type TraceLoopGroup, type TraceLoopInput, type TraceTaskRow,
} from '../adapters/traceability'

const { t } = useI18n()
const router = useRouter()
const kanban = useKanbanStore()
const runsStore = useRunCenterStore()

const loading = ref(false)
const failed = ref(false)
const loops = ref<TraceLoopInput[]>([])
const events = ref<TraceLoopEvent[]>([])

/** 单 loop 事件拉取上限（对齐 runs store 指标采集口径） */
const EVENT_LIMIT = 500

async function load(): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    const list = await loopRest.listLoops()
    const results = await Promise.allSettled(
      list.map(l => loopRest.getEvents(l.id, undefined, EVENT_LIMIT)),
    )
    loops.value = list.map(l => ({ id: l.id, name: l.name, goal: l.goal }))
    events.value = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    // listLoops 成功即出矩阵；单 loop 事件失败只影响该 loop 行（结果标注降级）。
    // 全部失败且无事件 → 提示重试（不静默当"无产出"）。
    failed.value = list.length > 0 && events.value.length === 0
      && results.every(r => r.status === 'rejected')
  } catch {
    failed.value = true
    loops.value = []
    events.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  // join 数据源惰性补拉（已有缓存不重拉）：任务标题/状态 + run 状态
  if (kanban.tasks.length === 0) void kanban.fetchTasks()
  if (runsStore.runs.length === 0) void runsStore.fetchRuns()
})

const groups = computed<TraceLoopGroup[]>(() => {
  if (failed.value) return []
  return buildTraceMatrix({
    loops: loops.value,
    events: events.value,
    tasks: kanban.tasks.map(task => ({ id: task.id, title: task.title, status: task.status })),
    runs: runsStore.runs.map(r => ({ runId: r.runId, status: r.status })),
  })
})

/** run 状态列：已知 RunStatus 才渲染徽标，其余（未知/null）显示占位 */
const KNOWN_RUN_STATUS: ReadonlySet<string> = new Set([
  'idle', 'running', 'paused', 'awaiting-input', 'completed', 'failed', 'unknown',
])
function runStatusOf(status: string | null): RunStatus | null {
  return status !== null && KNOWN_RUN_STATUS.has(status) ? (status as RunStatus) : null
}

const emit = defineEmits<{ (e: 'open-task', taskId: string): void }>()

function openRun(runId: string | null): void {
  if (runId) void router.push(`/app/runs/${runId}`)
}
function openTask(row: TraceTaskRow): void {
  if (row.taskId) emit('open-task', row.taskId)
}
</script>

<template>
  <div class="ia-trace" data-testid="ia-trace">
    <NSpin v-if="loading" size="medium" class="ia-trace__loading" />
    <div v-else-if="failed" class="ia-trace__failed">
      <span>{{ t('ia2.trace.loadFailed') }}</span>
      <button type="button" class="ia-trace__retry" @click="load">
        {{ t('ia2.trace.retry') }}
      </button>
    </div>
    <div v-else-if="groups.length === 0" class="ia-trace__empty">
      <div class="ia-trace__empty-title">{{ t('ia2.trace.emptyTitle') }}</div>
      <div class="ia-trace__empty-hint">{{ t('ia2.trace.emptyHint') }}</div>
    </div>
    <template v-else>
      <section v-for="g in groups" :key="g.loopId" class="ia-trace__group" :data-loop-id="g.loopId">
        <header class="ia-trace__head">
          <span class="ia-trace__name">{{ g.loopName }}</span>
          <span class="ia-trace__goal" :title="g.goal">{{ g.goal }}</span>
        </header>
        <table v-if="g.runs.length > 0" class="ia-trace__table">
          <thead>
            <tr>
              <th class="ia-trace__col-run">{{ t('ia2.trace.colRun') }}</th>
              <th class="ia-trace__col-iter">{{ t('ia2.trace.colIter') }}</th>
              <th class="ia-trace__col-task">{{ t('ia2.trace.colTask') }}</th>
              <th class="ia-trace__col-rounds">{{ t('ia2.trace.colRounds') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="run in g.runs" :key="run.runId ?? 'legacy'">
              <tr v-if="run.tasks.length === 0">
                <td colspan="4" class="ia-trace__muted">—</td>
              </tr>
              <tr v-for="row in run.tasks" :key="`${run.runId ?? 'legacy'}-${row.contractId}`">
                <td class="ia-trace__col-run">
                  <button
                    v-if="run.runId"
                    type="button"
                    class="ia-trace__runlink"
                    :title="t('ia2.trace.openRun')"
                    @click="openRun(run.runId)"
                  >{{ run.runId }}</button>
                  <span v-else class="ia-trace__muted">{{ t('ia2.trace.noRun') }}</span>
                  <RunStageBadge v-if="runStatusOf(run.runStatus)" :status="runStatusOf(run.runStatus)!" />
                </td>
                <td class="ia-trace__col-iter">
                  <span v-if="run.iteration !== null" class="ia-trace__iter">#{{ run.iteration }}</span>
                  <span v-else class="ia-trace__muted">—</span>
                </td>
                <td class="ia-trace__col-task">
                  <button
                    v-if="row.taskId"
                    type="button"
                    class="ia-trace__tasklink"
                    :title="t('ia2.trace.openTask')"
                    @click="openTask(row)"
                  >{{ row.taskTitle ?? row.taskId }}</button>
                  <template v-else>
                    <span class="ia-trace__muted">{{ row.contractId }}</span>
                    <span class="ia-trace__unlinked">{{ t('ia2.trace.unlinked') }}</span>
                  </template>
                  <span v-if="row.taskStatus" class="ia-trace__task-status">{{ row.taskStatus }}</span>
                </td>
                <td class="ia-trace__col-rounds">
                  <!-- 轮次比 locale 中立数字串（同 overview formatDuration 纪律）；
                       有失败轮且末轮未过 → warning 色，PM 一眼读出"带病交付" -->
                  <span
                    class="ia-trace__rounds"
                    :class="{ 'ia-trace__rounds--failed': row.rounds.failed > 0 && row.lastRoundPassed !== true }"
                  >{{ row.rounds.passed }}/{{ row.rounds.total }}</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-else class="ia-trace__norun">{{ t('ia2.trace.noRuns') }}</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ia-trace {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding: 4px 2px;
}
.ia-trace__loading {
  align-self: center;
  margin: 40px 0;
}
.ia-trace__failed {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-danger, #e11d48);
  font-size: 13px;
}
.ia-trace__retry {
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  border-radius: 4px;
  padding: 3px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: inherit;
}
.ia-trace__empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  margin-top: 48px;
  text-align: center;
}
.ia-trace__empty-title { font-size: 14px; font-weight: 600; }
.ia-trace__empty-hint { font-size: 12px; color: var(--text-muted, var(--color-text-secondary, #878c99)); }

.ia-trace__group {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  overflow: hidden;
}
.ia-trace__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-card, rgba(127, 127, 127, 0.06));
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  min-width: 0;
}
.ia-trace__name { font-size: 13px; font-weight: 600; flex-shrink: 0; }
.ia-trace__goal {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ia-trace__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ia-trace__table th {
  text-align: left;
  font-weight: 600;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  white-space: nowrap;
}
.ia-trace__table td {
  padding: 6px 12px;
  border-bottom: 1px dashed var(--border-color, #e5e7eb);
  vertical-align: middle;
  min-width: 0;
}
.ia-trace__table tr:last-child td { border-bottom: none; }
.ia-trace__col-run { width: 34%; }
.ia-trace__col-iter { width: 8%; }
.ia-trace__col-task { width: 38%; }
.ia-trace__col-rounds { width: 20%; }

.ia-trace__runlink,
.ia-trace__tasklink {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--accent-primary, var(--color-primary, #3b82f6));
  cursor: pointer;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: inline-block;
  vertical-align: middle;
}
.ia-trace__tasklink { font-family: inherit; }
.ia-trace__runlink:hover,
.ia-trace__tasklink:hover { text-decoration: underline; }

.ia-trace__iter { font-variant-numeric: tabular-nums; }
.ia-trace__muted { color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.ia-trace__unlinked {
  margin-left: 6px;
  font-size: 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 999px;
  padding: 0 6px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-trace__task-status {
  margin-left: 6px;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ia-trace__rounds { font-variant-numeric: tabular-nums; }
.ia-trace__rounds--failed { color: var(--color-warning, #f59e0b); }
.ia-trace__norun {
  padding: 10px 12px;
  font-size: 12px;
  font-style: italic;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
</style>
