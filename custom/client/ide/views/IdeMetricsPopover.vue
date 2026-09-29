<script setup lang="ts">
// IdeMetricsPopover — 状态栏遥测簇的展开面板（R1：G4 构成分解 + G8 每轮用量表
// + G7 用量热力图 + 低余量横幅 + 成本估算）。
//
// 数据面全只读：metrics（props，由 IdeStatusBar 的 useSessionMetrics 传入，
// 避免二次实例化双 TpsTracker）+ chatStore.activeSession.messages（构成分解）
// + /usage/rounds（patch 340）+ /usage/stats by_day（upstream 既有）。
// 打开时拉取，轮结束（isRunActive false）刷新轮表；Esc / 点遮罩关闭。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { fetchUsageStats } from '@/api/studio/sessions'
import { ideUsageApi, type UsageRoundRow } from '../api/usage'
import { buildUsageLedger } from '../utils/usage-ledger'
import { roundsSummary } from '../utils/rounds-table'
import { buildThreadUsage } from '../utils/thread-usage'
import { computeBreakdown, type ContextSegment } from '../utils/contextBreakdown'
import { estimateCostUsd, formatCostUsd } from '../utils/modelPricing'
import { formatTokens, isLowContext, type PressureLevel, type SpeedLevel } from '../utils/metrics'

interface MetricsLike {
  contextUsed: { value: number }
  contextLength: { value: number }
  contextPct: { value: number }
  contextLevel: { value: PressureLevel }
  contextText: { value: string }
  cacheDetail: { value: { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null }
  tpsDisplay: { value: number | null }
  tpsSpeed: { value: SpeedLevel }
}

const props = defineProps<{ metrics: MetricsLike }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const chatStore = useChatStore()

// ── G4 构成分解（纯前端估算版，见 utils/contextBreakdown.ts 头注）──
const breakdown = computed(() =>
  computeBreakdown(
    (chatStore.activeSession?.messages ?? []) as never,
    props.metrics.contextUsed.value,
  ),
)

const SEGMENT_COLORS: Record<ContextSegment['key'], string> = {
  user: 'var(--primary-color, #18a058)',
  assistant: 'var(--success-color, #18a058)',
  tool: 'var(--info-color, #8b5cf6)',
  system: 'var(--warning-color, #d97706)',
}

// ── 成本估算（dsh-TUI 三原则：未收录不显示 / 缓存分价 / 价目随官方维护）──
// 按轮表逐轮全量口径（input+output+cache 读写分价）折算，未收录模型不计入。
const roundsCost = computed(() =>
  rounds.value.reduce((sum, row) => {
    const cost = estimateCostUsd(row.model, {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheWriteTokens: row.cache_write_tokens,
    })
    return sum + (cost ?? 0)
  }, 0),
)

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

/** 每轮费用（dsh 三原则：未收录模型显示 — 不虚报 0）。 */
function formatRowCost(row: UsageRoundRow): string {
  const cost = estimateCostUsd(row.model, {
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
  })
  return cost === null ? '—' : `$${cost.toFixed(3)}`
}

const lowContext = computed(() =>
  isLowContext(props.metrics.contextUsed.value, props.metrics.contextLength.value),
)

// ── G8 每轮用量表 ──
const rounds = ref<UsageRoundRow[]>([])
const roundsState = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

// 表尾合计（rounds-table 接线，G8 #1）：REST 行→RoundRow→roundsSummary 单一源；
// 费用列与 formatRowCost 同价目（未收录=合计 null 不显示，dsh 三原则）。
const roundsTotal = computed(() => {
  if (!rounds.value.length) return null
  return roundsSummary(rounds.value.map((row, i) => ({
    roundIndex: i,
    model: row.model,
    inputTokens: row.input_tokens + row.cache_write_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    durationMs: Math.max(0, (row.ended_at - row.started_at) * 1000),
    ttftMs: null,
    costIdle: estimateCostUsd(row.model, {
      inputTokens: row.input_tokens, outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens, cacheWriteTokens: row.cache_write_tokens,
    }),
    costPeak: null,
  })))
})

async function loadRounds(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) {
    rounds.value = []
    roundsState.value = 'empty'
    return
  }
  roundsState.value = 'loading'
  try {
    const res = await ideUsageApi.rounds(sid)
    rounds.value = res.rounds ?? []
    roundsState.value = rounds.value.length ? 'ok' : 'empty'
  } catch {
    roundsState.value = 'error'
  }
}

function formatRowTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatRowModel(model: string): string {
  if (!model) return '—'
  return model.length > 22 ? `${model.slice(0, 21)}…` : model
}

// ── G7 用量热力图（84 天 = 12 周，by_day 日期对齐；连续天数含今日）──
const HEATMAP_DAYS = 84
interface HeatCell { date: string; tokens: number; level: 0 | 1 | 2 | 3 | 4 }
const heatCells = ref<HeatCell[]>([])
const heatMax = ref(0)
const heatStreak = ref(0)
const heatPeak = ref<{ day: string; tokens: number } | null>(null)
const heatTotal = ref(0)
const heatState = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

// ── 成本分组（吸收第一批 B3，codex ThreadUsage）：(model×effort) 分组记账+日桶 ──
// 数据=同一次 fetchUsageStats 响应的 model_usage（model 维度现成；effort 字段
// 响应未携带→'default' 兜底，等上游带 effort 后自动分组），零新增请求。
const threadUsage = ref<ReturnType<typeof buildThreadUsage> | null>(null)

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function loadHeatmap(): Promise<void> {
  heatState.value = 'loading'
  try {
    const stats = await fetchUsageStats(HEATMAP_DAYS)
    // 成本分组（B3）：model_usage → 分组样本（tokens=入+出+缓存读，与台账口径一致）。
    threadUsage.value = buildThreadUsage(
      (stats.model_usage ?? []).map((m) => ({
        model: m.model,
        tokens: (m.input_tokens || 0) + (m.output_tokens || 0) + (m.cache_read_tokens || 0),
        day: '',
        turns: m.sessions,
      })),
    )
    // 投影单一源（usage-ledger 接线，G7 #8）：事件→台账（空日补 0/streak 跳末尾 0/
    // 峰值日/累计），热力图 cells 与汇总行同源，不再各算一套。
    const ledger = buildUsageLedger(
      (stats.daily_usage ?? []).map((row) => ({
        day: row.date,
        tokens: (row.input_tokens || 0) + (row.output_tokens || 0) + (row.cache_read_tokens || 0),
      })),
      { fillDays: true },
    )
    const byDay = new Map(ledger.daily.map((d) => [d.day, d.tokens]))
    const cells: HeatCell[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const date = dayKey(d)
      cells.push({ date, tokens: byDay.get(date) ?? 0, level: 0 })
    }
    const max = Math.max(0, ...cells.map((c) => c.tokens))
    if (max > 0) {
      for (const cell of cells) {
        const ratio = cell.tokens / max
        cell.level = cell.tokens <= 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1
      }
    }
    heatCells.value = cells
    heatMax.value = max
    heatStreak.value = ledger.currentStreakDays
    heatPeak.value = ledger.peakDay
    heatTotal.value = ledger.totalTokens
    heatState.value = ledger.activeDays ? 'ok' : 'empty'
  } catch {
    heatState.value = 'error'
  }
}

function heatTitle(cell: HeatCell): string {
  return cell.tokens > 0 ? `${cell.date} · ${formatTokens(cell.tokens)}` : cell.date
}

// ── 生命周期：打开即拉取；轮结束刷新轮表；Esc 关闭 ──
onMounted(() => {
  void loadRounds()
  void loadHeatmap()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => chatStore.isRunActive,
  (active, prev) => {
    if (!active && prev) void loadRounds()
  },
)
</script>

<template>
  <div class="ide-metrics-panel" data-testid="ide-metrics-panel" @click.stop>
    <div class="ide-metrics-panel__header">
      <span class="ide-metrics-panel__title">{{ t('ide.usagePanel.title') }}</span>
      <span class="ide-metrics-panel__readout" :data-level="metrics.contextLevel.value">
        {{ metrics.contextText.value }}
      </span>
      <span
        v-if="roundsCost > 0"
        class="ide-metrics-panel__cost"
        :title="t('ide.usagePanel.costHint')"
      >≈{{ formatCostUsd(roundsCost) }}</span>
      <button class="ide-metrics-panel__close" data-testid="ide-metrics-close" @click="emit('close')">×</button>
    </div>

    <div v-if="lowContext" class="ide-metrics-panel__low" data-testid="ide-metrics-low">
      <span class="ide-metrics-panel__low-title">{{ t('ide.usagePanel.lowTitle') }}</span>
      <span>{{ t('ide.usagePanel.lowBody') }}</span>
    </div>

    <!-- G4 上下文构成（前端估算版） -->
    <section v-if="breakdown" class="ide-metrics-panel__section">
      <div class="ide-metrics-panel__section-head">
        {{ t('ide.usagePanel.breakdownTitle') }}
        <span v-if="breakdown.isEstimate" class="ide-metrics-panel__hint">{{ t('ide.usagePanel.breakdownEstimate') }}</span>
      </div>
      <div class="ide-metrics-panel__stack" data-testid="ide-metrics-stack">
        <span
          v-for="seg in breakdown.segments"
          :key="seg.key"
          class="ide-metrics-panel__stack-seg"
          :style="{ width: `${Math.min(seg.pct, 100)}%`, background: SEGMENT_COLORS[seg.key] }"
        />
      </div>
      <div class="ide-metrics-panel__legend">
        <span v-for="seg in breakdown.segments" :key="seg.key" class="ide-metrics-panel__legend-row">
          <span class="ide-metrics-panel__dot" :style="{ background: SEGMENT_COLORS[seg.key] }" />
          {{ t(`ide.usagePanel.seg_${seg.key}`) }}
          <span class="ide-metrics-panel__num">{{ formatTokens(seg.tokens) }}</span>
          <span class="ide-metrics-panel__pct">{{ seg.pct.toFixed(0) }}%</span>
        </span>
      </div>
    </section>

    <!-- G8 每轮用量表 -->
    <section class="ide-metrics-panel__section">
      <div class="ide-metrics-panel__section-head">{{ t('ide.usagePanel.roundsTitle') }}</div>
      <div v-if="roundsState === 'loading'" class="ide-metrics-panel__state">…</div>
      <div v-else-if="roundsState === 'error'" class="ide-metrics-panel__state">{{ t('ide.usagePanel.roundsLoadFailed') }}</div>
      <div v-else-if="roundsState === 'empty'" class="ide-metrics-panel__state">{{ t('ide.usagePanel.roundsEmpty') }}</div>
      <table v-else class="ide-metrics-panel__rounds" data-testid="ide-metrics-rounds">
        <thead>
          <tr>
            <th>{{ t('ide.usagePanel.roundColTime') }}</th>
            <th>{{ t('ide.usagePanel.roundColModel') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.roundColIn') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.roundColOut') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.roundColCache') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.roundColDuration') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.roundColCost') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rounds" :key="row.run_id">
            <td>{{ formatRowTime(row.started_at) }}</td>
            <td class="is-model" :title="row.model">{{ formatRowModel(row.model) }}</td>
            <td class="is-num">{{ formatTokens(row.input_tokens + row.cache_read_tokens + row.cache_write_tokens) }}</td>
            <td class="is-num">{{ formatTokens(row.output_tokens) }}</td>
            <td class="is-num">{{ formatTokens(row.cache_read_tokens) }}</td>
            <td class="is-num">{{ formatDuration((row.ended_at - row.started_at) * 1000) }}</td>
            <td class="is-num">{{ formatRowCost(row) }}</td>
          </tr>
        </tbody>
        <tfoot v-if="roundsTotal" class="ide-metrics-panel__rounds-total" data-testid="ide-metrics-rounds-total">
          <tr>
            <td colspan="2">{{ t('ide.usagePanel.roundsTotal', { n: roundsTotal.rounds }) }}</td>
            <td class="is-num">{{ formatTokens(roundsTotal.totalTokens) }}</td>
            <td class="is-num">—</td>
            <td class="is-num">—</td>
            <td class="is-num">{{ formatDuration(roundsTotal.totalMs) }}</td>
            <td class="is-num">{{ roundsTotal.totalCostIdle === null ? '—' : `$${roundsTotal.totalCostIdle.toFixed(3)}` }}</td>
          </tr>
        </tfoot>
      </table>
    </section>

    <!-- G7 用量热力图（84 天） -->
    <section class="ide-metrics-panel__section">
      <div class="ide-metrics-panel__section-head">
        {{ t('ide.usagePanel.heatmapTitle') }}
        <span v-if="heatState === 'ok' && heatStreak > 0" class="ide-metrics-panel__hint">
          {{ t('ide.usagePanel.heatmapStreak', { days: heatStreak }) }}
        </span>
      </div>
      <div v-if="heatState === 'loading'" class="ide-metrics-panel__state">…</div>
      <div v-else-if="heatState === 'error'" class="ide-metrics-panel__state">{{ t('ide.usagePanel.heatmapLoadFailed') }}</div>
      <div v-else-if="heatState === 'empty'" class="ide-metrics-panel__state">{{ t('ide.usagePanel.heatmapEmpty') }}</div>
      <div v-else class="ide-metrics-panel__heat" data-testid="ide-metrics-heatmap">
        <span
          v-for="cell in heatCells"
          :key="cell.date"
          class="ide-metrics-panel__cell"
          :data-level="cell.level"
          :title="heatTitle(cell)"
        />
      </div>
      <!-- 台账汇总行（usage-ledger 同源：峰值日/累计/活跃天数） -->
      <div v-if="heatState === 'ok'" class="ide-metrics-panel__ledger" data-testid="ide-metrics-usage-ledger">
        <span v-if="heatPeak">{{ t('ide.usagePanel.ledgerPeak', { day: heatPeak.day, tokens: formatTokens(heatPeak.tokens) }) }}</span>
        <span>{{ t('ide.usagePanel.ledgerTotal', { tokens: formatTokens(heatTotal) }) }}</span>
      </div>
    </section>

    <!-- 成本分组（吸收第一批 B3，codex ThreadUsage）：模型×档位分组记账 -->
    <section v-if="threadUsage && threadUsage.groups.length" class="ide-metrics-panel__section">
      <div class="ide-metrics-panel__section-head">
        {{ t('ide.usagePanel.threadUsageTitle') }}
        <span class="ide-metrics-panel__hint">{{ t('ide.usagePanel.threadUsageHint') }}</span>
      </div>
      <table class="ide-metrics-panel__rounds" data-testid="ide-metrics-thread-usage">
        <thead>
          <tr>
            <th>{{ t('ide.usagePanel.threadColGroup') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.threadColTurns') }}</th>
            <th class="is-num">{{ t('ide.usagePanel.threadColTokens') }}</th>
            <th class="is-num">%</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in threadUsage.groups.slice(0, 8)" :key="g.key">
            <td class="is-model" :title="g.key">{{ g.model }} · {{ g.effort }}</td>
            <td class="is-num">{{ g.turns }}</td>
            <td class="is-num">{{ formatTokens(g.tokens) }}</td>
            <td class="is-num">{{ threadUsage.totalTokens > 0 ? ((g.tokens / threadUsage.totalTokens) * 100).toFixed(1) : '0' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ide-metrics-panel {
  position: fixed;
  right: 12px;
  bottom: 32px;
  z-index: 300;
  width: 380px;
  max-height: min(70vh, 560px);
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary, #d7dae0);
  background: var(--bg-secondary, #1b1e24);
  border: 1px solid var(--border-color, #3a3f4b);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.ide-metrics-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color, #3a3f4b);
}

.ide-metrics-panel__title {
  font-weight: 600;
}

.ide-metrics-panel__readout {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, #9aa0aa);

  &[data-level='warn'] { color: #f0a44c; }
  &[data-level='danger'] { color: var(--error-color, #d03050); }
}

.ide-metrics-panel__cost {
  font-variant-numeric: tabular-nums;
  color: #f0a44c;
}

.ide-metrics-panel__close {
  border: none;
  background: none;
  color: var(--text-muted, #9aa0aa);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;

  &:hover { color: var(--text-primary, #d7dae0); }
}

.ide-metrics-panel__low {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 8px 0 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(224, 108, 117, 0.12);
  color: var(--error-color, #d03050);
}

.ide-metrics-panel__low-title { font-weight: 600; }

.ide-metrics-panel__section {
  margin-top: 10px;
}

.ide-metrics-panel__section-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 6px;
  font-weight: 600;
  color: var(--text-secondary, #b0b5be);
}

.ide-metrics-panel__hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
}

.ide-metrics-panel__ledger {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted, #9aa0aa);
}

.ide-metrics-panel__stack {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-muted, #9aa0aa) 18%, transparent);
}

.ide-metrics-panel__stack-seg {
  display: block;
  min-width: 0;
  transition: width 0.3s ease;
}

.ide-metrics-panel__legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 12px;
  margin-top: 6px;
}

.ide-metrics-panel__legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.ide-metrics-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.ide-metrics-panel__num {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.ide-metrics-panel__pct {
  width: 34px;
  text-align: right;
  color: var(--text-muted, #9aa0aa);
  font-variant-numeric: tabular-nums;
}

.ide-metrics-panel__state {
  color: var(--text-muted, #9aa0aa);
  padding: 4px 0;
}

.ide-metrics-panel__rounds {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;

  th, td {
    padding: 2px 6px 2px 0;
    text-align: left;
    font-weight: 400;
    color: var(--text-secondary, #b0b5be);
  }

  th {
    color: var(--text-muted, #9aa0aa);
    font-size: 11px;
  }

  tfoot td {
    border-top: 1px solid var(--border-color, #3a3f4a);
    color: var(--text-secondary, #b0b5be);
    font-weight: 600;
  }

  .is-num { text-align: right; }

  .is-model {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  tbody tr:hover { background: rgba(255, 255, 255, 0.04); }
}

.ide-metrics-panel__heat {
  display: grid;
  grid-template-rows: repeat(7, 10px);
  grid-auto-flow: column;
  grid-auto-columns: 10px;
  gap: 2px;
}

.ide-metrics-panel__cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--text-muted, #9aa0aa) 15%, transparent);

  &[data-level='1'] { background: rgba(152, 195, 121, 0.3); }
  &[data-level='2'] { background: rgba(152, 195, 121, 0.5); }
  &[data-level='3'] { background: rgba(152, 195, 121, 0.75); }
  &[data-level='4'] { background: var(--success-color, #18a058); }
}
</style>
