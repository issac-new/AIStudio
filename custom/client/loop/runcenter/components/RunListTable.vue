<!-- overlay/custom/client/loop/runcenter/components/RunListTable.vue -->
<!-- RunListTable — 运行列表（Summary 档）。
     列：Run / 状态徽标 / 业务阶段（deriveStage 投影）/ 迭代 / 最后活动（相对时间）/ 成本 / 操作。
     操作按钮显隐由 legalActions(status) 映射表驱动——不存在任意跳转。
     组件薄壳：排序/过滤/投影已在 store+adapters 完成，此处只做展示与事件转发。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import RunStageBadge from './RunStageBadge.vue'
import { legalActions, relativeTime } from '../adapters'
import type { RunAction, RunSummary } from '../types'

const props = defineProps<{
  runs: RunSummary[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', run: RunSummary): void
  (e: 'action', payload: { kind: RunAction; run: RunSummary }): void
}>()

const { t } = useI18n()

/** 合法操作 → 按钮文案/图标的静态映射（键即 RunAction，无运行时分支） */
const ACTION_META: Record<RunAction, { icon: string; i18n: string }> = {
  approve: { icon: 'status-warn', i18n: 'runcenter.actions.approve' },
  peek: { icon: 'search', i18n: 'runcenter.actions.peek' },
  replay: { icon: 'history', i18n: 'runcenter.actions.replay' },
  fork: { icon: 'fork', i18n: 'runcenter.actions.fork' },
  detail: { icon: 'file', i18n: 'runcenter.actions.detail' },
}

const STAGE_I18N_KEY: Record<string, string> = {
  discovery: 'discovery',
  handoff: 'handoff',
  validation: 'validation',
  persistence: 'persistence',
  gate: 'gate',
  stop: 'stop',
}

interface Row {
  run: RunSummary
  stageLabel: string
  lastActivityLabel: string
  costLabel: string
  actions: RunAction[]
}

function toRow(run: RunSummary): Row {
  const rt = relativeTime(run.lastActivityAt)
  return {
    run,
    stageLabel: run.stage ? t(`runcenter.stage.${STAGE_I18N_KEY[run.stage] ?? run.stage}`) : '—',
    lastActivityLabel: rt
      ? t(`runcenter.time.${rt.key}`, { n: rt.n ?? 0 })
      : '—',
    costLabel: `$${run.cost.toFixed(2)}`,
    actions: legalActions(run.status),
  }
}

const rows = computed<Row[]>(() => props.runs.map(toRow))

function onAction(kind: RunAction, run: RunSummary): void {
  emit('action', { kind, run })
}
</script>

<template>
  <div class="rc-table" :class="{ 'rc-table--loading': loading }">
    <div class="rc-table__header">
      <span class="rc-table__col rc-table__col--run">{{ t('runcenter.table.run') }}</span>
      <span class="rc-table__col rc-table__col--status">{{ t('runcenter.table.status') }}</span>
      <span class="rc-table__col rc-table__col--stage">{{ t('runcenter.table.stage') }}</span>
      <span class="rc-table__col rc-table__col--iter">{{ t('runcenter.table.iteration') }}</span>
      <span class="rc-table__col rc-table__col--activity">{{ t('runcenter.table.lastActivity') }}</span>
      <span class="rc-table__col rc-table__col--cost">{{ t('runcenter.table.cost') }}</span>
      <span class="rc-table__col rc-table__col--actions">{{ t('runcenter.table.actions') }}</span>
    </div>

    <div
      v-for="row in rows"
      :key="row.run.runId"
      class="rc-table__row"
      :class="{ 'rc-table__row--awaiting': row.run.status === 'awaiting-input' }"
      @click="emit('select', row.run)"
    >
      <span class="rc-table__col rc-table__col--run">
        <span class="rc-table__run-id">{{ row.run.runId }}</span>
        <span class="rc-table__graph-id">{{ row.run.graphId }}</span>
      </span>
      <span class="rc-table__col rc-table__col--status">
        <RunStageBadge :status="row.run.status" />
      </span>
      <span class="rc-table__col rc-table__col--stage">{{ row.stageLabel }}</span>
      <span class="rc-table__col rc-table__col--iter">{{ row.run.iteration }}</span>
      <span class="rc-table__col rc-table__col--activity">{{ row.lastActivityLabel }}</span>
      <span class="rc-table__col rc-table__col--cost">{{ row.costLabel }}</span>
      <span class="rc-table__col rc-table__col--actions" @click.stop>
        <button
          v-for="kind in row.actions"
          :key="kind"
          class="rc-table__action"
          :title="t(ACTION_META[kind].i18n)"
          @click="onAction(kind, row.run)"
        >
          <CockpitIcon :name="ACTION_META[kind].icon" :size="11" />
          <span class="rc-table__action-label">{{ t(ACTION_META[kind].i18n) }}</span>
        </button>
      </span>
    </div>

    <div v-if="rows.length === 0 && !loading" class="rc-table__empty">
      {{ t('runcenter.table.empty') }}
    </div>
  </div>
</template>

<style scoped>
.rc-table {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  overflow: hidden;
  font-size: 13px;
}
.rc-table--loading { opacity: 0.6; }

.rc-table__header,
.rc-table__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
}
.rc-table__header {
  font-weight: 600;
  font-size: 12px;
  opacity: 0.7;
  border-bottom: 2px solid var(--border-color);
}
.rc-table__row {
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}
.rc-table__row:last-child { border-bottom: none; }
.rc-table__row:hover { background: var(--hover-bg, var(--bg-secondary, rgba(127, 127, 127, 0.08))); }
/* 待我处理行：左 3px 色条 + 浅底（与 cockpit 选中态语言一致） */
.rc-table__row--awaiting {
  box-shadow: inset 3px 0 0 var(--color-warning, #f59e0b);
  background: rgba(var(--color-warning-rgb, 245, 158, 11), 0.05);
}

/* 列宽：Run 列弹性，其余定宽 */
.rc-table__col--run { flex: 2; min-width: 0; display: flex; flex-direction: column; }
.rc-table__col--status { flex: 0 0 110px; }
.rc-table__col--stage { flex: 0 0 80px; }
.rc-table__col--iter { flex: 0 0 48px; text-align: right; }
.rc-table__col--activity { flex: 0 0 104px; }
.rc-table__col--cost { flex: 0 0 76px; text-align: right; font-variant-numeric: tabular-nums; }
.rc-table__col--actions { flex: 0 0 210px; display: flex; gap: 4px; justify-content: flex-end; }

.rc-table__run-id {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-table__graph-id {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-table__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  white-space: nowrap;
}
.rc-table__action:hover {
  background: var(--hover-bg, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}

.rc-table__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
</style>
