<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
import { computeLayeredLayout } from '../composables/computeLayeredLayout'

const { t } = useI18n()

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

// 任务状态颜色（用于节点圆形与状态标签着色区分）
const STATUS_COLOR: Record<string, string> = {
  running: '#4CAF8B', done: '#8a8a8a', archived: '#b0b0b0', blocked: '#D65A6B',
  review: '#D69B5A', ready: '#D69B5A', triage: '#909090', todo: '#909090', scheduled: '#5AAAD6',
}

/** 转码 \uXXXX 等 unicode 转义序列为可读文本 */
function decodeText(text?: string): string {
  if (!text) return ''
  if (!/\\[unrtbf"\\]/.test(text)) return text
  try {
    return JSON.parse(`"${text.replace(/(?<!\\)"/g, '\\"')}"`)
  } catch {
    return text.replace(/\\u([0-9a-fA-F]{4})\\u([0-9a-fA-F]{4})/g, (_, hi, lo) => {
      const code = (parseInt(hi, 16) << 10) + parseInt(lo, 16) - 0x35fdc00
      try { return String.fromCodePoint(code) } catch { return _ }
    }).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
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

  // 任务状态映射：taskId → taskStatus（从有 taskStatus 的节点反查，供同任务所有节点着色）
  const taskStatusMap = new Map<string, string>()
  for (const n of props.nodes) {
    if (n.taskStatus && n.cluster) taskStatusMap.set(n.cluster, n.taskStatus)
  }

  const data = props.nodes.filter(n => vis.has(n.id)).map(n => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 }
    const cIdx = n.cluster ? clusterIdx.value.get(n.cluster) ?? 0 : 0
    const isHit = props.hitClusters && n.cluster && props.hitClusters.has(n.cluster)
    const isSelected = props.selectedTaskId && n.cluster === props.selectedTaskId
    const seq = seqMap.get(n.id) ?? 0
    const kindLabel = KIND_LABEL[n.kind] ?? n.kind
    const rawLabel = decodeText(n.label) || ''
    const taskTag = n.cluster ? n.cluster : ''
    const boardTag = n.taskBoard ?? ''
    // 节点状态：自身 taskStatus 优先，否则从所属任务(cluster)反查
    const st = n.taskStatus ?? (n.cluster ? taskStatusMap.get(n.cluster) : undefined)
    const statusTag = st ? st : ''
    const statusColor = st ? (STATUS_COLOR[st] ?? '#999') : (KIND_COLOR[n.kind] ?? '#999')
    // 标题截断
    const title = rawLabel.length > 14 ? rawLabel.slice(0, 12) + '…' : rawLabel
    return {
      id: n.id,
      name: `${rawLabel} ${taskTag}`,
      x: p.x,
      y: p.y,
      category: cIdx,
      // 圆形节点，文字放下方外部
      symbol: 'circle',
      symbolSize: isSelected ? 34 : isHit ? 30 : 26,
      itemStyle: {
        // 圆形填充：5 类类型颜色（入口/Run/Agent/Skill/Tool）
        color: KIND_COLOR[n.kind] ?? '#999',
        // 圆形边框：任务状态颜色
        borderColor: statusColor,
        borderWidth: isSelected ? 4 : 3,
        shadowBlur: 4,
        shadowColor: 'rgba(0,0,0,0.15)',
      },
      label: {
        show: true,
        position: 'bottom',
        distance: 6,
        align: 'center',
        // 第一行：数字标号(小圆) + kanban id + taskId 同一行
        formatter: () => `{seq|${seq}} {board|${boardTag}} {task|${taskTag}}\n{title|${title}}\n{status|${statusTag}}`,
        rich: {
          // 数字标号：小圆圈内含数字
          seq: { fontSize: 10, fontWeight: 'bold', color: '#fff', backgroundColor: CLUSTER_COLORS[cIdx % CLUSTER_COLORS.length], padding: [3, 4], borderRadius: 9, lineHeight: 14, align: 'center', width: 16, height: 16 },
          // kanban id：等宽深色
          board: { fontSize: 9, color: '#333', lineHeight: 14, fontFamily: 'monospace', align: 'left', padding: [0, 0, 0, 4] },
          // title：深色粗体
          title: { fontSize: 11, color: '#222', fontWeight: 'bold', lineHeight: 14, align: 'center' },
          // taskId：等宽灰色
          task: { fontSize: 9, color: '#666', lineHeight: 14, fontFamily: 'monospace', align: 'left', padding: [0, 0, 0, 4] },
          // 任务状态：状态色徽标
          status: { fontSize: 9, fontWeight: 'bold', color: '#fff', backgroundColor: statusColor, padding: [1, 5], borderRadius: 8, lineHeight: 13, align: 'center' },
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
      confine: true,
      extraCssText: 'max-width: 320px; white-space: normal; word-break: break-word; line-height: 1.4; padding: 6px 8px; font-size: 11px;',
      formatter: (p: any) => {
        const id = p.data?._nodeId
        const n = id ? nodeById.value.get(id) : null
        if (!n) return p.name
        const rows: string[] = [`<b>${decodeText(n.label)}</b>`]
        const meta: string[] = []
        if (n.taskBoard) meta.push(`kanban: ${n.taskBoard}`)
        if (n.cluster) meta.push(`taskId: ${n.cluster}`)
        if (n.taskStatus) meta.push(`状态: ${n.taskStatus}`)
        meta.push(`${n.kind}`, n.status)
        if (meta.length) rows.push(`<span style="color:#888">${meta.join(' · ')}</span>`)
        if (n.detail) rows.push(`<span style="color:#555">${decodeText(n.detail)}</span>`)
        return `<div style="max-width:300px">${rows.join('<br/>')}</div>`
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
    <div class="run-trace-topology__hint">{{ t('cockpit.scrollZoom') }}</div>
  </div>
</template>

<style scoped lang="scss">
.run-trace-topology { position: relative; width: 100%; height: 100%; min-height: 300px; }
.run-trace-topology__canvas { width: 100%; height: 100%; }
.run-trace-topology__hint { position: absolute; bottom: 6px; left: 8px; font-size: 9px; color: var(--text-muted); pointer-events: none; }
</style>
