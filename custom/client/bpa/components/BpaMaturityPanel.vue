<!-- overlay/custom/client/bpa/components/BpaMaturityPanel.vue -->
<!-- PEMM 成熟度评估：5 流程能动因素 × 4 企业能力，各因素 P0-P4 自评；
     短板决定论（总体=最低分），历史留痕支持变革前后对比。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { bpaApi, type PemmAssessment } from '@/custom/bpa/api'
import { PEMM_FACTORS, PEMM_LEVEL_NAMES } from '@/custom/bpa/pemm'
import type { BpaMessages } from '@/custom/bpa/i18n'

const props = defineProps<{ L: BpaMessages }>()

const scores = ref<Record<string, number>>({})
const note = ref('')
const history = ref<PemmAssessment[]>([])
const busy = ref(false)
const error = ref('')
const submitted = ref(false)

const radarRef = ref<HTMLDivElement | null>(null)
const trendRef = ref<HTMLDivElement | null>(null)
let radarChart: echarts.ECharts | null = null
let trendChart: echarts.ECharts | null = null

const enablers = computed(() => PEMM_FACTORS.filter((f) => f.board === 'enabler'))
const capabilities = computed(() => PEMM_FACTORS.filter((f) => f.board === 'capability'))

const scoredCount = computed(() => Object.keys(scores.value).filter((k) => PEMM_FACTORS.some((f) => f.key === k)).length)
const overall = computed<number | null>(() => (scoredCount.value === 0 ? null : Math.min(...Object.entries(scores.value).filter(([k]) => PEMM_FACTORS.some((f) => f.key === k)).map(([, v]) => v))))
const weakest = computed(() => {
  if (overall.value === null) return []
  return Object.entries(scores.value).filter(([k, v]) => PEMM_FACTORS.some((f) => f.key === k) && v === overall.value)
    .map(([k]) => PEMM_FACTORS.find((f) => f.key === k)?.nameZh ?? k)
})
const overallName = computed(() => (overall.value === null ? '' : PEMM_LEVEL_NAMES[overall.value]?.nameZh ?? ''))

async function loadHistory(): Promise<void> {
  try {
    const r = await bpaApi.maturityHistory()
    history.value = r.history
    if (r.history.length > 0) {
      scores.value = { ...r.history[r.history.length - 1].scores } // 沿用最近一次初值，便于逐轮对比
    }
  } catch { /* fail-soft */ }
}

async function submit(): Promise<void> {
  if (scoredCount.value === 0) { error.value = props.L.maturity.scoreRequired; return }
  busy.value = true; error.value = ''; submitted.value = false
  try {
    const r = await bpaApi.submitMaturity(scores.value, note.value.trim() || undefined)
    history.value = r.history
    submitted.value = true
    setTimeout(() => { submitted.value = false }, 2000)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function levelName(v: number | undefined): string {
  return v === undefined ? '' : PEMM_LEVEL_NAMES[v]?.nameZh ?? ''
}

function renderCharts(): void {
  // 雷达：9 因素当前评估（P0-P4 → 0-4）
  if (radarRef.value) {
    if (!radarChart) radarChart = echarts.init(radarRef.value)
    radarChart.setOption({
      backgroundColor: 'transparent',
      radar: {
        indicator: PEMM_FACTORS.map((f) => ({ name: f.nameZh, max: 4 })),
        radius: '68%',
        splitNumber: 4,
        axisName: { color: 'inherit', fontSize: 10 },
      },
      series: [{
        type: 'radar',
        areaStyle: { opacity: 0.25 },
        lineStyle: { width: 2 },
        data: [{
          value: PEMM_FACTORS.map((f) => scores.value[f.key] ?? 0),
          name: props.L.maturity.title,
        }],
      }],
    }, true)
  }
  // 趋势线：各轮评估的总体成熟度（短板决定）
  if (trendRef.value && history.value.length >= 1) {
    if (!trendChart) trendChart = echarts.init(trendRef.value)
    const pts = history.value.map((h) => ({
      t: new Date(h.scoredAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric' }),
      v: Math.min(...Object.values(h.scores)),
    }))
    trendChart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 36, right: 16, top: 24, bottom: 26 },
      xAxis: { type: 'category', data: pts.map((p) => p.t), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', min: 0, max: 4, interval: 1, axisLabel: { formatter: 'P{value}', fontSize: 10 } },
      tooltip: { trigger: 'axis' },
      series: [{
        type: 'line',
        data: pts.map((p) => p.v),
        step: 'middle',
        symbolSize: 7,
        lineStyle: { width: 2, color: '#4f6ef7' },
        itemStyle: { color: '#4f6ef7' },
        areaStyle: { opacity: 0.1 },
      }],
    }, true)
  }
}

onMounted(() => { void loadHistory().then(renderCharts) })
watch([scores, history], () => renderCharts(), { deep: true })
onBeforeUnmount(() => { radarChart?.dispose(); trendChart?.dispose(); radarChart = null; trendChart = null })
</script>

<template>
  <div class="bpa-pemm" data-testid="bpa-maturity-panel">
    <p class="muted hint">{{ L.maturity.hint }}</p>

    <div class="overall" v-if="overall !== null" data-testid="bpa-pemm-overall">
      <div class="overall__score">
        <span class="num">P{{ overall }}</span>
        <span class="name">{{ overallName }}</span>
      </div>
      <div class="overall__meta">
        <p class="muted">{{ L.maturity.overall }}：{{ scoredCount }}/9</p>
        <p class="muted small">{{ L.maturity.weakest }}：{{ weakest.join('、') }}</p>
      </div>
    </div>

    <div class="charts">
      <div class="chart-box">
        <h4>{{ L.maturity.radarTitle }}</h4>
        <div ref="radarRef" class="chart" data-testid="bpa-pemm-radar"></div>
      </div>
      <div class="chart-box">
        <h4>{{ L.maturity.trendTitle }}</h4>
        <p v-if="history.length < 2" class="muted small chart-tip">{{ L.maturity.trendEmpty }}（{{ L.maturity.trendHint }}）</p>
        <div ref="trendRef" class="chart" data-testid="bpa-pemm-trend"></div>
      </div>
    </div>

    <section v-for="board in [{ key: 'enabler', title: L.maturity.enablers, factors: enablers }, { key: 'capability', title: L.maturity.capabilities, factors: capabilities }]" :key="board.key" class="board">
      <h3>{{ board.title }}</h3>
      <div v-for="f in board.factors" :key="f.key" class="factor">
        <div class="factor__desc">
          <strong>{{ f.nameZh }}</strong>
          <span class="muted small">{{ f.focusZh }}</span>
        </div>
        <div class="factor__scores" :data-testid="`bpa-pemm-${f.key}`">
          <label v-for="lv in [0,1,2,3,4]" :key="lv" :class="{ picked: scores[f.key] === lv }">
            <input v-model.number="scores[f.key]" type="radio" :value="lv" :name="`pemm-${f.key}`" />
            P{{ lv }}
          </label>
          <span class="muted small level-name">{{ levelName(scores[f.key]) }}</span>
        </div>
      </div>
    </section>

    <div class="submit-bar">
      <label class="note">{{ L.maturity.note }}<input v-model="note" /></label>
      <button type="button" class="primary" :disabled="busy" data-testid="bpa-pemm-submit" @click="submit">{{ L.maturity.submit }}</button>
      <span v-if="submitted" class="ok">✓ {{ L.maturity.submitted }}</span>
    </div>
    <p v-if="error" class="err">{{ error }}</p>

    <section class="history">
      <h3>{{ L.maturity.history }}</h3>
      <p v-if="history.length === 0" class="muted">{{ L.maturity.historyEmpty }}</p>
      <table v-else>
        <thead><tr><th>{{ L.maturity.history }}</th><th>{{ L.maturity.overall }}</th><th>{{ L.registry.note }}</th></tr></thead>
        <tbody>
          <tr v-for="h in [...history].reverse()" :key="h.id">
            <td class="mono">{{ new Date(h.scoredAt).toLocaleString() }}</td>
            <td>P{{ Math.min(...Object.values(h.scores)) }}</td>
            <td class="muted">{{ h.note || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped lang="scss">
.bpa-pemm { display: flex; flex-direction: column; gap: 12px; }
.hint { margin: 0; }
.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  .chart-box {
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 10px;
    padding: 10px;
    h4 { margin: 0 0 4px; font-size: 13px; }
    .chart { width: 100%; height: 260px; }
    .chart-tip { margin: 0 0 4px; }
  }
}
.overall { display: flex; gap: 16px; align-items: center; border: 1px solid var(--accent-primary); border-radius: 10px; padding: 12px 16px; flex-wrap: wrap;
  .overall__score { display: flex; align-items: baseline; gap: 10px;
    .num { font-size: 30px; font-weight: 700; color: var(--accent-primary); } }
  .overall__meta p { margin: 0; } }
.board { border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px;
  h3 { margin: 0 0 4px; font-size: 14px; } }
.factor { display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px dashed var(--border-color, #e5e7eb);
  &:last-child { border-bottom: none; }
  .factor__desc { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 240px;
    strong { font-size: 13px; } }
  .factor__scores { display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    label { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 3px 9px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;
      input { margin: 0; }
      &.picked { border-color: var(--accent-primary); color: var(--accent-primary); font-weight: 600; background: rgba(79, 110, 247, 0.08); } }
    .level-name { min-width: 120px; } } }
.submit-bar { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;
  .note { display: flex; flex-direction: column; gap: 3px; font-size: 12px; flex: 1; min-width: 240px;
    input { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 6px 10px; font-size: 13px; background: var(--bg-primary, #fff); color: inherit; } } }
.history { h3 { margin: 0 0 6px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px;
    th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); } } }
button.primary { background: var(--accent-primary); color: var(--text-on-accent, #fff); border: none; border-radius: 8px; padding: 7px 16px; cursor: pointer; font-size: 13px;
  &:disabled { opacity: 0.6; cursor: wait; } }
.err { color: var(--danger, #dc2626); font-size: 13px; margin: 0; }
.ok { color: var(--success, #16a34a); font-size: 13px; }
.muted { opacity: 0.65; font-size: 12px; }
.small { font-size: 11px; }
.mono { font-family: var(--font-mono, monospace); font-size: 12px; }
</style>
