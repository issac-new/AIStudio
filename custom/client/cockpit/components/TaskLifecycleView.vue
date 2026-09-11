<!-- overlay/custom/client/cockpit/components/TaskLifecycleView.vue -->
<!-- 任务全生命周期仪表盘（观测治理层补齐组件 2 的 UI 层）
     数据源：useTaskLifecycle（纯前端聚合 cockpitTasks）
     展示：状态漏斗 + 活跃停留时长条 + 优先级×状态热力 + 瓶颈状态告警 -->
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts/core'
import { BarChart, HeatmapChart } from 'echarts/charts'
import {
  TooltipComponent, GridComponent, VisualMapComponent, LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useCockpitStore } from '../store/cockpit'
import { useTaskLifecycle, fmtDwell, STATUS_FLOW, type LifecycleStatus } from '../composables/useTaskLifecycle'
import { resolveStatusColors } from '../styles/status-colors'

echarts.use([BarChart, HeatmapChart, TooltipComponent, GridComponent, VisualMapComponent, LegendComponent, CanvasRenderer])

const store = useCockpitStore()
const { t } = useI18n()

const agg = useTaskLifecycle(
  computed(() => store.cockpitTasksAny),
  computed(() => store.detailCacheAny),
)

// ── 图 1：状态漏斗（活跃任务分布 vs 全量分布）──
const funnelEl = ref<HTMLElement | null>(null)
let funnelChart: echarts.ECharts | null = null

const funnelOption = computed(() => {
  const colors = resolveStatusColors()
  const active = new Map(agg.activeCounts.value.map(s => [s.status, s.count]))
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['active', 'all'], bottom: 0, textStyle: { fontSize: 10 } },
    grid: { left: 60, right: 16, top: 8, bottom: 30 },
    xAxis: { type: 'value', splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: STATUS_FLOW.filter(s => active.has(s as LifecycleStatus) || agg.statusCounts.value.some(x => x.status === s)),
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: 'active',
        type: 'bar',
        data: STATUS_FLOW.filter(s => active.has(s as LifecycleStatus)).map(s => ({
          value: active.get(s as LifecycleStatus) ?? 0,
          itemStyle: { color: (colors as any)[s] ?? '#999' },
        })),
        barGap: 0,
      },
      {
        name: 'all',
        type: 'bar',
        data: STATUS_FLOW
          .filter(s => active.has(s as LifecycleStatus))
          .map(s => agg.statusCounts.value.find(x => x.status === s)?.count ?? 0),
        itemStyle: { opacity: 0.25 },
      },
    ],
  }
})

// ── 图 2：停留时长条（含瓶颈高亮）──
const dwellEl = ref<HTMLElement | null>(null)
let dwellChart: echarts.ECharts | null = null

const dwellOption = computed(() => {
  const bott = agg.bottleneck.value
  return {
    tooltip: {
      formatter: (p: any) => `${p.name}: ${fmtDwell(p.value)}（${agg.dwell.value.find(d => d.status === p.name)?.count ?? 0} 任务）`,
    },
    grid: { left: 60, right: 24, top: 8, bottom: 24 },
    xAxis: { type: 'value', axisLabel: { fontSize: 9, formatter: (v: number) => fmtDwell(v) } },
    yAxis: {
      type: 'category',
      data: agg.dwell.value.map(d => d.status),
      axisLabel: { fontSize: 10 },
    },
    series: [{
      type: 'bar',
      data: agg.dwell.value.map(d => ({
        value: d.avgMs,
        itemStyle: {
          color: bott?.status === d.status ? 'var(--error, #e53935)' : '#90a4ae',
        },
      })),
      label: {
        show: true, position: 'right', fontSize: 9,
        formatter: (p: any) => fmtDwell(p.value),
      },
    }],
  }
})

// ── 图 3：优先级 × 状态热力 ──
const heatEl = ref<HTMLElement | null>(null)
let heatChart: echarts.ECharts | null = null
const PRIOS = ['P0', 'P1', 'P2', 'P3'] as const

const heatOption = computed(() => {
  const activeStatuses = STATUS_FLOW.filter(s =>
    agg.activeCounts.value.some(x => x.status === s))
  const data: [number, number, number][] = []
  agg.priorityMatrix.value.forEach(c => {
    const y = PRIOS.indexOf(c.priority)
    const x = activeStatuses.indexOf(c.status as LifecycleStatus)
    if (y >= 0 && x >= 0) data.push([x, y, c.count])
  })
  return {
    tooltip: { formatter: (p: any) => `${PRIOS[p.value[1]]} × ${activeStatuses[p.value[0]]}: ${p.value[2]}` },
    grid: { left: 40, right: 16, top: 8, bottom: 40 },
    xAxis: { type: 'category', data: activeStatuses, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'category', data: PRIOS, axisLabel: { fontSize: 10 } },
    visualMap: {
      min: 0, max: Math.max(3, ...data.map(d => d[2])),
      calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: ['#eceff1', '#546e7a'] }, textStyle: { fontSize: 9 },
      show: false,
    },
    series: [{
      type: 'heatmap',
      data,
      label: { show: true, fontSize: 10 },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
    }],
  }
})

function renderAll() {
  if (funnelEl.value && funnelEl.value.clientWidth > 0) {
    if (!funnelChart) funnelChart = echarts.init(funnelEl.value)
    funnelChart.setOption(funnelOption.value, true)
  }
  if (dwellEl.value && dwellEl.value.clientWidth > 0) {
    if (!dwellChart) dwellChart = echarts.init(dwellEl.value)
    dwellChart.setOption(dwellOption.value, true)
  }
  if (heatEl.value && heatEl.value.clientWidth > 0) {
    if (!heatChart) heatChart = echarts.init(heatEl.value)
    heatChart.setOption(heatOption.value, true)
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  renderAll()
  resizeObserver = new ResizeObserver(renderAll)
  if (funnelEl.value) resizeObserver.observe(funnelEl.value)
})

watch([funnelOption, dwellOption, heatOption], renderAll, { deep: true })

onUnmounted(() => {
  resizeObserver?.disconnect()
  funnelChart?.dispose()
  dwellChart?.dispose()
  heatChart?.dispose()
})
</script>

<template>
  <div class="task-lifecycle" data-task-lifecycle-view>
    <div class="task-lifecycle__head">
      <span class="task-lifecycle__title">{{ t('cockpit.lifecycleTitle', '任务生命周期') }}</span>
      <span v-if="agg.medianDoneMs.value > 0" class="task-lifecycle__median">
        {{ t('cockpit.lifecycleMedian', '中位完成') }}: {{ fmtDwell(agg.medianDoneMs.value) }}
      </span>
      <div
        v-if="agg.bottleneck.value"
        class="task-lifecycle__bottleneck"
        :title="t('cockpit.lifecycleBottleneckHint', '活跃任务平均停留最长的状态')"
      >
        ⚠ {{ t('cockpit.lifecycleBottleneck', '瓶颈') }}: {{ agg.bottleneck.value.status }}
        · {{ fmtDwell(agg.bottleneck.value.avgMs) }} × {{ agg.bottleneck.value.count }}
      </div>
    </div>

    <div class="task-lifecycle__grid">
      <div class="task-lifecycle__panel">
        <div class="task-lifecycle__panel-title">{{ t('cockpit.lifecycleFunnel', '状态分布（active vs all）') }}</div>
        <div ref="funnelEl" class="task-lifecycle__chart task-lifecycle__chart--funnel" />
      </div>
      <div class="task-lifecycle__panel">
        <div class="task-lifecycle__panel-title">{{ t('cockpit.lifecycleDwell', '活跃状态平均停留') }}</div>
        <div ref="dwellEl" class="task-lifecycle__chart task-lifecycle__chart--dwell" />
      </div>
      <div class="task-lifecycle__panel">
        <div class="task-lifecycle__panel-title">{{ t('cockpit.lifecycleHeat', '优先级 × 状态') }}</div>
        <div ref="heatEl" class="task-lifecycle__chart task-lifecycle__chart--heat" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.task-lifecycle { display: flex; flex-direction: column; min-height: 0; padding: 8px 12px; }
.task-lifecycle__head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.task-lifecycle__title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.task-lifecycle__median { font-size: 11px; color: var(--text-muted); }
.task-lifecycle__bottleneck {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 3px;
  color: var(--error, #e53935); background: rgba(229, 57, 53, 0.08);
  border: 1px solid rgba(229, 57, 53, 0.3);
}
.task-lifecycle__grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 8px; min-height: 0; }
.task-lifecycle__panel {
  display: flex; flex-direction: column; border: 1px solid var(--border-color);
  border-radius: 6px; background: var(--bg-card); overflow: hidden; min-height: 160px;
}
.task-lifecycle__panel-title { font-size: 10px; font-weight: 600; color: var(--text-muted); padding: 6px 10px 2px; text-transform: uppercase; letter-spacing: 0.4px; }
.task-lifecycle__chart { flex: 1; min-height: 120px; }
@media (max-width: 1100px) { .task-lifecycle__grid { grid-template-columns: 1fr 1fr; } .task-lifecycle__panel--heat { grid-column: span 2; } }
</style>
