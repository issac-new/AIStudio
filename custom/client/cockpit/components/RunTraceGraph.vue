<script setup lang="ts">
import { computed, watch } from 'vue'
import { VueFlow, useVueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
import { computeForceLayout } from '../composables/useForceLayout'

const props = defineProps<{
  nodes: TraceNode[]
  edges: TraceEdge[]
  focusedNodeId: string | null
  currentTime: number
}>()
const emit = defineEmits<{ (e: 'focus-node', id: string): void }>()

const { onPaneReady, fitView, setNodes, setEdges } = useVueFlow()

// cluster → 颜色（按任务聚类着色）。用有限色板循环。
const CLUSTER_COLORS = [
  '#6B83D6', '#4CAF8B', '#D69B5A', '#B56BD6', '#5AAAD6',
  '#D65A6B', '#8B9C4C', '#6B6BD6', '#D6B05A', '#5AD6A8',
]
const clusterColorMap = computed(() => {
  const map = new Map<string, string>()
  const clusters = [...new Set(props.nodes.map(n => n.cluster).filter(Boolean) as string[])]
  clusters.forEach((c, i) => map.set(c, CLUSTER_COLORS[i % CLUSTER_COLORS.length]))
  return map
})

// 时间联动：节点是否已激活（startedAt <= currentTime）
function isNodeActive(n: TraceNode): boolean {
  return n.startedAt <= props.currentTime
}
// 节点是否当前正在运行（startedAt <= t <= endedAt，或无 endedAt 且已激活）
function isNodeRunning(n: TraceNode): boolean {
  if (!isNodeActive(n)) return false
  if (n.endedAt == null) return n.status === 'running'
  return n.endedAt >= props.currentTime
}

// d3-force 力导向布局计算坐标
const layoutPositions = computed(() => {
  const forceNodes = props.nodes.map(n => ({ id: n.id, cluster: n.cluster ?? n.ref?.sessionId ?? 'default', kind: n.kind }))
  const forceEdges = props.edges.map(e => ({ source: e.from, target: e.to }))
  return computeForceLayout(forceNodes, forceEdges, 900, 600)
})

// 转换为 vue-flow Node[]
const flowNodes = computed<Node[]>(() => {
  return props.nodes.map(n => {
    const pos = layoutPositions.value.get(n.id) ?? { x: 0, y: 0 }
    const active = isNodeActive(n)
    const running = isNodeRunning(n)
    const color = n.cluster ? clusterColorMap.value.get(n.cluster) : undefined
    return {
      id: n.id,
      position: pos,
      data: {
        label: n.label,
        detail: n.detail || n.evidence,
        kind: n.kind,
        status: n.status,
        active,
        running,
        focused: n.id === props.focusedNodeId,
        clusterColor: color,
        profile: n.profile,
      },
      type: 'trace-node',
      // 淡化未激活节点：通过 class 控制
      class: `trace-node-${n.kind} ${active ? 'is-active' : 'is-dimmed'} ${running ? 'is-running' : ''} ${n.id === props.focusedNodeId ? 'is-focused' : ''}`,
    }
  })
})

// 转换为 vue-flow Edge[]
const flowEdges = computed<Edge[]>(() => {
  return props.edges.map(e => {
    const isDashed = e.kind === 'delegate'
    const isDotted = e.kind === 'converge'
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'default',
      animated: e.kind === 'spawn',
      markerEnd: MarkerType.ArrowClosed,
      style: {
        stroke: clusterColorMap.value.get(props.nodes.find(n => n.id === e.from)?.cluster ?? '') ?? '#999',
        strokeWidth: e.kind === 'spawn' ? 2 : 1,
        strokeDasharray: isDashed ? '6 4' : isDotted ? '2 4' : undefined,
        opacity: 0.7,
      },
    }
  })
})

// 节点/边变化时同步到 vue-flow 实例
watch([flowNodes, flowEdges], () => {
  setNodes(flowNodes.value)
  setEdges(flowEdges.value)
}, { deep: true })

onPaneReady(() => {
  setNodes(flowNodes.value)
  setEdges(flowEdges.value)
  fitView({ padding: 0.2 })
})

function onNodeClick(payload: { node?: Node } & Node) {
  // vue-flow node-click 事件参数为 { node: GraphNode, event }；兼容直接传 Node 的情况
  const node = (payload as { node?: Node }).node ?? payload
  emit('focus-node', node.id)
}
</script>

<template>
  <div class="run-trace-graph" data-run-trace-graph>
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :fit-view-on-init="true"
      :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
      @node-click="onNodeClick"
    >
      <template #node-trace-node="props">
        <div
          class="trace-node-card"
          :class="[`is-${props.data.kind}`, props.data.active ? 'is-active' : 'is-dimmed', props.data.running ? 'is-running' : '', props.data.focused ? 'is-focused' : '']"
          :style="{ '--cluster-color': props.data.clusterColor }"
        >
          <span class="trace-node-card__dot"></span>
          <span class="trace-node-card__text">
            <b>{{ props.data.label }}</b>
            <small>{{ props.data.detail }}</small>
            <small v-if="props.data.profile" class="trace-node-card__profile">{{ props.data.profile }}</small>
          </span>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped lang="scss">
.run-trace-graph { position: relative; width: 100%; height: 100%; min-height: 400px; background: radial-gradient(circle at 1px 1px, var(--border-light) 1px, transparent 0) 0 0 / 16px 16px; }
:deep(.vue-flow) { width: 100%; height: 100%; background: transparent; }
:deep(.vue-flow__node) { cursor: pointer; }
.trace-node-card {
  display: flex; align-items: center; gap: 7px; min-width: 100px; max-width: 160px;
  padding: 6px 9px; border: 1px solid var(--cluster-color, var(--border-color));
  border-radius: 6px; background: var(--bg-card); color: var(--text-primary);
  transition: opacity 0.3s, box-shadow 0.2s;
}
.trace-node-card.is-dimmed { opacity: 0.22; }
.trace-node-card.is-active { opacity: 1; }
.trace-node-card.is-focused { border-width: 2px; box-shadow: 0 0 0 3px rgba(107, 163, 214, 0.22); }
.trace-node-card.is-running { animation: trace-node-pulse 1.5s ease-in-out infinite; }
.trace-node-card__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cluster-color, var(--text-muted)); flex-shrink: 0; }
.trace-node-card.is-agent .trace-node-card__dot { background: var(--success); }
.trace-node-card.is-skill .trace-node-card__dot { background: var(--accent-info); }
.trace-node-card.is-tool .trace-node-card__dot { background: var(--warning); }
.trace-node-card.is-error .trace-node-card__dot { background: var(--error); }
.trace-node-card__text { display: flex; flex-direction: column; min-width: 0; }
.trace-node-card__text b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trace-node-card__text small { font-size: 9px; color: var(--text-muted); }
.trace-node-card__profile { font-size: 8px; color: var(--cluster-color, var(--text-muted)); font-weight: 600; }
@keyframes trace-node-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(76, 175, 80, 0); }
}
</style>
