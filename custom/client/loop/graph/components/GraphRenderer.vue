<!-- overlay/custom/client/loop/graph/components/GraphRenderer.vue -->
<!-- GraphRenderer — 有向图渲染器（真实数据驱动，升级自占位版本） -->
<script setup lang="ts">
import { computed } from 'vue'
import type { GraphEvent } from '../../server/loop/graph/types'

interface GraphNodeData {
  id: string
  label: string
  type: string
  status: 'idle' | 'running' | 'completed' | 'error' | 'interrupt'
}

interface GraphEdgeData {
  source: string
  target: string
  label?: string
  type: 'forward' | 'repair' | 'loop'
  active: boolean
}

const props = defineProps<{
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
  events: GraphEvent[]
}>()

const emit = defineEmits<{ (e: 'select', nodeId: string): void }>()

// 预计算布局：5 阶段节点使用固定位置（与 loop 阶段对应）
const STAGE_POSITIONS: Record<string, { x: number; y: number }> = {
  discovery: { x: 450, y: 150 },
  handoff: { x: 300, y: 280 },
  validation: { x: 150, y: 150 },
  persistence: { x: 150, y: 350 },
  scheduling: { x: 450, y: 350 },
}

const positions = computed(() => {
  const pos: Record<string, { x: number; y: number }> = {}
  const customNodes = props.nodes.filter(n => !STAGE_POSITIONS[n.id])

  // 已知阶段使用固定位置
  for (const [id, p] of Object.entries(STAGE_POSITIONS)) {
    if (props.nodes.some(n => n.id === id)) {
      pos[id] = p
    }
  }

  // 自定义节点自动环形布局
  if (customNodes.length > 0) {
    const cx = 300, cy = 250, r = 120
    for (let i = 0; i < customNodes.length; i++) {
      const angle = (2 * Math.PI * i) / customNodes.length - Math.PI / 2
      pos[customNodes[i].id] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      }
    }
  }

  return pos
})

function nodeColor(status: GraphNodeData['status']): string {
  switch (status) {
    case 'running': return 'var(--color-primary, #3b82f6)'
    case 'completed': return 'var(--color-success, #28bf5c)'
    case 'error': return 'var(--color-danger, #e11d48)'
    case 'interrupt': return 'var(--color-warning, #f59e0b)'
    default: return 'var(--color-text-secondary, #878c99)'
  }
}

function edgeClass(type: GraphEdgeData['type']): string {
  switch (type) {
    case 'repair': return 'graph-renderer__edge--repair'
    case 'loop': return 'graph-renderer__edge--loop'
    default: return 'graph-renderer__edge--forward'
  }
}

function nodeStatus(nodeId: string): GraphNodeData['status'] {
  const nodeEvents = props.events.filter(e => (e as any).nodeId === nodeId)
  if (nodeEvents.some(e => e.type === 'graph.node-error')) return 'error'
  if (nodeEvents.some(e => e.type === 'graph.interrupt')) return 'interrupt'
  if (nodeEvents.some(e => e.type === 'graph.node-complete')) return 'completed'
  if (nodeEvents.some(e => e.type === 'graph.node-start')) return 'running'
  return 'idle'
}

function edgeActive(source: string, target: string): boolean {
  // 检查最后一步是否包含这条边的源和目标
  const lastStepEvent = [...props.events].reverse().find(e => e.type === 'graph.step-start')
  if (!lastStepEvent) return false
  const nodes = (lastStepEvent as any).nodes as string[]
  return nodes?.includes(source) && nodes?.includes(target)
}

// 计算边的中点（用于 label）
function edgeMidpoint(source: string, target: string): { x: number; y: number } {
  const s = positions.value[source]
  const t = positions.value[target]
  if (!s || !t) return { x: 0, y: 0 }
  return { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 - 8 }
}

// 计算箭头终点（偏移避免遮挡节点）
function arrowEnd(source: string, target: string): { x: number; y: number } {
  const s = positions.value[source]
  const t = positions.value[target]
  if (!s || !t) return { x: 0, y: 0 }
  const dx = t.x - s.x
  const dy = t.y - s.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = 38 // 节点半径 + 边距
  if (dist <= offset * 2) return { x: t.x, y: t.y }
  const ratio = (dist - offset) / dist
  return { x: s.x + dx * ratio, y: s.y + dy * ratio }
}
</script>

<template>
  <div class="graph-renderer">
    <svg viewBox="0 0 600 500" class="graph-renderer__svg">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10" fill="var(--color-text-secondary, #878c99)" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10" fill="var(--color-primary, #3b82f6)" />
        </marker>
      </defs>

      <!-- Edges -->
      <line v-for="edge in props.edges" :key="`${edge.source}-${edge.target}-${edge.type}`"
        :x1="positions[edge.source]?.x" :y1="positions[edge.source]?.y"
        :x2="arrowEnd(edge.source, edge.target).x" :y2="arrowEnd(edge.source, edge.target).y"
        :class="[edgeClass(edge.type), { 'graph-renderer__edge--active': edgeActive(edge.source, edge.target) }]"
        :marker-end="edgeActive(edge.source, edge.target) ? 'url(#arrow-active)' : 'url(#arrow)'" />

      <!-- Edge labels -->
      <text v-for="edge in props.edges.filter(e => e.label)" :key="`label-${edge.source}-${edge.target}-${edge.type}`"
        :x="edgeMidpoint(edge.source, edge.target).x"
        :y="edgeMidpoint(edge.source, edge.target).y"
        text-anchor="middle" font-size="10" fill="var(--color-text-secondary, #878c99)">
        {{ edge.label }}
      </text>

      <!-- Nodes -->
      <g v-for="node in props.nodes" :key="node.id"
        :transform="`translate(${positions[node.id]?.x},${positions[node.id]?.y})`"
        @click="emit('select', node.id)"
        class="graph-renderer__node">
        <circle r="35" :fill="nodeColor(nodeStatus(node.id))" />
        <text text-anchor="middle" dy="-4" fill="white" font-size="11" font-weight="bold">{{ node.label }}</text>
        <text text-anchor="middle" dy="12" fill="white" font-size="8" opacity="0.8">{{ nodeStatus(node.id) }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.graph-renderer__svg { width: 100%; max-width: 600px; }
.graph-renderer__node { cursor: pointer; }
.graph-renderer__node:hover circle { opacity: 0.85; }
.graph-renderer__edge--forward { stroke: var(--color-text-secondary, #878c99); stroke-width: 1.5; }
.graph-renderer__edge--repair { stroke: var(--color-danger, #e11d48); stroke-width: 1.5; stroke-dasharray: 4 2; }
.graph-renderer__edge--loop { stroke: var(--color-text-secondary, #878c99); stroke-width: 1; stroke-dasharray: 4 2; }
.graph-renderer__edge--active { stroke: var(--color-primary, #3b82f6); stroke-width: 2.5; }
</style>
