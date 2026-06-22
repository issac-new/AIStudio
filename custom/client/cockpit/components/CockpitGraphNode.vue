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

// 在场者：最多显示前 3 个，超出计为 +N
const visibleOccupants = computed(() => (props.node.occupants ?? []).slice(0, 3))
const extraOccupants = computed(() => Math.max((props.node.occupants ?? []).length - 3, 0))

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
    <span v-if="visibleOccupants.length" class="cockpit-graph-node__occupants">
      <span
        v-for="name in visibleOccupants"
        :key="name"
        class="cockpit-graph-node__occ"
        :title="name"
      >{{ name.charAt(0) }}</span>
      <span v-if="extraOccupants > 0" class="cockpit-graph-node__occ cockpit-graph-node__occ--more" :title="`还有 ${extraOccupants} 位`">+{{ extraOccupants }}</span>
    </span>
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
.cockpit-graph-node__occupants { display: flex; gap: 2px; margin-top: 2px; align-items: center; }
.cockpit-graph-node__occ {
  width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 8px; font-weight: 700; color: var(--text-on-accent); background: var(--accent-primary);
  border: 1px solid var(--bg-card); cursor: help;
}
.cockpit-graph-node__occ--more { background: var(--bg-secondary); color: var(--text-muted); border-color: var(--border-color); font-size: 8px; }
</style>
