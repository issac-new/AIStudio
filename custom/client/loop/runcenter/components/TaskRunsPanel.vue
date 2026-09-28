<!-- overlay/custom/client/loop/runcenter/components/TaskRunsPanel.vue -->
<!-- 任务运行面板（2026-09-28 产品实操演示轮）：运行中心第三 tab，展示 kanban
     task_runs 真实执行史（数据源 GET /api/graph/mind 只读投影）。
     背景：图引擎 runs 只在 GRAPH_ENGINE=on 时有数据；本环境引擎 legacy，
     真实 agent 执行史全部落在 task_runs——此前运行中心对这些运行不可见。
     组件薄壳：行整/过滤在 adapters/task-runs 纯函数；本面板只做拉取与渲染。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { runRest } from '../api'
import RunStageBadge from './RunStageBadge.vue'
import { filterTaskRunRows, toTaskRunRows, type TaskRunRow } from '../adapters/task-runs'
import type { RunStatus } from '../types'

const { t } = useI18n()

const loading = ref(false)
const failed = ref(false)
const rows = ref<TaskRunRow[]>([])

const statusFilter = ref('')
const query = ref('')

const FILTER_OPTIONS = [
  { value: '', i18n: 'runcenter.toolbar.all' },
  { value: 'running', i18n: 'runcenter.status.running' },
  { value: 'awaiting-input', i18n: 'runcenter.status.awaitingInput' },
  { value: 'completed', i18n: 'runcenter.status.completed' },
  { value: 'failed', i18n: 'runcenter.status.failed' },
]

async function load(): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    const mind = await runRest.getMind()
    rows.value = mind.available ? toTaskRunRows(mind) : []
  } catch {
    failed.value = true
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

const filtered = computed(() => filterTaskRunRows(rows.value, {
  status: statusFilter.value || undefined,
  query: query.value || undefined,
}))

/** 渲染上限：全量计数在表头如实显示，列表只渲染最近 50 行（200+ 轮全渲染无信息量） */
const RENDER_CAP = 50
const paged = computed(() => filtered.value.slice(0, RENDER_CAP))

function fmtTime(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}m${s}s` : `${m}m`
}

/** 状态徽标词汇：mind 投影 status 与 RunStatus 同词表（completed/failed/
 *  running/awaiting-input/idle）；其余原样文本展示。 */
const BADGE_STATUS = new Set(['idle', 'running', 'paused', 'awaiting-input', 'completed', 'failed', 'unknown'])
function badgeStatus(status: string): RunStatus | null {
  return BADGE_STATUS.has(status) ? (status as RunStatus) : null
}
</script>

<template>
  <div class="trp" data-testid="task-runs-panel">
    <div class="trp__toolbar">
      <div class="trp__filters">
        <button
          v-for="opt in FILTER_OPTIONS"
          :key="opt.value"
          class="trp__filter"
          :class="{ 'trp__filter--active': statusFilter === opt.value }"
          @click="statusFilter = opt.value"
        >
          {{ t(opt.i18n) }}
        </button>
      </div>
      <input
        v-model="query"
        class="trp__search"
        type="search"
        :placeholder="t('runcenter.taskRuns.searchPlaceholder')"
      >
      <span class="trp__count">{{ t('runcenter.taskRuns.count', { n: filtered.length }) }}</span>
    </div>

    <p v-if="loading" class="trp__hint">{{ t('runcenter.replay.loading') }}</p>
    <div v-else-if="failed" class="trp__failed">
      <span>{{ t('runcenter.taskRuns.loadFailed') }}</span>
      <button type="button" class="trp__retry" @click="load">{{ t('runcenter.taskRuns.retry') }}</button>
    </div>
    <p v-else-if="rows.length === 0" class="trp__hint">{{ t('runcenter.taskRuns.empty') }}</p>
    <p v-else-if="filtered.length === 0" class="trp__hint">{{ t('runcenter.table.empty') }}</p>

    <div v-else class="trp__scroll">
      <table class="trp__table">
        <thead>
          <tr>
            <th>{{ t('runcenter.table.run') }}</th>
            <th>{{ t('runcenter.taskRuns.task') }}</th>
            <th>{{ t('runcenter.table.status') }}</th>
            <th>{{ t('runcenter.taskRuns.duration') }}</th>
            <th>{{ t('runcenter.taskRuns.started') }}</th>
            <th>{{ t('runcenter.taskRuns.ended') }}</th>
            <th>{{ t('runcenter.taskRuns.summary') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in paged" :key="row.runId" :data-run-id="row.runId">
            <td class="trp__mono">#{{ row.runId }}</td>
            <td class="trp__task">
              <span class="trp__task-id">{{ row.taskId }}</span>
              <span v-if="row.taskTitle" class="trp__task-title" :title="row.taskTitle">{{ row.taskTitle }}</span>
            </td>
            <td>
              <RunStageBadge v-if="badgeStatus(row.status)" :status="badgeStatus(row.status)" />
              <span v-else>{{ row.status }}</span>
            </td>
            <td class="trp__mono">{{ fmtDuration(row.durationSec) }}</td>
            <td class="trp__time">{{ fmtTime(row.startedAt) }}</td>
            <td class="trp__time">{{ fmtTime(row.endedAt) }}</td>
            <td class="trp__summary" :title="row.summary ?? undefined">{{ row.summary || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.trp { display: flex; flex-direction: column; gap: 10px; min-height: 0; flex: 1; }
.trp__toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.trp__filters { display: flex; gap: 4px; }
.trp__filter {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.trp__filter--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}
.trp__search {
  flex: 0 1 220px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 12px;
}
.trp__count {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-variant-numeric: tabular-nums;
}
.trp__hint { padding: 24px 0; text-align: center; font-size: 12px; color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.trp__failed { display: flex; align-items: center; gap: 10px; color: var(--color-danger, #e11d48); font-size: 13px; }
.trp__retry {
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  border-radius: var(--radius-micro, 3px);
  padding: 3px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: inherit;
}
.trp__scroll { flex: 1; min-height: 0; overflow: auto; }
.trp__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.trp__table th {
  text-align: left;
  font-weight: 600;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-primary, #fff));
}
.trp__table td {
  padding: 6px 10px;
  border-bottom: 1px dashed var(--border-color);
  vertical-align: top;
  min-width: 0;
}
.trp__mono { font-family: var(--font-mono, ui-monospace, monospace); font-variant-numeric: tabular-nums; white-space: nowrap; }
.trp__task { max-width: 320px; }
.trp__task-id { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; color: var(--text-muted, var(--color-text-secondary, #878c99)); display: block; }
.trp__task-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trp__time { white-space: nowrap; color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.trp__summary {
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
</style>
