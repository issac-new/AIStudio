<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import CockpitFileNode from './CockpitFileNode.vue'

const store = useCockpitStore()
const { t } = useI18n()
const filter = ref('')

const rootFiles = computed(() => store.filesForSelectedTask)
const workspace = computed(() => store.selectedTask?.workspace ?? '')
const hasTask = computed(() => !!store.selectedTask)

// 汇总信息：顶层文件/文件夹数 + 总大小
const summary = computed(() => {
  const nodes = rootFiles.value
  let files = 0, dirs = 0, totalSize = 0
  function walk(list: any[]) {
    for (const n of list) {
      if (n.isDir) { dirs++; if (n.children) walk(n.children) }
      else { files++; totalSize += n.size || 0 }
    }
  }
  walk(nodes)
  return { files, dirs, totalSize }
})
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 每 10 秒刷新当前任务文件树（任务切换时也会立即刷新一次）
let pollTimer: ReturnType<typeof setInterval> | null = null
function startPoll() {
  stopPoll()
  if (store.selectedTaskId) {
    store.refreshFileTree()
    pollTimer = setInterval(() => store.refreshFileTree(), 10000)
  }
}
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
watch(() => store.selectedTaskId, startPoll, { immediate: true })
onUnmounted(stopPoll)
</script>

<template>
  <div class="cockpit-file-tree">
    <div class="cockpit-file-tree__head">
      <span class="cockpit-file-tree__title">{{ t('cockpit.taskFiles') }}</span>
      <span class="cockpit-file-tree__sub">{{ t('cockpit.currentTaskWorkspace') }}</span>
      <code v-if="hasTask" class="cockpit-file-tree__root">{{ workspace }}</code>
      <div v-if="hasTask && (summary.files || summary.dirs)" class="cockpit-file-tree__summary">
        <span>{{ summary.dirs }} 📁 / {{ summary.files }} 📄</span>
        <span>{{ formatSize(summary.totalSize) }}</span>
      </div>
      <input v-model="filter" class="cockpit-file-tree__filter" :placeholder="t('cockpit.filterFiles')">
    </div>
    <div class="cockpit-file-tree__list">
      <template v-if="hasTask">
        <CockpitFileNode
          v-for="node in rootFiles"
          :key="node.id"
          :node="node"
          :depth="0"
          :filter="filter"
        />
      </template>
      <div v-else class="cockpit-file-tree__empty">{{ t('cockpit.noTaskSelected') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-file-tree { display: flex; flex-direction: column; flex: 0 0 240px; border-left: 1px solid var(--border-color); background: var(--bg-primary); min-height: 0; }
.cockpit-file-tree__head { flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-card); display: flex; flex-direction: column; gap: 4px; }
.cockpit-file-tree__title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cockpit-file-tree__sub { font-size: 10px; color: var(--text-muted); }
.cockpit-file-tree__root { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-secondary); background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; word-break: break-all; }
.cockpit-file-tree__summary { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.cockpit-file-tree__filter { font-family: inherit; font-size: 11px; border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; color: var(--text-primary); }
.cockpit-file-tree__list { flex: 1; overflow-y: auto; padding: 6px 0; }
.cockpit-file-tree__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; padding: 40px 16px; text-align: center; }
</style>
