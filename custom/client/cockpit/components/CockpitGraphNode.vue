<script setup lang="ts">
import type { GraphNode } from '@/custom/cockpit/store/cockpit'

const props = defineProps<{ node: GraphNode; x: number; y: number }>()
const emit = defineEmits<{ (e: 'click', node: GraphNode): void }>()

// kind → 简单图标占位（Pure Ink 灰度，无彩色）
function kindIcon(k: GraphNode['kind']): string {
  switch (k) {
    case 'center': return '◆'
    case 'parent': return '↑'
    case 'child': return '↓'
    case 'person': return '●'
    case 'channel': return '▣'
    case 'folded': return '⋯'
  }
}
</script>

<template>
  <button
    type="button"
    class="cockpit-graph-node"
    :class="['is-' + props.node.kind, { 'is-focus': props.node.focus }]"
    :style="{ left: props.x + 'px', top: props.y + 'px' }"
    :data-node-id="props.node.id"
    :data-node-kind="props.node.kind"
    @click="emit('click', props.node)"
  >
    <span class="cockpit-sel-bar" />
    <span class="cockpit-graph-node__icon">{{ kindIcon(props.node.kind) }}</span>
    <span class="cockpit-graph-node__label">{{ props.node.label }}</span>
  </button>
</template>

<style scoped lang="scss">
.cockpit-graph-node {
  position: absolute;
  transform: translate(-50%, -50%);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 11px;
  font-family: inherit;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  user-select: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  &:hover { border-color: var(--text-muted); background: var(--bg-card-hover); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
  &.is-focus { border-color: var(--accent-primary); border-width: 2px; font-weight: 700; box-shadow: 0 0 0 3px rgba(var(--accent-primary-rgb, 0), 0.12); }
  &.is-folded { color: var(--text-muted); font-style: italic; border-style: dashed; }
}
.cockpit-graph-node__icon { font-size: 10px; color: var(--text-muted); }
.is-channel .cockpit-graph-node__icon { color: var(--text-secondary); }
.cockpit-graph-node__label { font-weight: 500; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-center .cockpit-graph-node__label { font-weight: 700; max-width: 160px; }
</style>
