<script setup lang="ts">
/**
 * CockpitFilePanel — 在 Cockpit 页面中作为独立标签页使用的文件浏览器，
 * 复用 upstream Chat 面板 "Workspace / Terminal" 中的 FilesPanel 模块，
 * 但将文件浏览器的根目录设为当前选中任务的 workspace。
 *
 * 通过 store.workspaceMode === 'workspace' 激活，由 CockpitView 渲染。
 *
 * 原理：
 *   1. 监控 store.selectedTask?.workspace
 *   2. 将路径设置到 filesStore.workspaceRoot
 *   3. 当 workspace 改变时调用 filesStore.fetchEntries('') 刷新
 *   4. 渲染 FilesPanel（复用 upstream 组件）
 */
import { watch, onMounted } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useFilesStore } from '@/stores/hermes/files'
import FilesPanel from '@/components/hermes/chat/FilesPanel.vue'

const store = useCockpitStore()
const filesStore = useFilesStore()

// 当选中任务变化时（含重新点击中心节点），更新文件浏览器的根目录并刷新
// 监听 selectedTaskId 而非 workspace 值，确保每次切换任务都触发刷新
watch(() => store.selectedTaskId, () => {
  const root = store.selectedTask?.workspace || '~'
  filesStore.workspaceRoot = root
  filesStore.currentPath = ''
  filesStore.fetchEntries('')
}, { immediate: true })

// 每次切换到 Workspace 标签页时，重置到 workspace 根目录
// (filesStore.currentPath 可能还停留在上次浏览的子目录)
onMounted(() => {
  const root = store.selectedTask?.workspace || '~'
  filesStore.workspaceRoot = root
  filesStore.currentPath = ''
  filesStore.fetchEntries('')
})
</script>

<template>
  <div class="cockpit-file-panel">
    <FilesPanel />
  </div>
</template>

<style scoped lang="scss">
.cockpit-file-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
}
</style>
