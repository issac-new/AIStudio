<script setup lang="ts">
/**
 * CockpitFilePanel — 在 Cockpit Work 页面中替换原有的 CockpitFileTree，
 * 复用 upstream Chat 面板 "Workspace / Terminal" 中的 FilesPanel 模块，
 * 但将文件浏览器的根目录设为当前选中任务的 workspace。
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

// 当选中任务的 workspace 变化时，更新文件浏览器的根目录
watch(() => store.selectedTask?.workspace, (ws) => {
  const root = ws || '~'
  filesStore.workspaceRoot = root
  filesStore.fetchEntries('')
}, { immediate: true })
</script>

<template>
  <div class="cockpit-file-panel">
    <FilesPanel />
  </div>
</template>

<style scoped lang="scss">
.cockpit-file-panel {
  flex: 0 0 320px;
  min-width: 0;
  border-left: 1px solid var(--border-color);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
}
</style>
