<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore, type GraphNode } from '@/custom/cockpit/store/cockpit'

const props = defineProps<{
  node: GraphNode
  taskId: string
  left: number
  top: number
}>()
const emit = defineEmits<{ (e: 'drag', pos: { left: number; top: number }): void }>()

const store = useCockpitStore()

const isSelected = computed(() =>
  (store.selectedGraphNodeIds[props.taskId] ?? []).includes(props.node.id),
)

function onClick() {
  store.toggleGraphNode(props.taskId, props.node.id)
  store.focusOnGraphNodeForTimeline(props.node.id)
}

function onMousedown(e: MouseEvent) {
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  const startX = e.clientX
  const startY = e.clientY
  const startLeft = el.offsetLeft
  const startTop = el.offsetTop
  function move(ev: MouseEvent) {
    emit('drag', { left: startLeft + (ev.clientX - startX), top: startTop + (ev.clientY - startY) })
  }
  function up() {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}
</script>

<template>
  <button
    type="button"
    class="cockpit-graph-node"
    :class="{ 'is-selected': isSelected, 'is-focus': node.focus }"
    :style="{ left: left + 'px', top: top + 'px' }"
    @click="onClick"
    @mousedown="onMousedown"
  >
    <span class="cockpit-sel-bar" />
    <span class="cockpit-graph-node__label">{{ node.label }}</span>
    <span v-if="node.focus" class="cockpit-graph-node__focus">焦点</span>
  </button>
</template>

<style scoped lang="scss">
.cockpit-graph-node {
  position: absolute;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 11px;
  font-family: inherit;
  color: var(--text-primary);
  cursor: grab;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  &:hover { border-color: var(--text-muted); }
  &.is-selected { border-color: var(--accent-primary); }
  &.is-focus { border-color: var(--accent-primary); }
}
.cockpit-graph-node__label { font-weight: 600; }
.cockpit-graph-node__focus { font-size: 9px; color: var(--text-muted); }
</style>
