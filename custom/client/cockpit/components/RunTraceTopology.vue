<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VueFlow, useVueFlow, MarkerType, type Node, type Edge } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
import { computeLayeredLayout } from '../composables/computeLayeredLayout'

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

// 折叠的节点 id 集合：默认折叠 skill 节点（隐藏其下 tool 调用），避免过密。
// 用户点击 ± 可展开/收起任意有子节点的节点。
const collapsedIds = ref<Set<string>>(new Set())
let defaultCollapsedInit = false
// 首次拿到节点时，把所有 skill 节点加入默认折叠集
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
const clusterColorMap = computed(() => {
  const map = new Map<string, string>()
  const clusters = [...new Set(props.nodes.map(n => n.cluster).filter(Boolean) as string[])]
  clusters.forEach((c, i) => map.set(c, CLUSTER_COLORS[i % CLUSTER_COLORS.length]))
  return map
})

// 节点是否有子节点（决定是否显示折叠按钮）
const hasChildren = computed(() => {
  const set = new Set<string>()
  for (const e of props.edges) set.add(e.from)
  return set
})

const layout = computed(() => computeLayeredLayout(props.nodes, props.edges, collapsedIds.value))

// 可见节点（布局计算后存在的）
const visibleNodeIds = computed(() => new Set(layout.value.positions.keys()))

const flowNodes = computed<Node[]>(() => {
  const pos = layout.value.positions
  return props.nodes.filter(n => visibleNodeIds.value.has(n.id)).map(n => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 }
    const color = n.cluster ? clusterColorMap.value.get(n.cluster) : undefined
    const isHit = props.hitClusters && n.cluster && props.hitClusters.has(n.cluster)
    const isSelected = props.selectedTaskId && n.cluster === props.selectedTaskId
    const isCollapsed = collapsedIds.value.has(n.id)
    const canCollapse = hasChildren.value.has(n.id)
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
        taskStatus: n.taskStatus,
        clusterColor: color,
        isHit,
        isSelected,
        isCollapsed,
        canCollapse,
        seq: p.seq,
      },
      type: 'topo-node',
      zIndex: 10,
      class: `topo-node-${n.kind} ${isHit ? 'is-hit' : ''} ${isSelected ? 'is-selected' : ''}`,
    }
  })
})

const flowEdges = computed<Edge[]>(() => {
  const vis = visibleNodeIds.value
  const pos = layout.value.positions
  const EDGE_LABEL: Record<string, string> = { spawn: '派生', delegate: '委托', call: '调用', converge: '汇聚', recall: '回忆' }
  return props.edges.filter(e => vis.has(e.from) && vis.has(e.to)).map(e => {
    const isSpawn = e.kind === 'spawn'
    const isDelegate = e.kind === 'delegate'
    const fromNode = props.nodes.find(n => n.id === e.from)
    const toNode = props.nodes.find(n => n.id === e.to)
    const color = fromNode?.cluster ? clusterColorMap.value.get(fromNode.cluster) : '#999'
    const fromSeq = pos.get(e.from)?.seq
    const toSeq = pos.get(e.to)?.seq
    const label = (fromSeq && toSeq) ? `${EDGE_LABEL[e.kind] ?? e.kind} #${fromSeq}→#${toSeq}` : (EDGE_LABEL[e.kind] ?? e.kind)
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'bezier',
      animated: isSpawn,
      label,
      labelStyle: { fill: color, fontSize: '9px', fontWeight: 600 },
      labelBgStyle: { fill: 'var(--bg-card)', fillOpacity: 0.92 },
      labelBgPadding: [6, 2] as [number, number],
      labelBgBorderRadius: 4,
      zIndex: 1,
      markerEnd: MarkerType.ArrowClosed,
      style: {
        stroke: color,
        strokeWidth: isSpawn ? 2.5 : isDelegate ? 2 : 1.2,
        strokeDasharray: isDelegate ? '8 4' : undefined,
        opacity: 0.7,
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

// 节点变化时重新 fitView（折叠/展开后自适应）
watch(layout, () => {
  setTimeout(() => fitView({ padding: 0.15 }), 50)
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
  const sid = orig.ref?.sessionId
  if (sid) emit('select-session', sid)
}

function onDetailClick(nodeId: string, e: Event) {
  e.stopPropagation()
  const orig = props.nodes.find(n => n.id === nodeId)
  if (orig) emit('show-detail', orig)
}

/** 折叠/展开节点子树 */
function onToggleCollapse(nodeId: string, e: Event) {
  e.stopPropagation()
  const s = new Set(collapsedIds.value)
  if (s.has(nodeId)) s.delete(nodeId)
  else s.add(nodeId)
  collapsedIds.value = s
}
</script>

<template>
  <div class="run-trace-topology" data-run-trace-topology>
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :fit-view-on-init="true"
      :min-zoom="0.2"
      :max-zoom="2"
      :default-edge-options="{ markerEnd: MarkerType.ArrowClosed }"
      @node-click="onNodeClick"
    >
      <template #node-topo-node="props">
        <div
          class="topo-card"
          :class="[`is-${props.data.kind}`, props.data.isHit ? 'is-hit' : '', props.data.isSelected ? 'is-selected' : '', props.data.status === 'running' ? 'is-running' : '', props.data.isCollapsed ? 'is-collapsed' : '']"
          :style="{ '--cluster-color': props.data.clusterColor }"
        >
          <span class="topo-card__seq" :title="`时序 #${props.data.seq}`">{{ props.data.seq }}</span>
          <span class="topo-card__dot"></span>
          <span class="topo-card__text">
            <b>{{ props.data.label }}</b>
            <span v-if="props.data.cluster || props.data.taskStatus" class="topo-card__tags">
              <span v-if="props.data.cluster" class="topo-card__task" :title="`任务 ${props.data.cluster}`">{{ props.data.cluster }}</span>
              <span v-if="props.data.taskStatus" class="topo-card__status" :class="`is-${props.data.taskStatus}`">{{ props.data.taskStatus }}</span>
            </span>
            <small v-if="props.data.detail">{{ props.data.detail }}</small>
            <small v-if="props.data.profile" class="topo-card__profile">{{ props.data.profile }}</small>
          </span>
          <button type="button" class="topo-card__info" title="查看详情" @click="onDetailClick(props.id, $event)">ⓘ</button>
          <button
            v-if="props.data.canCollapse"
            type="button"
            class="topo-card__toggle"
            :title="props.data.isCollapsed ? '展开子节点' : '折叠子节点'"
            @click="onToggleCollapse(props.id, $event)"
          >{{ props.data.isCollapsed ? '+' : '−' }}</button>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped lang="scss">
.run-trace-topology { position: relative; width: 100%; height: 100%; min-height: 300px; background: radial-gradient(circle at 1px 1px, var(--border-light) 1px, transparent 0) 0 0 / 18px 18px; }
:deep(.vue-flow) { width: 100%; height: 100%; background: transparent; }
:deep(.vue-flow__node) { cursor: pointer; }

.topo-card { position: relative; display: flex; align-items: center; gap: 8px; width: 190px; min-height: 56px; padding: 7px 28px 7px 10px; border: 1px solid var(--cluster-color, var(--border-color)); border-radius: 7px; background: var(--bg-card); color: var(--text-primary); transition: box-shadow 0.15s; }
.topo-card.is-hit { box-shadow: 0 0 0 2px var(--accent-primary); }
.topo-card.is-selected { box-shadow: 0 0 0 3px var(--accent-primary); background: rgba(var(--accent-primary-rgb, 64,120,192), 0.06); }
.topo-card.is-running { animation: topo-pulse 1.5s ease-in-out infinite; border-color: var(--success); }
.topo-card.is-collapsed { opacity: 0.92; border-style: dashed; }
.topo-card__seq { position: absolute; top: -8px; left: -8px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--cluster-color, var(--accent-primary)); color: #fff; font-size: 10px; font-weight: 700; line-height: 18px; text-align: center; z-index: 2; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.topo-card__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cluster-color, var(--text-muted)); flex-shrink: 0; }
.topo-card.is-agent .topo-card__dot { background: var(--success); }
.topo-card.is-skill .topo-card__dot { background: var(--accent-info); }
.topo-card.is-tool .topo-card__dot { background: var(--warning); }
.topo-card.is-ingress .topo-card__dot { background: var(--text-muted); }
.topo-card.is-workflow .topo-card__dot { background: var(--accent-primary); }
.topo-card__text { display: flex; flex-direction: column; min-width: 0; overflow: hidden; gap: 1px; }
.topo-card__text b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topo-card__tags { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 1px; }
.topo-card__task { font-size: 9px; font-family: ui-monospace, monospace; color: var(--cluster-color, var(--text-muted)); background: var(--bg-secondary); padding: 0 4px; border-radius: 3px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topo-card__status { font-size: 8px; font-weight: 700; padding: 0 4px; border-radius: 3px; text-transform: uppercase; }
.topo-card__status.is-running { background: rgba(76,175,80,0.18); color: var(--success); }
.topo-card__status.is-done, .topo-card__status.is-archived { background: rgba(76,175,80,0.1); color: var(--success); }
.topo-card__status.is-blocked { background: rgba(214,90,107,0.18); color: var(--error); }
.topo-card__status.is-review, .topo-card__status.is-ready { background: rgba(214,155,90,0.18); color: var(--warning); }
.topo-card__status.is-triage, .topo-card__status.is-todo, .topo-card__status.is-scheduled { background: var(--bg-secondary); color: var(--text-muted); }
.topo-card__text small { font-size: 9px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
.topo-card__profile { font-size: 8px; color: var(--cluster-color, var(--text-muted)); font-weight: 600; }
.topo-card__info { position: absolute; top: 3px; right: 4px; width: 16px; height: 16px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 11px; line-height: 1; padding: 0; border-radius: 3px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.topo-card__toggle { position: absolute; bottom: 3px; right: 4px; width: 16px; height: 16px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font-size: 12px; line-height: 1; padding: 0; border-radius: 3px; font-weight: 700;
  &:hover { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
@keyframes topo-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4); }
  50% { box-shadow: 0 0 0 5px rgba(76, 175, 80, 0); }
}
</style>
