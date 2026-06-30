<script setup lang="ts">
import { computed, watch } from 'vue'
import { VueFlow, useVueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
import { computeLayeredLayout, KIND_ROWS } from '../composables/computeLayeredLayout'

const props = defineProps<{
  nodes: TraceNode[]
  edges: TraceEdge[]
  /** 命中检索的 cluster 集合（高亮） */
  hitClusters?: Set<string> | null
  /** 当前选中的任务 cluster */
  selectedTaskId?: string | null
}>()
const emit = defineEmits<{
  (e: 'focus-task', taskId: string): void
  (e: 'select-session', sid: string): void
  (e: 'show-detail', node: TraceNode): void
}>()

const { onPaneReady, fitView, setNodes, setEdges } = useVueFlow()

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

const layout = computed(() => computeLayeredLayout(props.nodes))

const flowNodes = computed<Node[]>(() => {
  const pos = layout.value.positions
  return props.nodes.map(n => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 }
    const color = n.cluster ? clusterColorMap.value.get(n.cluster) : undefined
    const isHit = props.hitClusters && n.cluster && props.hitClusters.has(n.cluster)
    const isSelected = props.selectedTaskId && n.cluster === props.selectedTaskId
    return {
      id: n.id,
      position: { x: p.x, y: p.y },
      data: {
        label: n.label,
        detail: n.detail,
        kind: n.kind,
        status: n.status,
        profile: n.profile,
        cluster: n.cluster,
        clusterColor: color,
        isHit,
        isSelected,
      },
      type: 'topo-node',
      class: `topo-node-${n.kind} ${isHit ? 'is-hit' : ''} ${isSelected ? 'is-selected' : ''}`,
    }
  })
})

const flowEdges = computed<Edge[]>(() => {
  return props.edges.map(e => {
    const isSpawn = e.kind === 'spawn'
    const isDelegate = e.kind === 'delegate'
    const fromNode = props.nodes.find(n => n.id === e.from)
    const color = fromNode?.cluster ? clusterColorMap.value.get(fromNode.cluster) : '#999'
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      animated: isSpawn,
      markerEnd: MarkerType.ArrowClosed,
      style: {
        stroke: color,
        strokeWidth: isSpawn ? 2.5 : isDelegate ? 2 : 1,
        strokeDasharray: isDelegate ? '8 4' : undefined,
        opacity: 0.75,
      },
    }
  })
})

watch([flowNodes, flowEdges], () => {
  setNodes(flowNodes.value)
  setEdges(flowEdges.value)
}, { deep: true })

onPaneReady(() => {
  setNodes(flowNodes.value)
  setEdges(flowEdges.value)
  fitView({ padding: 0.15 })
})

function onNodeClick(payload: { node?: Node } & Node) {
  const node = (payload as { node?: Node }).node ?? payload
  const orig = props.nodes.find(n => n.id === node.id)
  if (!orig) return
  // 任务节点（ingress/workflow）→ 聚焦该任务全树
  if (orig.cluster && (orig.kind === 'ingress' || orig.kind === 'workflow')) {
    emit('focus-task', orig.cluster)
    return
  }
  // 会话级节点 → 进入单会话详细视图
  const sid = orig.ref?.sessionId
  if (sid) emit('select-session', sid)
}

function onDetailClick(nodeId: string, e: Event) {
  e.stopPropagation()
  const orig = props.nodes.find(n => n.id === nodeId)
  if (orig) emit('show-detail', orig)
}
</script>

<template>
  <div class="run-trace-topology" data-run-trace-topology>
    <!-- 左侧行标签（层级泳道） -->
    <div class="run-trace-topology__lanes">
      <div v-for="r in KIND_ROWS" :key="r.kind" class="run-trace-topology__lane">
        <span class="run-trace-topology__lane-dot" :class="`is-${r.kind}`"></span>
        <span>{{ r.label }}</span>
      </div>
    </div>
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :fit-view-on-init="true"
      :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
      @node-click="onNodeClick"
    >
      <template #node-topo-node="props">
        <div
          class="topo-card"
          :class="[`is-${props.data.kind}`, props.data.isHit ? 'is-hit' : '', props.data.isSelected ? 'is-selected' : '', props.data.status === 'running' ? 'is-running' : '']"
          :style="{ '--cluster-color': props.data.clusterColor }"
        >
          <span class="topo-card__dot"></span>
          <span class="topo-card__text">
            <b>{{ props.data.label }}</b>
            <small v-if="props.data.detail">{{ props.data.detail }}</small>
            <small v-if="props.data.profile" class="topo-card__profile">{{ props.data.profile }}</small>
          </span>
          <button type="button" class="topo-card__info" title="查看详情" @click="onDetailClick(props.id, $event)">ⓘ</button>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped lang="scss">
.run-trace-topology { position: relative; width: 100%; height: 100%; min-height: 300px; background: radial-gradient(circle at 1px 1px, var(--border-light) 1px, transparent 0) 0 0 / 16px 16px; }
:deep(.vue-flow) { width: 100%; height: 100%; background: transparent; }
:deep(.vue-flow__node) { cursor: pointer; }
.run-trace-topology__lanes { position: absolute; left: 0; top: 0; bottom: 0; width: 96px; z-index: 5; pointer-events: none; background: var(--bg-primary); border-right: 1px solid var(--border-color); }
.run-trace-topology__lane { height: 130px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-bottom: 1px dashed var(--border-color); font-size: 11px; font-weight: 600; color: var(--text-secondary); }
.run-trace-topology__lane-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.run-trace-topology__lane-dot.is-ingress { background: var(--text-muted); }
.run-trace-topology__lane-dot.is-workflow { background: var(--accent-primary); }
.run-trace-topology__lane-dot.is-agent { background: var(--success); }
.run-trace-topology__lane-dot.is-skill { background: var(--accent-info); }
.run-trace-topology__lane-dot.is-tool { background: var(--warning); }

.topo-card { position: relative; display: flex; align-items: center; gap: 7px; width: 170px; min-height: 44px; padding: 6px 24px 6px 9px; border: 1px solid var(--cluster-color, var(--border-color)); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); transition: box-shadow 0.15s; }
.topo-card.is-hit { box-shadow: 0 0 0 2px var(--accent-primary); }
.topo-card.is-selected { box-shadow: 0 0 0 3px var(--accent-primary); background: rgba(var(--accent-primary-rgb, 64,120,192), 0.06); }
.topo-card.is-running { animation: topo-pulse 1.5s ease-in-out infinite; border-color: var(--success); }
.topo-card__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cluster-color, var(--text-muted)); flex-shrink: 0; }
.topo-card.is-agent .topo-card__dot { background: var(--success); }
.topo-card.is-skill .topo-card__dot { background: var(--accent-info); }
.topo-card.is-tool .topo-card__dot { background: var(--warning); }
.topo-card__text { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.topo-card__text b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topo-card__text small { font-size: 9px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.topo-card__profile { font-size: 8px; color: var(--cluster-color, var(--text-muted)); font-weight: 600; }
.topo-card__info { position: absolute; top: 2px; right: 3px; width: 16px; height: 16px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 11px; line-height: 1; padding: 0; border-radius: 3px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
@keyframes topo-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(76, 175, 80, 0); }
}
</style>
