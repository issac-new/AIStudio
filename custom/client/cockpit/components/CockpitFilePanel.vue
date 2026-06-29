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
 *   6. 目录不存在时显示友好错误信息
 */
import { watch, onMounted, computed, ref } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useFilesStore } from '@/stores/hermes/files'
import FilesPanel from '@/components/hermes/chat/FilesPanel.vue'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const filesStore = useFilesStore()
const { t } = useI18n()

const hasWorkspace = computed(() => {
  const detailWs = store.selectedTaskDetail?.task?.workspace_path
  const listWs = store.selectedTask?.workspace
  return !!(detailWs ?? listWs)
})

// 错误状态：workspace 目录不存在或其他文件系统错误
const errorState = ref<{ code: string; message: string } | null>(null)

// 把「当前生效的 workspace 根目录」同步到 filesStore 并刷新文件列表。
// 优先从 detail cache（selectedTaskDetail）读取 workspace_path，因为它
// 在每次 selectTask 后都会刷新；cockpitTasks 中的 workspace 可能因
// kanban.tasks 变化触发的 watch 重建而被覆盖为旧值。
// detail 不可用时回退到 cockpitTasks 的 workspace（兼容 detail.task 为 null 的场景）。
async function syncWorkspaceRoot() {
  const wsPath = store.selectedTaskDetail?.task?.workspace_path
    ?? store.selectedTask?.workspace
  if (!wsPath) {
    filesStore.workspaceRoot = undefined
    filesStore.currentPath = ''
    errorState.value = null
    return
  }
  filesStore.workspaceRoot = wsPath
  filesStore.currentPath = ''
  errorState.value = null
  try {
    await filesStore.fetchEntries('')
  } catch (err: any) {
    // 捕获错误并设置友好的错误状态
    const code = err?.code || err?.response?.data?.code || 'unknown'
    const msg = err?.message || err?.response?.data?.error || String(err)
    if (code === 'ENOENT' || code === 'not_found' || msg.includes('ENOENT') || msg.includes('not found') || msg.includes('no such file')) {
      errorState.value = { code: 'ENOENT', message: t('cockpit.workspaceNotFound', '工作区目录不存在（尚未创建或已被清理）') }
    } else {
      errorState.value = { code, message: msg }
    }
  }
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
    <div v-if="errorState" class="cockpit-file-panel__error">
      <span class="cockpit-file-panel__error-icon">⚠️</span>
      <span class="cockpit-file-panel__error-text">{{ errorState.message }}</span>
      <button type="button" class="cockpit-file-panel__error-retry" @click="syncWorkspaceRoot()">
        {{ t('cockpit.retry', '重试') }}
      </button>
    </div>
    <FilesPanel v-else-if="hasWorkspace" />
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
.cockpit-file-panel__error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 24px;
  text-align: center;
}
.cockpit-file-panel__error-icon {
  font-size: 24px;
}
.cockpit-file-panel__error-text {
  color: var(--text-muted);
  font-size: 13px;
  max-width: 400px;
}
.cockpit-file-panel__error-retry {
  font: inherit;
  font-size: 12px;
  padding: 6px 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  &:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
}
</style>
