<!-- overlay/custom/client/loop/components/StageRing.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { buildStageGraph } from '@/custom/loop/adapters/stage-adapter'
import type { LoopStage, LoopEvent } from '@/custom/loop/types'

const props = defineProps<{
  currentStage: LoopStage
  events: LoopEvent[]
}>()

const emit = defineEmits<{ (e: 'select', stage: LoopStage): void }>()

const graph = computed(() => buildStageGraph(props.currentStage, props.events))

// I14: 用 CSS 变量替代硬编码颜色,方便主题切换与一致性问题。
// 返回 CSS 变量引用,fill 属性会读取这些变量。
const nodeColor = (n: { active: boolean; completed: boolean; blocked: boolean }) =>
  n.blocked
    ? 'var(--color-danger, #e11d48)'
    : n.active
      ? 'var(--color-primary, #3b82f6)'
      : n.completed
        ? 'var(--color-success, #28bf5c)'
        : 'var(--color-text-secondary, #878c99)'

// C8: STAGE_POSITIONS 与 nodePos 从第二个 <script> 块迁移到 <script setup>,
// 以便与组件状态共享作用域(此前在 <script> 块中,模板引用的是非响应式全局函数)。
const STAGE_POSITIONS: Record<string, { x: number; y: number }> = {
  discovery: { x: 300, y: 100 },
  handoff: { x: 200, y: 200 },
  validation: { x: 100, y: 100 },
  persistence: { x: 100, y: 250 },
  scheduling: { x: 300, y: 250 },
}
function nodePos(id: string) { return STAGE_POSITIONS[id] ?? { x: 200, y: 150 } }
</script>

<template>
  <div class="stage-ring">
    <svg viewBox="0 0 400 300" class="stage-ring__svg">
      <!-- Edges -->
      <line v-for="edge in graph.edges" :key="`${edge.source}-${edge.target}`"
        :x1="nodePos(edge.source).x" :y1="nodePos(edge.source).y"
        :x2="nodePos(edge.target).x" :y2="nodePos(edge.target).y"
        :class="`stage-ring__edge--${edge.type}`" />
      <!-- Nodes -->
      <g v-for="node in graph.nodes" :key="node.id"
        :transform="`translate(${nodePos(node.id).x},${nodePos(node.id).y})`"
        @click="emit('select', node.stage)">
        <circle r="30" :fill="nodeColor(node)" />
        <text text-anchor="middle" dy="5" fill="white" font-size="11">{{ node.label }}</text>
      </g>
    </svg>
  </div>
</template>
