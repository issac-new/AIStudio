<!-- overlay/custom/client/loop/components/LoopGraph.vue -->
<!-- LoopGraph — 统一的有向图可视化组件（替代 StageRing，复用 GraphRenderer 思路） -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LoopStage, LoopEvent, LoopStatus } from '@/custom/loop/types'

const props = defineProps<{
  currentStage: LoopStage
  status: LoopStatus
  events: LoopEvent[]
  compact?: boolean   // 迷你模式（总览缩略图用）
}>()

const emit = defineEmits<{ (e: 'select', stage: LoopStage): void }>()
const { t } = useI18n()

const STAGES: LoopStage[] = ['discovery', 'handoff', 'validation', 'persistence', 'scheduling']

const POSITIONS: Record<LoopStage, { x: number; y: number }> = {
  discovery: { x: 450, y: 130 },
  handoff: { x: 300, y: 260 },
  validation: { x: 150, y: 130 },
  persistence: { x: 150, y: 330 },
  scheduling: { x: 450, y: 330 },
}

interface EdgeDef {
  source: LoopStage
  target: LoopStage
  type: 'forward' | 'repair' | 'loop'
  label?: string
}

const EDGES: EdgeDef[] = [
  { source: 'discovery', target: 'handoff', type: 'forward' },
  { source: 'handoff', target: 'validation', type: 'forward' },
  { source: 'validation', target: 'persistence', type: 'forward' },
  { source: 'persistence', target: 'scheduling', type: 'forward' },
  { source: 'validation', target: 'handoff', type: 'repair', label: 'repair' },
  { source: 'scheduling', target: 'discovery', type: 'loop', label: 'tick' },
]

// 是否有 repair 发生（事件流里有 validation→handoff 回退）
const hasRepair = computed(() =>
  props.events.some(e =>
    e.type === 'loop.stage-transition' &&
    (e as any).from === 'validation' &&
    (e as any).to === 'handoff',
  ),
)

// 是否有 stuck
const hasStuck = computed(() => props.events.some(e => e.type === 'loop.stuck'))

// 阶段状态推导
function stageStatus(stage: LoopStage): 'completed' | 'active' | 'idle' | 'error' {
  const currentIdx = STAGES.indexOf(props.currentStage)
  const stageIdx = STAGES.indexOf(stage)

  if (hasStuck.value && stage === props.currentStage) return 'error'
  if (props.status === 'blocked' && stage === props.currentStage) return 'error'
  if (props.status === 'awaiting-review' && stage === 'validation') return 'error'
  if (stageIdx === currentIdx) {
    return props.status === 'running' ? 'active' : 'completed'
  }
  if (stageIdx < currentIdx) return 'completed'
  return 'idle'
}

function nodeColor(stage: LoopStage): string {
  switch (stageStatus(stage)) {
    case 'active': return 'var(--color-primary, #3b82f6)'
    case 'completed': return 'var(--color-success, #28bf5c)'
    case 'error': return 'var(--color-danger, #e11d48)'
    default: return 'var(--color-text-secondary, #878c99)'
  }
}

function edgeClass(edge: EdgeDef): string {
  const cls = `loop-graph__edge--${edge.type}`
  if (edge.type === 'repair' && !hasRepair.value) return `${cls} loop-graph__edge--hidden`
  return cls
}

function edgeActive(edge: EdgeDef): boolean {
  // 当前 stage 的出边高亮
  if (edge.source === props.currentStage && props.status === 'running') {
    return edge.type === 'forward'
  }
  return false
}

function arrowEnd(source: LoopStage, target: LoopStage): { x: number; y: number } {
  const s = POSITIONS[source]
  const t2 = POSITIONS[target]
  const dx = t2.x - s.x
  const dy = t2.y - s.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = props.compact ? 20 : 36
  if (dist <= offset * 2) return { x: t2.x, y: t2.y }
  const ratio = (dist - offset) / dist
  return { x: s.x + dx * ratio, y: s.y + dy * ratio }
}

function edgeMidpoint(source: LoopStage, target: LoopStage): { x: number; y: number } {
  const s = POSITIONS[source]
  const t2 = POSITIONS[target]
  return { x: (s.x + t2.x) / 2, y: (s.y + t2.y) / 2 - 8 }
}

const nodeRadius = computed(() => props.compact ? 18 : 34)
const viewBox = computed(() => props.compact ? '0 0 600 460' : '0 0 600 460')
const fontSize = computed(() => props.compact ? 9 : 11)
const subFontSize = computed(() => props.compact ? 7 : 8)
</script>

<template>
  <div :class="compact ? 'loop-graph loop-graph--compact' : 'loop-graph'">
    <svg :viewBox="viewBox" class="loop-graph__svg">
      <defs>
        <marker id="lg-arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10" fill="var(--color-text-secondary, #878c99)" />
        </marker>
        <marker id="lg-arrow-active" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10" fill="var(--color-primary, #3b82f6)" />
        </marker>
      </defs>

      <!-- Edges -->
      <line v-for="edge in EDGES" :key="`${edge.source}-${edge.target}-${edge.type}`"
        :x1="POSITIONS[edge.source].x" :y1="POSITIONS[edge.source].y"
        :x2="arrowEnd(edge.source, edge.target).x" :y2="arrowEnd(edge.source, edge.target).y"
        :class="[edgeClass(edge), { 'loop-graph__edge--active': edgeActive(edge) }]"
        :marker-end="edgeActive(edge) ? 'url(#lg-arrow-active)' : 'url(#lg-arrow)'" />

      <!-- Edge labels (only in non-compact mode) -->
      <template v-if="!compact">
        <text v-for="edge in EDGES.filter(e => e.label && (e.type !== 'repair' || hasRepair))" :key="`label-${edge.source}-${edge.target}`"
          :x="edgeMidpoint(edge.source, edge.target).x"
          :y="edgeMidpoint(edge.source, edge.target).y"
          text-anchor="middle" :font-size="subFontSize" fill="var(--color-text-secondary, #878c99)">
          {{ edge.label }}
        </text>
      </template>

      <!-- Nodes -->
      <g v-for="stage in STAGES" :key="stage"
        :transform="`translate(${POSITIONS[stage].x},${POSITIONS[stage].y})`"
        @click="emit('select', stage)"
        class="loop-graph__node">
        <circle :r="nodeRadius" :fill="nodeColor(stage)" />
        <text text-anchor="middle" :dy="compact ? 3 : -2" fill="white" :font-size="fontSize" font-weight="bold">
          {{ compact ? t(`loop.stages.${stage}`).slice(0, 3) : t(`loop.stages.${stage}`) }}
        </text>
        <text v-if="!compact" text-anchor="middle" dy="13" fill="white" :font-size="subFontSize" opacity="0.85">
          {{ stageStatus(stage) }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.loop-graph__svg { width: 100%; max-width: 600px; }
.loop-graph--compact .loop-graph__svg { max-width: 200px; }
.loop-graph__node { cursor: pointer; }
.loop-graph__node:hover circle { opacity: 0.85; }
.loop-graph__edge--forward { stroke: var(--color-text-secondary, #878c99); stroke-width: 1.5; }
.loop-graph__edge--repair { stroke: var(--color-danger, #e11d48); stroke-width: 1.5; stroke-dasharray: 4 2; }
.loop-graph__edge--loop { stroke: var(--color-text-secondary, #878c99); stroke-width: 1; stroke-dasharray: 4 2; }
.loop-graph__edge--hidden { opacity: 0.15; }
.loop-graph__edge--active { stroke: var(--color-primary, #3b82f6); stroke-width: 2.5; }
</style>
