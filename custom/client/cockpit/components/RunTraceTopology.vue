<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
import { computeLayeredLayout } from '../composables/computeLayeredLayout'

const props = defineProps<{
  nodes: TraceNode[]
  edges: TraceEdge[]
  hitClusters?: Set<string> | null
  selectedTaskId?: string | null
}>()
const emit = defineEmits<{
  (e: 'focus-task', taskId: string): void
  (e: 'select-session', sid: string): void
  (e: 'show-detail', node: TraceNode): void
  (e: 'select-node', node: TraceNode): void
}>()

// 折叠的节点 id 集合：默认折叠 skill 节点（隐藏其下 tool 调用）
const collapsedIds = ref<Set<string>>(new Set())
let defaultCollapsedInit = false
watch(() => props.nodes, (ns) => {
  if (defaultCollapsedInit || !ns || ns.length === 0) return
  defaultCollapsedInit = true
  const s = new Set<string>()
  for (const n of ns) if (n.kind === 'skill') s.add(n.id)
  collapsedIds.value = s
}, { immediate: true })

const CLUSTER_COLORS = [
  '#6B83D6', '#4CAF8B', '#D69B5A', '#B56BD6', '#5AAAD6',
  '#D65A6B', '#8B9C4C', '#6B6BD6', '#D6B05A', '#5AD6A8',
]
const KIND_COLOR: Record<string, string> = {
  ingress: '#909090', workflow: '#6B83D6', agent: '#4CAF8B', skill: '#5AAAD6', tool: '#D69B5A',
}
const KIND_LABEL: Record<string, string> = {
  ingress: '入口', workflow: 'Run', agent: 'Agent', skill: 'Skill', tool: 'Tool',
  memory: 'Memory', service: 'Service', peer: 'Peer', approval: 'Approval',
}

const layout = computed(() => computeLayeredLayout(props.nodes, props.edges, collapsedIds.value))
const visibleNodeIds = computed(() => new Set(layout.value.positions.keys()))

const clusterCategories = computed(() => {
  const clusters = [...new Set(props.nodes.map(n => n.cluster).filter(Boolean) as string[])]
  return clusters.map((c, i) => ({ name: c, itemStyle: { color: CLUSTER_COLORS[i % CLUSTER_COLORS.length] } }))
})
const clusterIdx = computed(() => {
  const m = new Map<string, number>()
  clusterCategories.value.forEach((c, i) => m.set(c.name, i))
  return m
})

const nodeById = computed(() => new Map(props.nodes.map(n => [n.id, n])))

const chartOption = computed(() => {
  const pos = layout.value.positions
  const vis = visibleNodeIds.value
  const seqMap = new Map<string, number>()
  ;[...vis].sort((a, b) => (nodeById.value.get(a)?.startedAt ?? 0) - (nodeById.value.get(b)?.startedAt ?? 0))
    .forEach((id, i) => seqMap.set(id, i + 1))

  const data = props.nodes.filter(n => vis.has(n.id)).map(n => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 }
    const cIdx = n.cluster ? clusterIdx.value.get(n.cluster) ?? 0 : 0
    const isHit = props.hitClusters && n.cluster && props.hitClusters.has(n.cluster)
    const isSelected = props.selectedTaskId && n.cluster === props.selectedTaskId
    const seq = seqMap.get(n.id) ?? 0
    const kindLabel = KIND_LABEL[n.kind] ?? n.kind
    // 标题截断
    const title = n.label && n.label.length > 16 ? n.label.slice(0, 14) + '…' : (n.label || '')
    const taskTag = n.cluster ? n.cluster : ''
    const statusTag = n.taskStatus ? `[${n.taskStatus}]` : ''
    return {
      id: n.id,
      name: `${title} ${taskTag}`,
      x: p.x,
      y: p.y,
      category: cIdx,
      symbol: 'circle',
      symbolSize: isSelected ? 54 : isHit ? 48 : 42,
      itemStyle: {
        color: KIND_COLOR[n.kind] ?? '#999',
        borderColor: isSelected ? '#ff6600' : isHit ? '#6B83D6' : '#fff',
        borderWidth: isSelected ? 3 : isHit ? 2 : 1.5,
        shadowBlur: 4,
        shadowColor: 'rgba(0,0,0,0.15)',
      },
      label: {
        show: true,
        position: 'bottom',
        distance: 6,
        width: 160,
        overflow: 'truncate',
        formatter: () => `{seq|#${seq}} {kind|${kindLabel}}\n{title|${title}}\n{task|${taskTag}${statusTag}}`,
        rich: {
          seq: { fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: CLUSTER_COLORS[cIdx % CLUSTER_COLORS.length], padding: [1, 5], borderRadius: 8 },
          kind: { fontSize: 9, color: KIND_COLOR[n.kind] ?? '#666', padding: [0, 0, 0, 4] },
          title: { fontSize: 11, color: '#222', fontWeight: 'bold', lineHeight: 14 },
          task: { fontSize: 9, color: '#888', lineHeight: 12 },
        },
      },
      _nodeId: n.id,
    }
  })
  const links = props.edges.filter(e => vis.has(e.from) && vis.has(e.to)).map(e => {
    const isSpawn = e.kind === 'spawn'
    const isDelegate = e.kind === 'delegate'
    const fromNode = nodeById.value.get(e.from)
    const cIdx = fromNode?.cluster ? clusterIdx.value.get(fromNode.cluster) ?? -1 : -1
    const color = cIdx >= 0 ? CLUSTER_COLORS[cIdx % CLUSTER_COLORS.length] : '#999'
    return {
      source: e.from,
      target: e.to,
      lineStyle: {
        color,
        width: isSpawn ? 2.5 : isDelegate ? 2 : 1.2,
        type: isDelegate ? 'dashed' : 'solid',
        opacity: 0.7,
        curveness: 0.15,
      },
    }
  })
  return {
    tooltip: {
      formatter: (p: any) => {
        const id = p.data?._nodeId
        const n = id ? nodeById.value.get(id) : null
        if (!n) return p.name
        return `<b>${n.label}</b><br/>kind: ${n.kind}<br/>status: ${n.status}<br/>${n.detail || ''}`
      },
    },
    legend: { show: false },
    animationDuration: 400,
    series: [{
      type: 'graph',
      layout: 'none',
      data,
      links,
      categories: clusterCategories.value,
      roam: true,
      zoom: 1,
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
      lineStyle: { color: '#999', curveness: 0.15 },
    }],
  }
})

const containerRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!containerRef.value) return
  chart = echarts.init(containerRef.value)
  chart.setOption(chartOption.value)
  chart.on('click', (params: any) => {
    const id = params.data?._nodeId
    if (!id) return
    const n = nodeById.value.get(id)
    if (!n) return
    emit('select-node', n)
    if (n.cluster && (n.kind === 'ingress' || n.kind === 'workflow')) {
      emit('focus-task', n.cluster)
      return
    }
    if (n.kind === 'agent' || n.kind === 'skill' || n.kind === 'tool') return
    const sid = n.ref?.sessionId
    if (sid) emit('select-session', sid)
  })
  // 监听容器尺寸变化（右侧面板出现/隐藏时自适应）
  resizeObserver = new ResizeObserver(() => {
    chart?.resize()
  })
  resizeObserver.observe(containerRef.value)
})

watch(chartOption, (opt) => {
  chart?.setOption(opt, true)
}, { deep: true })

// 兜底：节点/边变化时强制刷新
watch([() => props.nodes, () => props.edges, () => props.selectedTaskId, () => props.hitClusters], () => {
  if (chart) {
    chart.setOption(chartOption.value, true)
    chart.resize()
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="run-trace-topology" data-run-trace-topology>
    <div ref="containerRef" class="run-trace-topology__canvas"></div>
    <div class="run-trace-topology__hint">点击任务聚焦 · 点击节点查看右侧详情 · 滚轮缩放 · 拖拽平移</div>
  </div>
</template>

<style scoped lang="scss">
.run-trace-topology { position: relative; width: 100%; height: 100%; min-height: 300px; }
.run-trace-topology__canvas { width: 100%; height: 100%; }
.run-trace-topology__hint { position: absolute; bottom: 6px; left: 8px; font-size: 9px; color: var(--text-muted); pointer-events: none; }
</style>
