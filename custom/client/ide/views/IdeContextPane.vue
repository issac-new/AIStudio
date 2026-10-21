<script setup lang="ts">
// IdeContextPane — 会话内上下文透视页签（context-insights P1，对标 dsh-context Context 标签页）。
// 聚合四个既有数据面为分区卡片：统计汇总 + 每轮用量表（/usage/rounds 台账，口径同
// IdeMetricsPopover G8）/ 当前组成（computeBreakdown + six-source，与 IdeContextBar 同源同值）/
// 压缩留痕（直接内嵌 IdeCompactionCard，单一事实源）。P2 趋势图与 P3 Fleet 分区后续增量挂入。
// 面板词条自备 zh/en（IDE_LOCAL_TEXT 先例，不进上游 locale）。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { useSessionMetrics } from '../composables/useSessionMetrics'
import { ideUsageApi, type UsageRoundRow, type ContextTrendResponse, type ContextTrendStep } from '../api/usage'
import { roundsSummary } from '../utils/rounds-table'
import { computeBreakdown } from '../utils/contextBreakdown'
import { fromFourSegments, type SixSourceEntry } from '../utils/context-six-source'
import { estimateCostUsd } from '../utils/modelPricing'
import { formatTokens } from '../utils/metrics'
import { ideLocaleOf } from '../i18n'
import IdeCompactionCard from '../components/IdeCompactionCard.vue'

const { locale } = useI18n()
const chatStore = useChatStore()
const ide = useIdeStore()
const metrics = useSessionMetrics()

const TEXT = {
  zh: {
    title: '上下文透视', archiveLink: '打开上下文档案',
    statsTitle: '统计汇总', statsRounds: '轮次', statsTokens: '计费 tokens',
    statsCost: '估算成本', statsHit: '缓存命中率', statsActive: '活跃时长',
    statsEmpty: '本会话暂无用量台账（新会话或非 studio 会话）', statsError: '用量台账不可用（服务未响应）',
    statsLoading: '读取台账中…',
    compTitle: '当前组成', compNoTelemetry: '无遥测（coding-agent 类会话不上报 contextTokens）',
    compEstimate: '前端四段映射估算，非服务端精确 span',
    roundsTitle: '每轮用量（近 10 轮）', roundsEmpty: '尚无轮次记录',
    trendTitle: '逐轮组成趋势', trendEmpty: '趋势数据未就绪',
    trendApprox: '旧会话无 run 标记，用量按时间序近似对齐', trendTruncated: '仅显示最近 200 轮',
    trendEstimate: '组成按 chars/4 估算',
    colRound: '#', colModel: '模型', colIn: '输入', colOut: '输出', colHit: '命中', colDur: '耗时', colCost: '费用',
    uncatalogued: '未收录价目',
  },
  en: {
    title: 'Context Insights', archiveLink: 'Open context archive',
    statsTitle: 'Stats', statsRounds: 'Rounds', statsTokens: 'Billed tokens',
    statsCost: 'Est. cost', statsHit: 'Cache hit', statsActive: 'Active time',
    statsEmpty: 'No usage ledger for this session (new or non-studio session)', statsError: 'Usage ledger unavailable (service not responding)',
    statsLoading: 'Loading ledger…',
    compTitle: 'Current composition', compNoTelemetry: 'No telemetry (coding-agent sessions report no contextTokens)',
    compEstimate: 'Frontend four-segment mapping estimate, not exact server spans',
    roundsTitle: 'Per-round usage (last 10)', roundsEmpty: 'No rounds yet',
    trendTitle: 'Composition trend', trendEmpty: 'Trend data not ready',
    trendApprox: 'Legacy session without run markers; usage aligned by time order (approximate)', trendTruncated: 'Showing last 200 rounds only',
    trendEstimate: 'Composition estimated at chars/4',
    colRound: '#', colModel: 'Model', colIn: 'In', colOut: 'Out', colHit: 'Hit', colDur: 'Time', colCost: 'Cost',
    uncatalogued: 'no price entry',
  },
} as const
const tx = computed(() => TEXT[ideLocaleOf(locale)])

// ── 轮表台账（口径同 IdeMetricsPopover：REST 行→RoundRow→roundsSummary 单一源）──
const rounds = ref<UsageRoundRow[]>([])
const roundsState = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

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
onMounted(() => { void loadRounds(); void loadTrend() })
watch(() => chatStore.activeSessionId, () => { void loadRounds(); void loadTrend() })

const roundRows = computed(() => rounds.value.map((row, i) => ({
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

const total = computed(() => (rounds.value.length ? roundsSummary(roundRows.value) : null))

/** 缓存命中率：cacheRead / (input+cacheRead+cacheWrite)，口径同 dsh prompt 分母。 */
const cacheHit = computed(() => {
  const t = total.value
  if (!t) return null
  const read = rounds.value.reduce((s, r) => s + r.cache_read_tokens, 0)
  const inAll = rounds.value.reduce((s, r) => s + r.input_tokens + r.cache_read_tokens + r.cache_write_tokens, 0)
  return inAll > 0 ? Math.round((read / inAll) * 100) : null
})

/** 成本：价目未收录模型不计入（dsh 三原则，不虚报 0）。 */
const costText = computed(() => {
  if (!total.value || total.value.totalCostIdle === null) return null
  return `$${total.value.totalCostIdle.toFixed(3)}`
})

const activeText = computed(() => {
  const ms = total.value?.totalMs ?? 0
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
})

const lastRounds = computed(() => roundRows.value.slice(-10).reverse())

function hitOf(row: { inputTokens: number; cacheReadTokens: number }): string {
  const denom = row.inputTokens + row.cacheReadTokens
  return denom > 0 ? `${Math.round((row.cacheReadTokens / denom) * 100)}%` : '—'
}

function durText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

// ── 当前组成（与 IdeContextBar 同源：computeBreakdown 四段 + six-source 映射）──
const contextUsed = computed(() => (metrics as unknown as { contextUsed?: { value: number } }).contextUsed?.value ?? 0)
const contextLength = computed(() => (metrics as unknown as { contextLength?: { value: number } }).contextLength?.value ?? 0)

const breakdown = computed(() =>
  computeBreakdown((chatStore.activeSession?.messages ?? []) as never, contextUsed.value))

const SEG_COLORS: Record<string, string> = {
  system: 'var(--warning-color)', user: 'var(--primary-color)',
  assistant: 'var(--success-color)', tool: 'var(--info-color)',
}
const SEG_LABELS: Record<string, { zh: string; en: string }> = {
  system: { zh: 'system/提示词', en: 'system/prompt' },
  user: { zh: '用户消息', en: 'user' },
  assistant: { zh: 'assistant/思考', en: 'assistant/thinking' },
  tool: { zh: '工具', en: 'tools' },
}

const compSegments = computed(() => {
  const b = breakdown.value
  if (!b || b.total <= 0) return []
  return b.segments
    .filter(seg => seg.tokens > 0)
    .map(seg => ({ ...seg, pct: (seg.tokens / b.total) * 100 }))
})

const sixSources = computed<SixSourceEntry[]>(() => {
  const b = breakdown.value
  if (!b || contextUsed.value <= 0) return []
  const t = { user: 0, assistant: 0, tool: 0, system: 0 }
  for (const seg of b.segments) t[seg.key as keyof typeof t] = seg.tokens
  return fromFourSegments(t, contextUsed.value).sources.filter(e => e.tokens > 0)
})

const SIX_LABELS: Record<string, { zh: string; en: string }> = {
  systemPrompt: { zh: '系统提示词', en: 'system prompt' }, memory: { zh: '记忆', en: 'memory' },
  tools: { zh: '工具 schema', en: 'tool schemas' }, skills: { zh: '技能', en: 'skills' },
  messages: { zh: '消息', en: 'messages' }, other: { zh: '其他', en: 'other' },
}

const usagePct = computed(() =>
  contextLength.value > 0 ? Math.min(100, Math.round((contextUsed.value / contextLength.value) * 100)) : 0)

// ── 逐轮组成趋势（P2；server fold，CSS 堆叠条带——页签内轻量可测，不引 echarts）──
const trend = ref<ContextTrendResponse | null>(null)
const trendState = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

async function loadTrend(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) {
    trend.value = null
    trendState.value = 'empty'
    return
  }
  trendState.value = 'loading'
  try {
    const res = await ideUsageApi.contextTrend(sid)
    trend.value = res
    trendState.value = res.available && res.steps?.length ? 'ok' : 'empty'
  } catch {
    trendState.value = 'error'
  }
}

const TREND_MAX_BARS = 120
const trendSteps = computed<ContextTrendStep[]>(() => (trend.value?.steps ?? []).slice(-TREND_MAX_BARS))
const trendMax = computed(() => Math.max(1, ...trendSteps.value.map(s => s.total)))

/** 压缩标记：首个 seq ≥ throughMessageId 的柱（柱上 ▼ 角标）。 */
const compactMarkSeq = computed(() => {
  const ev = trend.value?.events?.find(e => e.kind === 'compaction')
  if (!ev) return null
  const hit = trendSteps.value.find(s => s.seq >= ev.throughMessageId)
  return hit ? hit.seq : null
})

const BUCKET_ORDER: Array<'system' | 'user' | 'assistant' | 'tool'> = ['system', 'user', 'assistant', 'tool']

function barHeight(total: number): number {
  return Math.max(6, Math.round((total / trendMax.value) * 100))
}

function stepTitle(s: ContextTrendStep): string {
  const u = s.usage
  const usageText = u ? `；in ${u.input} / out ${u.output}${u.model ? ` / ${u.model}` : ''}` : ''
  return `轮 ${s.turn}（至消息 #${s.seq}）：共 ${formatTokens(s.total)}——sys ${s.buckets.system} / user ${s.buckets.user} / asst ${s.buckets.assistant} / tool ${s.buckets.tool}${usageText}`
}

function openArchive(): void {
  ide.setSidePaneTab('ctxarchive')
}
</script>

<template>
  <div class="ide-ctxpane" data-testid="ide-ctxpane">
    <header class="ide-ctxpane__head">
      <span class="ide-ctxpane__title">{{ tx.title }}</span>
      <button
        type="button"
        class="ide-ctxpane__link"
        data-testid="ide-ctxpane-archive-link"
        @click="openArchive"
      >{{ tx.archiveLink }}</button>
    </header>

    <!-- 统计汇总 -->
    <section class="ide-ctxpane__card" data-testid="ide-ctxpane-stats">
      <h4>{{ tx.statsTitle }}</h4>
      <p v-if="roundsState === 'loading'" class="ide-ctxpane__hint">{{ tx.statsLoading }}</p>
      <p v-else-if="roundsState === 'empty'" class="ide-ctxpane__hint" data-testid="ide-ctxpane-stats-empty">{{ tx.statsEmpty }}</p>
      <p v-else-if="roundsState === 'error'" class="ide-ctxpane__hint is-error" data-testid="ide-ctxpane-stats-error">{{ tx.statsError }}</p>
      <dl v-else-if="total" class="ide-ctxpane__stats">
        <div><dt>{{ tx.statsRounds }}</dt><dd data-testid="ide-ctxpane-stats-rounds">{{ total.rounds }}</dd></div>
        <div><dt>{{ tx.statsTokens }}</dt><dd data-testid="ide-ctxpane-stats-tokens">{{ formatTokens(total.totalTokens) }}</dd></div>
        <div><dt>{{ tx.statsCost }}</dt><dd data-testid="ide-ctxpane-stats-cost">{{ costText ?? tx.uncatalogued }}</dd></div>
        <div><dt>{{ tx.statsHit }}</dt><dd data-testid="ide-ctxpane-stats-hit">{{ cacheHit === null ? '—' : cacheHit + '%' }}</dd></div>
        <div><dt>{{ tx.statsActive }}</dt><dd data-testid="ide-ctxpane-stats-active">{{ activeText }}</dd></div>
      </dl>
    </section>

    <!-- 当前组成（与状态栏 IdeContextBar 同源同值） -->
    <section class="ide-ctxpane__card" data-testid="ide-ctxpane-comp">
      <h4>{{ tx.compTitle }} <span v-if="usagePct" class="ide-ctxpane__pct">{{ usagePct }}%</span></h4>
      <template v-if="compSegments.length">
        <div class="ide-ctxpane__stack">
          <span
            v-for="s in compSegments"
            :key="s.key"
            :style="{ width: `${s.pct}%`, background: SEG_COLORS[s.key] ?? 'var(--text-muted)' }"
            :data-testid="`ide-ctxpane-seg-${s.key}`"
            :title="`${(SEG_LABELS[s.key] ?? { zh: s.key, en: s.key })[ideLocaleOf(locale)] ?? s.key} ${s.pct.toFixed(1)}%`"
          />
        </div>
        <ul v-if="sixSources.length" class="ide-ctxpane__six">
          <li v-for="e in sixSources" :key="e.key" :data-testid="`ide-ctxpane-six-${e.key}`">
            <span>{{ (SIX_LABELS[e.key] ?? { zh: e.key, en: e.key })[ideLocaleOf(locale)] ?? e.key }} {{ e.pct }}%</span>
            <span v-if="e.isEstimate" class="ide-ctxpane__est" :title="tx.compEstimate">≈</span>
          </li>
        </ul>
      </template>
      <p v-else class="ide-ctxpane__hint" data-testid="ide-ctxpane-comp-empty">{{ tx.compNoTelemetry }}</p>
    </section>

    <!-- 压缩留痕 + 前瞻阈值（内嵌 IdeCompactionCard，单一事实源） -->
    <section class="ide-ctxpane__card" data-testid="ide-ctxpane-compaction">
      <IdeCompactionCard />
    </section>

    <!-- 逐轮组成趋势（P2：server fold，柱高=轮总量，四桶配色同组成分区） -->
    <section class="ide-ctxpane__card" data-testid="ide-ctxpane-trend">
      <h4>
        {{ tx.trendTitle }}
        <span v-if="trendState === 'ok' && trend?.isEstimate" class="ide-ctxpane__est" :title="tx.trendEstimate">≈</span>
        <span v-if="trendState === 'ok' && trend?.usageAligned === 'order-approx'" class="ide-ctxpane__est" :title="tx.trendApprox">≈usage</span>
        <span v-if="trend?.truncated" class="ide-ctxpane__est" :title="tx.trendTruncated">…</span>
      </h4>
      <p v-if="trendState !== 'ok'" class="ide-ctxpane__hint" data-testid="ide-ctxpane-trend-empty">{{ trendState === 'error' ? tx.statsError : tx.trendEmpty }}</p>
      <div v-else class="ide-ctxpane__trend" data-testid="ide-ctxpane-trend-strip">
        <div
          v-for="s in trendSteps"
          :key="s.seq"
          class="ide-ctxpane__bar"
          :class="{ 'is-marked': compactMarkSeq === s.seq }"
          :data-testid="`ide-ctxpane-trend-bar-${s.seq}`"
          :style="{ height: `${barHeight(s.total)}%` }"
          :title="stepTitle(s)"
        >
          <span
            v-for="b in BUCKET_ORDER"
            :key="b"
            class="ide-ctxpane__bar-seg"
            :style="{ flexGrow: s.buckets[b] || 0.0001, background: SEG_COLORS[b] ?? 'var(--text-muted)' }"
          />
        </div>
      </div>
    </section>

    <!-- 每轮用量表（近 10 轮，倒序） -->
    <section class="ide-ctxpane__card" data-testid="ide-ctxpane-rounds">
      <h4>{{ tx.roundsTitle }}</h4>
      <p v-if="roundsState !== 'ok'" class="ide-ctxpane__hint">{{ tx.roundsEmpty }}</p>
      <table v-else class="ide-ctxpane__table">
        <thead>
          <tr>
            <th>{{ tx.colRound }}</th><th>{{ tx.colModel }}</th><th>{{ tx.colIn }}</th>
            <th>{{ tx.colOut }}</th><th>{{ tx.colHit }}</th><th>{{ tx.colDur }}</th><th>{{ tx.colCost }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in lastRounds" :key="r.roundIndex" :data-testid="`ide-ctxpane-round-${r.roundIndex}`">
            <td>{{ r.roundIndex + 1 }}</td>
            <td class="ide-ctxpane__model" :title="r.model ?? ''">{{ r.model ?? '—' }}</td>
            <td>{{ formatTokens(r.inputTokens + r.cacheReadTokens) }}</td>
            <td>{{ formatTokens(r.outputTokens) }}</td>
            <td>{{ hitOf(r) }}</td>
            <td>{{ durText(r.durationMs) }}</td>
            <td>{{ r.costIdle === null ? '—' : `$${r.costIdle.toFixed(3)}` }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ide-ctxpane { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; overflow-y: auto; height: 100%; }
.ide-ctxpane__head { display: flex; align-items: center; justify-content: space-between; }
.ide-ctxpane__title { font-size: 13px; font-weight: 600; color: var(--text-color); }
.ide-ctxpane__link {
  border: 1px solid var(--border-color); background: transparent; color: var(--text-muted);
  border-radius: 4px; font-size: 11px; padding: 2px 8px; cursor: pointer;
  &:hover { color: var(--primary-color); border-color: var(--primary-color); }
}
.ide-ctxpane__card {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px;
  background: var(--card-color);
  h4 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--text-muted); display: flex; gap: 8px; align-items: baseline; }
}
.ide-ctxpane__pct { color: var(--primary-color); font-weight: 500; }
.ide-ctxpane__hint { font-size: 11px; color: var(--text-muted); margin: 0; }
.ide-ctxpane__hint.is-error { color: var(--warning-color); }
.ide-ctxpane__stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px; margin: 0; }
.ide-ctxpane__stats > div { display: flex; justify-content: space-between; gap: 8px; }
.ide-ctxpane__stats dt { font-size: 11px; color: var(--text-muted); }
.ide-ctxpane__stats dd { margin: 0; font-size: 12px; font-variant-numeric: tabular-nums; }
.ide-ctxpane__stack { display: flex; height: 14px; border-radius: 4px; overflow: hidden; background: var(--hover-color, rgba(0, 0, 0, 0.06)); }
.ide-ctxpane__six { list-style: none; margin: 6px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 12px; }
.ide-ctxpane__six li { font-size: 11px; color: var(--text-muted); display: flex; gap: 4px; align-items: center; }
.ide-ctxpane__est { color: var(--warning-color); font-size: 10px; }
.ide-ctxpane__trend {
  display: flex; align-items: flex-end; gap: 2px; height: 72px;
  overflow-x: auto; padding-bottom: 2px;
}
.ide-ctxpane__bar {
  flex: 0 0 10px; min-height: 6px; display: flex; flex-direction: column-reverse;
  border-radius: 2px; position: relative; background: var(--hover-color, rgba(0, 0, 0, 0.06));
}
.ide-ctxpane__bar-seg { flex: 1 1 0; }
.ide-ctxpane__bar.is-marked::after {
  content: '▼'; position: absolute; bottom: calc(100% + 1px); left: 50%;
  transform: translateX(-50%); font-size: 8px; color: var(--warning-color); line-height: 1;
}
.ide-ctxpane__table { width: 100%; border-collapse: collapse; font-size: 11px; font-variant-numeric: tabular-nums; }
.ide-ctxpane__table th { text-align: left; color: var(--text-muted); font-weight: 500; padding: 2px 4px; border-bottom: 1px solid var(--border-color); }
.ide-ctxpane__table td { padding: 3px 4px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.ide-ctxpane__model { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
</style>
