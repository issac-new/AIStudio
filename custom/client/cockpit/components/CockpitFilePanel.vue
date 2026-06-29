<script setup lang="ts">
/**
 * CockpitFilePanel — 在 Cockpit 页面中作为独立标签页使用的文件浏览器，
 * 复用 upstream Chat 面板 "Workspace / Terminal" 中的 FilesPanel 模块，
 * 但将文件浏览器的根目录设为当前选中任务的 workspace。
 *
 * 通过 store.workspaceMode === 'workspace' 激活，由 CockpitView 渲染。
 *
 * 原理：
 *   1. 监控 store.selectedTaskId + store.selectionSeq（每次 selectTask 自增）
 *   2. 将路径设置到 filesStore.workspaceRoot
 *   3. 当选中任务变化（含重新点击中心节点选中同一任务，id 不变但 seq 自增）时调用 filesStore.fetchEntries('') 刷新
 *   4. 渲染 FilesPanel（复用 upstream 组件）
 *   5. 任务未 claim（workspace 为空）时不发起请求，显示加载中占位
 */
import { watch, onMounted, computed } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useFilesStore } from '@/stores/hermes/files'
import FilesPanel from '@/components/hermes/chat/FilesPanel.vue'

const store = useCockpitStore()
const filesStore = useFilesStore()

const hasWorkspace = computed(() => {
  const detailWs = store.selectedTaskDetail?.task?.workspace_path
  const listWs = store.selectedTask?.workspace
  return !!(detailWs ?? listWs)
})

// 把「当前生效的 workspace 根目录」同步到 filesStore 并刷新文件列表。
// 优先从 detail cache（selectedTaskDetail）读取 workspace_path，因为它
// 在每次 selectTask 后都会刷新；cockpitTasks 中的 workspace 可能因
// kanban.tasks 变化触发的 watch 重建而被覆盖为旧值。
// detail 不可用时回退到 cockpitTasks 的 workspace（兼容 detail.task 为 null 的场景）。
function syncWorkspaceRoot() {
  const wsPath = store.selectedTaskDetail?.task?.workspace_path
    ?? store.selectedTask?.workspace
  if (!wsPath) {
    filesStore.workspaceRoot = undefined
    filesStore.currentPath = ''
    return
  }
  filesStore.workspaceRoot = wsPath
  filesStore.currentPath = ''
  filesStore.fetchEntries('')
}

// 当选中任务变化时（含重新点击中心节点），更新文件浏览器的根目录并刷新。
// 监听 [selectedTaskId, selectionSeq]：selectionSeq 每次 selectTask 都自增，
// 因此即便点击中心节点重新选中同一任务（id 不变），watch 也会触发，
// 把 Home 路径重新同步回该任务的 workspace。
watch(
  () => [store.selectedTaskId, store.selectionSeq] as const,
  () => { syncWorkspaceRoot() },
  { immediate: true },
)

// 每次切换到 Workspace 标签页时，重置到 workspace 根目录
// (filesStore.currentPath 可能还停留在上次浏览的子目录)
onMounted(() => {
  syncWorkspaceRoot()
})
</script>

<template>
  <div class="cockpit-file-panel">
    <FilesPanel v-if="hasWorkspace" />
    <div v-else class="cockpit-file-panel__no-workspace">
      任务尚未领取 workspace，请等待 agent claim 后重试
    </div>
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
.cockpit-file-panel__no-workspace {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 40px 24px;
  text-align: center;
}
</style>
