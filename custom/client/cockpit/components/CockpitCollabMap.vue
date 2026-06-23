<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

echarts.use([GraphChart, TooltipComponent, CanvasRenderer])

const store = useCockpitStore()
const { t } = useI18n()

const chartEl = ref<HTMLElement | null>(null)
const chart = shallowRef<echarts.ECharts | null>(null)

// 图表数据：从 topology 构建 ECharts graph 所需的 nodes/links
const chartOption = computed(() => {
  const topo = store.topologyForSelectedTask
  const colorMap: Record<string, string> = {
    center: '#1a1a1a',
    ancestor: '#555',
    descendant: '#555',
    person: '#888',
    channel: '#333',
    folded: '#bbb',
  }
  const symbolSizeMap: Record<string, number> = {
    center: 60,
    ancestor: 46,
    descendant: 46,
    person: 40,
    channel: 44,
    folded: 36,
  }

  const nodes = topo.nodes.map((n) => {
    // 截断长 label（ECharts label 自带 overflow，但设宽度更稳）
    const label = n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label
    return {
      id: n.id,
      name: label,
      symbolSize: symbolSizeMap[n.kind] ?? 40,
      itemStyle: {
        color: n.kind === 'folded' ? '#eee' : '#fff',
        borderColor: colorMap[n.kind] ?? '#888',
        borderWidth: n.focus ? 3 : 1.5,
      },
      label: {
        show: true,
        color: n.kind === 'center' ? '#1a1a1a' : '#333',
        fontSize: n.kind === 'center' ? 14 : 12,
        fontWeight: n.focus ? 'bold' : 'normal',
        overflow: 'truncate',
        width: 120,
      },
      // 自定义数据（点击时用）
      _nodeKind: n.kind,
      _taskId: n.taskId,
      _targetTaskId: n.target?.taskId,
      _routeTarget: n.target?.routeTarget,
    }
  })

  const links = topo.relations.map((r) => ({
    source: r.from,
    target: r.to,
    lineStyle: { color: '#ccc', width: 1.5, curveness: 0 },
  }))

  return {
    tooltip: { show: false },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,  // 内置 pan + zoom（不影响页面布局）
      draggable: true,
      force: {
        repulsion: 220,     // 节点间排斥力（防遮挡）
        edgeLength: [80, 160],  // 连线长度范围
        gravity: 0.08,      // 向中心引力（防飞散）
        layoutAnimation: true,
      },
      label: { show: true },
      edgeSymbol: ['none', 'none'],
      edgeSymbolSize: 0,
      emphasis: {
        focus: 'adjacency',
        label: { fontSize: 14, fontWeight: 'bold' },
        lineStyle: { width: 2.5, color: '#666' },
      },
      data: nodes,
      links,
    }],
  }
})

// 节点点击处理
function onChartClick(params: any) {
  if (params.dataType !== 'node') return
  const d = params.data
  if (!d) return
  const kind = d._nodeKind
  if (kind === 'center' || kind === 'folded') return
  if (d._targetTaskId) {
    store.selectTask(d._targetTaskId)
  } else if (kind === 'channel' && d._routeTarget) {
    const ch = store.channelsForSelectedTask.find(c => c.taskId === d._taskId)
    if (ch) store.selectChannel(ch.id)
  }
}

function renderChart() {
  if (!chart.value) return
  chart.value.setOption(chartOption.value, { notMerge: true })
}

const hasTask = computed(() => !!store.selectedTask)

// 数据变化时重渲染
watch(chartOption, () => renderChart(), { deep: true })

onMounted(() => {
  if (chartEl.value) {
    chart.value = echarts.init(chartEl.value)
    chart.value.on('click', onChartClick)
    if (hasTask.value) renderChart()
  }
  window.addEventListener('resize', onResize)
})

function onResize() {
  chart.value?.resize()
}

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div class="cockpit-map">
    <div class="cockpit-map__head">
      <span class="cockpit-map__title">{{ t('cockpit.collaborationMap') }}</span>
      <div class="cockpit-map__tools">
        <span class="cockpit-map__hint-inline">滚轮缩放 · 拖拽节点/画布 · 点击联动</span>
      </div>
    </div>
    <div v-if="hasTask" ref="chartEl" class="cockpit-map__chart"></div>
    <div v-else class="cockpit-map__empty">{{ t('cockpit.noTaskSelected') }}</div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-map { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); }
.cockpit-map__head { display: flex; align-items: center; gap: 8px; padding: 8px 44px 4px 16px; flex-shrink: 0; }
.cockpit-map__title { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
.cockpit-map__tools { margin-left: auto; }
.cockpit-map__hint-inline { font-size: 9px; color: var(--text-muted); }
.cockpit-map__chart { flex: 1 1 0; min-height: 100px; width: 100%; }
.cockpit-map__empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; }
</style>
