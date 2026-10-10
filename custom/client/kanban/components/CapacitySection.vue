<!-- overlay/custom/client/kanban/components/CapacitySection.vue -->
<!-- 容量分析（2026-10-10 麦肯锡概念三轮「容量而非人数」）：按执行者聚合的人日视图。
     汇总卡：估算覆盖率 / 人的估算人日 / Agent 承接人日（已完成释放信号）/ 实际人日。
     主图：按人（Top N）估算人日 vs 实际人日堆积柱状（echarts，RunTraceTopology 同款引法）。
     口径诚实：估算仅任务拆解建的卡有（覆盖率如实展示，未估算不折算）；人/Agent 按
     -agent 后缀约定；实际人日为 started→completed 墙上时长（含等待，上界口径）。
     数据面=GET /api/governance/capacity/overview（服务端 SQLite 只读聚合）。 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { authFetch } from '../../ide/utils/auth-fetch'

interface CapacityRow {
  assignee: string
  executor: 'human' | 'agent' | 'unassigned'
  total: number
  estimateDays: number
  deliveredDays: number
  actualDays: number
  doneCount: number
  inFlightCount: number
}
interface CapacityOverview {
  windowDays: number
  rows: CapacityRow[]
  summary: {
    totalCards: number
    withEstimate: number
    coverage: number
    humanEstimateDays: number
    agentEstimateDays: number
    agentDeliveredDays: number
    actualDaysTotal: number
  }
  note: string
}

const loading = ref(false)
const loadError = ref('')
const data = ref<CapacityOverview | null>(null)
const windowDays = ref(30)

const el = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObs: ResizeObserver | null = null

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const res = await authFetch(`/api/governance/capacity/overview?days=${windowDays.value}`)
    if (!res.ok) { loadError.value = `HTTP ${res.status}`; data.value = null; return }
    const body = (await res.json()) as { ok?: boolean } & CapacityOverview
    data.value = body.ok ? body : null
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
  resizeObs = new ResizeObserver(() => chart?.resize())
  if (el.value) resizeObs.observe(el.value)
})
onUnmounted(() => {
  resizeObs?.disconnect()
  chart?.dispose()
  chart = null
})

/** 主图数据：Top 12（估算+实际合计降序）；估算/实际同柱两段（不堆积——两者口径不同，分组柱更诚实） */
const chartRows = computed<CapacityRow[]>(() =>
  [...(data.value?.rows ?? [])]
    .sort((a, b) => (b.estimateDays + b.actualDays) - (a.estimateDays + a.actualDays))
    .slice(0, 12))

const summary = computed(() => data.value?.summary ?? null)

const EXECUTOR_LABEL: Record<string, string> = { human: '人', agent: 'Agent', unassigned: '未指派' }

function renderChart(): void {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  const rows = chartRows.value
  chart.setOption({
    grid: { left: 8, right: 12, top: 30, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = params as Array<{ name: string; seriesName: string; value: number; dataIndex: number }>
        if (!Array.isArray(list) || list.length === 0) return ''
        const row = rows[list[0]!.dataIndex]
        if (!row) return ''
        const lines = [
          `<b>${row.assignee}</b>（${EXECUTOR_LABEL[row.executor] ?? row.executor}）`,
          `卡 ${row.total}（完成 ${row.doneCount} / 在途 ${row.inFlightCount}）`,
          `估算 ${row.estimateDays} 人日 · 实际 ${row.actualDays} 人日`,
        ]
        return lines.join('<br/>')
      },
    },
    legend: { data: ['估算人日', '实际人日'], top: 0, textStyle: { fontSize: 11 } },
    xAxis: {
      type: 'category',
      data: rows.map(r => r.assignee),
      axisLabel: { fontSize: 10, interval: 0, rotate: rows.length > 7 ? 30 : 0 },
    },
    yAxis: { type: 'value', name: '人日', nameTextStyle: { fontSize: 10 } },
    series: [
      {
        name: '估算人日', type: 'bar', barMaxWidth: 26,
        itemStyle: { color: '#60a5fa' },
        data: rows.map(r => r.estimateDays),
      },
      {
        name: '实际人日', type: 'bar', barMaxWidth: 26,
        itemStyle: { color: '#a78bfa' },
        data: rows.map(r => r.actualDays),
      },
    ],
  }, true)
}

// 数据到齐后渲染（nextTick 确保容器已布局）
watch([chartRows, loading], () => {
  if (chartRows.value.length > 0 && !loading.value) void nextTick(renderChart)
}, { immediate: true })

const coveragePct = computed(() =>
  summary.value ? Math.round(summary.value.coverage * 100) : 0)
</script>

<template>
  <section class="cap" data-testid="capacity-section">
    <header class="cap__head">
      <h3 class="cap__title">容量分析（人日视角）</h3>
      <select v-model="windowDays" class="cap__window" data-testid="capacity-window" @change="refresh">
        <option :value="7">近 7 天</option>
        <option :value="30">近 30 天</option>
        <option :value="90">近 90 天</option>
      </select>
      <button type="button" class="cap__refresh" :disabled="loading" data-testid="capacity-refresh" @click="refresh">
        {{ loading ? '统计中…' : '刷新' }}
      </button>
    </header>

    <p v-if="loadError" class="cap__error" data-testid="capacity-error">容量数据加载失败：{{ loadError }}</p>

    <div v-if="summary" class="cap__cards">
      <div class="cap__card">
        <div class="cap__card-num">{{ coveragePct }}%</div>
        <div class="cap__card-label">估算覆盖率（{{ summary.withEstimate }}/{{ summary.totalCards }} 卡）</div>
      </div>
      <div class="cap__card">
        <div class="cap__card-num">{{ summary.humanEstimateDays }}</div>
        <div class="cap__card-label">人的估算人日</div>
      </div>
      <div class="cap__card cap__card--agent">
        <div class="cap__card-num">{{ summary.agentDeliveredDays }}</div>
        <div class="cap__card-label">Agent 已承接人日（已完成卡的估算）</div>
      </div>
      <div class="cap__card">
        <div class="cap__card-num">{{ summary.actualDaysTotal }}</div>
        <div class="cap__card-label">实际人日（墙上时长，上界）</div>
      </div>
    </div>

    <div v-if="chartRows.length > 0" ref="el" class="cap__chart" data-testid="capacity-chart" />
    <p v-else-if="!loading && !loadError" class="cap__empty" data-testid="capacity-empty">
      窗口内没有任务卡。先在看板建卡并对需求卡执行任务拆解，人日数据才会生长。
    </p>

    <p v-if="data" class="cap__note">{{ data.note }}</p>
  </section>
</template>

<style scoped lang="scss">
.cap {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cap__head { display: flex; align-items: center; gap: 8px; }
.cap__title { margin: 0; font-size: 14px; }
.cap__window, .cap__refresh {
  padding: 3px 8px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  color: inherit;
  font-size: 12px;
  font-family: inherit;
}
.cap__refresh { cursor: pointer; &:hover { background: var(--bg-secondary, #f1f2f4); } &:disabled { opacity: 0.6; cursor: default; } }
.cap__margin { margin-left: auto; }

.cap__error { margin: 0; font-size: 12px; color: var(--color-danger, #e11d48); }

.cap__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.cap__card {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  &--agent { border-color: #c4b5fd; background: rgba(139, 92, 246, 0.06); }
}
.cap__card-num { font-size: 20px; font-weight: 600; }
.cap__card-label { font-size: 11px; color: var(--text-secondary, #6b7280); margin-top: 2px; }

.cap__chart { width: 100%; height: 260px; }
.cap__empty { margin: 0; font-size: 12px; color: var(--text-muted, #878c99); }
.cap__note { margin: 0; font-size: 11px; color: var(--text-muted, #878c99); }
</style>
