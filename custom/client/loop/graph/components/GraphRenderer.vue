<!-- overlay/custom/client/loop/graph/components/GraphRenderer.vue -->
<!-- GraphRenderer — 图可视化组件（SVG 力导向布局 + 节点/边渲染） -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GraphEvent } from '../../../server/loop/graph/types'

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
  active: boolean
}

const props = defineProps<{
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
  events: GraphEvent[]
}>()

const emit = defineEmits<{ (e: 'select', nodeId: string): void }>()
const { t } = useI18n()

// 力导向布局（简化：预计算位置）
const positions = computed(() => {
  const pos: Record<string, { x: number; y: number }> = {}
  const n = props.nodes.length
  const cx = 300, cy = 200, r = 150
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    pos[props.nodes[i].id] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
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

function nodeStatus(nodeId: string): GraphNodeData['status'] {
  const nodeEvents = props.events.filter(e => (e as any).nodeId === nodeId)
  if (nodeEvents.some(e => e.type === 'graph.node-error')) return 'error'
  if (nodeEvents.some(e => e.type === 'graph.interrupt')) return 'interrupt'
  if (nodeEvents.some(e => e.type === 'graph.node-complete')) return 'completed'
  if (nodeEvents.some(e => e.type === 'graph.node-start')) return 'running'
  return 'idle'
}

function edgeActive(source: string, target: string): boolean {
  const lastStepEvent = [...props.events].reverse().find(e => e.type === 'graph.step-start')
  if (!lastStepEvent) return false
  const nodes = (lastStepEvent as any).nodes as string[]
  return nodes?.includes(source) && nodes?.includes(target)
}
</script>

<template>
  <div class="graph-renderer">
    <svg viewBox="0 0 600 400" class="graph-renderer__svg">
      <!-- Edges -->
      <line v-for="edge in props.edges" :key="`${edge.source}-${edge.target}`"
        :x1="positions[edge.source]?.x" :y1="positions[edge.source]?.y"
        :x2="positions[edge.target]?.x" :y2="positions[edge.target]?.y"
        :class="{ 'graph-renderer__edge--active': edgeActive(edge.source, edge.target) }"
        class="graph-renderer__edge" />
      <!-- Edge labels -->
      <text v-for="edge in props.edges.filter(e => e.label)" :key="`label-${edge.source}-${edge.target}`"
        :x="(positions[edge.source]?.x + positions[edge.target]?.x) / 2"
        :y="(positions[edge.source]?.y + positions[edge.target]?.y) / 2 - 5"
        text-anchor="middle" font-size="10" fill="var(--color-text-secondary, #878c99)">
        {{ edge.label }}
      </text>
      <!-- Nodes -->
      <g v-for="node in props.nodes" :key="node.id"
        :transform="`translate(${positions[node.id]?.x},${positions[node.id]?.y})`"
        @click="emit('select', node.id)"
        class="graph-renderer__node">
        <circle r="35" :fill="nodeColor(nodeStatus(node.id))" />
        <text text-anchor="middle" dy="-2" fill="white" font-size="10" font-weight="bold">{{ node.id }}</text>
        <text text-anchor="middle" dy="12" fill="white" font-size="8">{{ node.label }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.graph-renderer__svg { width: 100%; max-width: 600px; }
.graph-renderer__node { cursor: pointer; }
.graph-renderer__node:hover circle { opacity: 0.8; }
.graph-renderer__edge { stroke: var(--color-text-secondary, #878c99); stroke-width: 1.5; }
.graph-renderer__edge--active { stroke: var(--color-primary, #3b82f6); stroke-width: 2.5; }
</style>
