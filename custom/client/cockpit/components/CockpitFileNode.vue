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

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
function timeAgo(ts: number): string {
  if (!ts) return ''
  const secs = Math.floor((Date.now() / 1000) - ts / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}
// 文件显示「大小 · 相对时间」；文件夹显示子项数
const meta = computed(() => {
  if (props.node.isDir) {
    const n = props.node.children?.length ?? 0
    return n ? `${n} 项` : ''
  }
  return `${formatSize(props.node.size || 0)} · ${timeAgo(props.node.modified)}`
})

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
      :class="{ 'is-selected': isSelected }"
      :style="{ paddingLeft: 8 + depth * 16 + 'px' }"
      @click="onClick"
    >
      <span class="cockpit-sel-bar" />
      <span class="cockpit-file-node__icon">{{ node.isDir ? (expanded ? '▾' : '▸') : '·' }}</span>
      <span class="cockpit-file-node__name">{{ node.name }}</span>
      <span v-if="meta" class="cockpit-file-node__meta">{{ meta }}</span>
    </button>
    <template v-if="node.isDir && expanded && node.children">
      <CockpitFileNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :filter="filter"
      />
    </template>
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
}
.cockpit-file-node__icon { font-size: 10px; width: 13px; text-align: center; color: var(--text-muted); }
.cockpit-file-node__name { font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
.cockpit-file-node__meta { font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; margin-left: auto; }
</style>
