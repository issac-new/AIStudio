<!-- overlay/custom/client/loop/runcenter/components/RunListTable.vue -->
<!-- RunListTable — 运行列表（Summary 档）。
     列：Run / 状态徽标 / 业务阶段（deriveStage 投影）/ 迭代 / 最后活动（相对时间）/ 成本 / 操作。
     操作按钮显隐由 legalActions(status) 映射表驱动——不存在任意跳转。
     行内展开（peek，task-7）：最新 3 条事件摘要 + awaiting-input 时内联审批面板
     （ApprovalPanel，审批不进详情页）；展开面板为行下浮层（不占行高，虚拟滚动定位不受影响）。
     虚拟滚动（P3 台账，R5 预算）：自实现最小虚拟列表——行高固定 48px、窗口渲染 +
     overscan，零新依赖；jsdom/未量测（clientHeight=0）时回退固定容量保证小列表全渲染。
     键盘可达（P3 §7B.1）：列表聚焦后 j/k（↓/↑）移动、Enter 详情、r 回放、a 审批/查看
     （peek 展开），焦点行高亮可见。
     组件薄壳：排序/过滤/投影已在 store+adapters 完成，此处只做展示与事件转发。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import RunStageBadge from './RunStageBadge.vue'
import ApprovalPanel from './ApprovalPanel.vue'
import { legalActions, relativeTime } from '../adapters'
import { latestEvents } from '../adapters/intervention'
import { formatEventTs } from '../adapters/run-graph'
import type { RunAction, RunSummary } from '../types'

const props = defineProps<{
  runs: RunSummary[]
  loading?: boolean
  /** 行内展开（peek）的 runId；父层持有以支持操作按钮与展开箭头同一路径 */
  expandedRunId?: string | null
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

// ── 虚拟滚动（P3 台账）：行高固定 48px 的最小窗口渲染，零新依赖 ──
const ROW_H = 48
/** 窗口上下各多渲染的行数（滚动不闪空的缓冲） */
const OVERSCAN = 4
/** 视口不可量测时的兜底容量（jsdom clientHeight=0；保证小列表全渲染） */
const FALLBACK_CAPACITY = 24

const scrollEl = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportH = ref(0)

const total = computed(() => rows.value.length)
const canvasH = computed(() => total.value * ROW_H)
const capacity = computed(() =>
  viewportH.value > 0 ? Math.ceil(viewportH.value / ROW_H) + 1 : FALLBACK_CAPACITY)
const startIdx = computed(() =>
  Math.min(Math.floor(scrollTop.value / ROW_H), Math.max(0, total.value - 1)))

/** 窗口行（含 overscan）：offset 供绝对定位（画布内 translateY） */
const windowRows = computed(() => {
  const from = Math.max(0, startIdx.value - OVERSCAN)
  const to = Math.min(total.value, startIdx.value + capacity.value + OVERSCAN)
  const out: Array<{ row: Row; index: number }> = []
  for (let i = from; i < to; i++) out.push({ row: rows.value[i], index: i })
  return out
})

function onScroll(): void {
  if (scrollEl.value) scrollTop.value = scrollEl.value.scrollTop
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  const el = scrollEl.value
  if (!el) return
  viewportH.value = el.clientHeight
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => { viewportH.value = el.clientHeight })
    resizeObserver.observe(el)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// ── 键盘可达（P3 §7B.1）：j/k 移动、Enter 详情、r 回放、a 审批/查看 ──
const focusedIdx = ref(0)

watch(() => props.runs.length, (n) => {
  if (focusedIdx.value >= n) focusedIdx.value = Math.max(0, n - 1)
})

/** 焦点行滚入可视窗口（直接调 scrollTop，jsdom 下赋值无害） */
function ensureFocusVisible(): void {
  const el = scrollEl.value
  if (!el) return
  const top = focusedIdx.value * ROW_H
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + ROW_H > el.scrollTop + el.clientHeight) {
    el.scrollTop = top + ROW_H - el.clientHeight
  }
  scrollTop.value = el.scrollTop
}

function moveFocus(delta: number): void {
  const n = props.runs.length
  if (n === 0) return
  focusedIdx.value = Math.min(Math.max(0, focusedIdx.value + delta), n - 1)
  ensureFocusVisible()
}

function onKeydown(e: KeyboardEvent): void {
  const run = props.runs[focusedIdx.value]
  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault()
      moveFocus(1)
      break
    case 'k':
    case 'ArrowUp':
      e.preventDefault()
      moveFocus(-1)
      break
    case 'Enter':
      if (run) { e.preventDefault(); emit('select', run) }
      break
    case 'r':
      if (run) { e.preventDefault(); emit('action', { kind: 'replay', run }) }
      break
    case 'a':
      // awaiting-input → 审批面板；其余 → 查看摘要（同一 peek 展开路径）
      if (run) {
        e.preventDefault()
        emit('action', { kind: run.status === 'awaiting-input' ? 'approve' : 'peek', run })
      }
      break
  }
}

function onAction(kind: RunAction, run: RunSummary): void {
  emit('action', { kind, run })
}

/** 行内展开（peek）最新 3 条事件摘要（adapters.latestEvents 投影） */
function peekLines(run: RunSummary): ReturnType<typeof latestEvents> {
  return latestEvents(run.events, 3)
}

function togglePeek(run: RunSummary): void {
  onAction('peek', run)
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

    <!-- 虚拟滚动视口 + 键盘导航焦点区 -->
    <div
      ref="scrollEl"
      class="rc-table__body"
      tabindex="0"
      :aria-label="t('runcenter.keyboard.hint')"
      @scroll="onScroll"
      @keydown="onKeydown"
    >
      <div class="rc-table__canvas" :style="{ height: `${canvasH}px` }">
        <div
          v-for="{ row, index } in windowRows"
          :key="row.run.runId"
          class="rc-table__row"
          :class="{
            'rc-table__row--awaiting': row.run.status === 'awaiting-input',
            'rc-table__row--focused': index === focusedIdx,
          }"
          :style="{ transform: `translateY(${index * ROW_H}px)` }"
          @click="emit('select', row.run)"
        >
          <span class="rc-table__col rc-table__col--run">
            <span class="rc-table__run-line">
              <button
                class="rc-table__peek-toggle"
                :class="{ 'rc-table__peek-toggle--open': expandedRunId === row.run.runId }"
                :title="t('runcenter.peek.toggle')"
                @click.stop="togglePeek(row.run)"
              >
                <span class="rc-table__peek-chevron" aria-hidden="true" />
              </button>
              <span class="rc-table__run-id">{{ row.run.runId }}</span>
            </span>
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

        <!-- 行内展开（peek）：行下浮层（不占行高，虚拟定位不受影响） -->
        <div
          v-if="expandedRunId"
          class="rc-table__peek"
          :style="{ top: `${(props.runs.findIndex(r => r.runId === expandedRunId) + 1) * ROW_H}px` }"
          @click.stop
        >
          <template v-for="row in rows" :key="row.run.runId">
            <template v-if="row.run.runId === expandedRunId">
              <div class="rc-table__peek-events">
                <span class="rc-table__peek-title">{{ t('runcenter.peek.title') }}</span>
                <div v-if="peekLines(row.run).length === 0" class="rc-table__peek-empty">
                  {{ t('runcenter.peek.empty') }}
                </div>
                <div v-for="(l, i) in peekLines(row.run)" v-else :key="i" class="rc-table__peek-line">
                  <span class="rc-table__peek-ts">{{ formatEventTs(l.ts) }}</span>
                  <span class="rc-table__peek-type">
                    {{ l.type }}<template v-if="l.step !== undefined"> @{{ l.step }}</template>
                    <template v-if="l.nodeId"> · {{ l.nodeId }}</template>
                  </span>
                  <span v-if="l.error" class="rc-table__peek-error">{{ l.error }}</span>
                  <span v-if="l.autoApproved" class="rc-table__peek-auto">
                    {{ t('runcenter.approval.timeoutAuto') }}
                  </span>
                </div>
              </div>
              <ApprovalPanel
                v-if="row.run.status === 'awaiting-input' && row.run.pendingInterruptId"
                :run="row.run"
              />
            </template>
          </template>
        </div>
      </div>
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

/* 虚拟滚动视口：固定可视高度（≈10 行），画布承载全量行高 */
.rc-table__body {
  max-height: 480px;
  overflow-y: auto;
  outline: none;
}
.rc-table__body:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent-primary, var(--color-primary, #3b82f6));
}
.rc-table__canvas { position: relative; }

.rc-table__row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}
.rc-table__row:hover { background: var(--hover-bg, var(--bg-secondary, rgba(127, 127, 127, 0.08))); }
/* 键盘焦点行：与 hover 同语言的可见描边 */
.rc-table__row--focused {
  box-shadow: inset 0 0 0 1px var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--hover-bg, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}
/* 待我处理行：左 3px 色条 + 浅底（与 cockpit 选中态语言一致） */
.rc-table__row--awaiting {
  box-shadow: inset 3px 0 0 var(--color-warning, #f59e0b);
  background: rgba(var(--color-warning-rgb, 245, 158, 11), 0.05);
}
.rc-table__row--awaiting.rc-table__row--focused {
  box-shadow: inset 3px 0 0 var(--color-warning, #f59e0b), inset 0 0 0 1px var(--accent-primary, var(--color-primary, #3b82f6));
}

/* 列宽：Run 列弹性，其余定宽 */
.rc-table__col--run { flex: 2; min-width: 0; display: flex; flex-direction: column; justify-content: center; height: 100%; }
.rc-table__col--status { flex: 0 0 110px; }
.rc-table__col--stage { flex: 0 0 80px; }
.rc-table__col--iter { flex: 0 0 48px; text-align: right; }
.rc-table__col--activity { flex: 0 0 104px; }
.rc-table__col--cost { flex: 0 0 76px; text-align: right; font-variant-numeric: tabular-nums; }
.rc-table__col--actions { flex: 0 0 210px; display: flex; gap: 4px; justify-content: flex-end; }

.rc-table__run-line { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.rc-table__peek-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.rc-table__peek-chevron {
  display: inline-block;
  border-left: 3px solid currentColor;
  border-bottom: 3px solid transparent;
  border-top: 3px solid transparent;
  transition: transform 0.15s ease;
}
.rc-table__peek-toggle--open .rc-table__peek-chevron { transform: rotate(90deg); }

/* 行内展开（peek）：浮层盖住后续行 */
.rc-table__peek {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 10px 28px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(127, 127, 127, 0.04));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.rc-table__peek-events { display: flex; flex-direction: column; gap: 2px; }
.rc-table__peek-title {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.rc-table__peek-empty { font-size: 12px; color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.rc-table__peek-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}
.rc-table__peek-ts {
  flex: 0 0 56px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-variant-numeric: tabular-nums;
}
.rc-table__peek-type {
  font-family: var(--font-mono, ui-monospace, monospace);
  flex-shrink: 0;
}
.rc-table__peek-error {
  color: var(--color-danger, #e11d48);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-table__peek-auto {
  flex-shrink: 0;
  padding: 0 6px;
  border: 1px solid var(--color-warning, #f59e0b);
  border-radius: var(--radius-pill, 999px);
  color: var(--color-warning, #f59e0b);
  font-size: 11px;
  white-space: nowrap;
}

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
.rc-table__action:focus-visible {
  box-shadow: 0 0 0 2px var(--accent-primary, var(--color-primary, #3b82f6));
}

.rc-table__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
</style>
