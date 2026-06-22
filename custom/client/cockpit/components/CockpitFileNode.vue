<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore, type FileNode } from '@/custom/cockpit/store/cockpit'

const props = defineProps<{
  node: FileNode
  depth: number
  filter: string
}>()

const store = useCockpitStore()
const expanded = ref(false)

const isSelected = computed(() => store.selectedFileId === props.node.id)
const matches = computed(() =>
  props.filter === '' || props.node.name.toLowerCase().includes(props.filter.toLowerCase()),
)

function onClick() {
  if (props.node.isDir) expanded.value = !expanded.value
  else store.selectFile(props.node.id)
}
</script>

<template>
  <div v-if="matches">
    <button
      type="button"
      :data-file-id="node.id"
      class="cockpit-file-node"
      :class="{ 'is-selected': isSelected, 'is-modified': node.modified }"
      :style="{ paddingLeft: 8 + depth * 16 + 'px' }"
      @click="onClick"
    >
      <span class="cockpit-sel-bar" />
      <span class="cockpit-file-node__icon">{{ node.isDir ? (expanded ? '▾' : '▸') : '·' }}</span>
      <span class="cockpit-file-node__name">{{ node.name }}</span>
      <span v-if="node.modified" class="cockpit-file-node__mod">M</span>
    </button>
    <CockpitFileNode
      v-for="child in node.children"
      v-if="node.isDir && expanded && node.children"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
      :filter="filter"
    />
  </div>
</template>

<style scoped lang="scss">
.cockpit-file-node {
  position: relative; display: flex; align-items: center; gap: 5px;
  width: 100%; text-align: left; padding: 3px 8px;
  border: none; background: none; font: inherit; color: var(--text-secondary);
  cursor: pointer; white-space: nowrap;
  &:hover { background: var(--bg-card-hover); color: var(--text-primary); }
  &.is-selected { background: var(--bg-secondary); color: var(--text-primary); }
  &.is-modified .cockpit-file-node__name { font-weight: 600; color: var(--text-primary); }
}
.cockpit-file-node__icon { font-size: 10px; width: 13px; text-align: center; color: var(--text-muted); }
.cockpit-file-node__name { font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.cockpit-file-node__mod { font-size: 8px; padding: 0 4px; border-radius: 2px; margin-left: auto; background: var(--bg-secondary); color: var(--text-muted); font-family: ui-monospace, monospace; }
</style>
