<script setup lang="ts">
// IdeWorkspacePane — IDE 工作区列：复用 upstream FilesPanel（文件树 + 列表 +
// monaco 编辑器 + diff + 预览 + 右键菜单全家）。
//
// root 语义与 CockpitFilePanel 相同：workspace 未设置时不传 root（浏览
// profile home，服务端无沙箱问题）；设置后作为 filesStore.workspaceRoot
// （服务端要求落在 ~/.hermes 内或已知任务 workspace，越界显示错误态）。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdeStore } from '../store/ide'
import { useFilesStore } from '@/stores/hermes/files'
import FilesPanel from '@/components/hermes/chat/FilesPanel.vue'

const ide = useIdeStore()
const filesStore = useFilesStore()
const { t } = useI18n()

const errorState = ref<{ code: string; message: string } | null>(null)
const syncing = ref(true)

const workspaceRootPath = computed(() => ide.workspace)

async function syncWorkspaceRoot() {
  const rootPath = workspaceRootPath.value
  if (!rootPath) {
    filesStore.workspaceRoot = undefined
    filesStore.currentPath = ''
    errorState.value = null
    syncing.value = false
    return
  }
  filesStore.workspaceRoot = rootPath
  filesStore.currentPath = ''
  errorState.value = null
  syncing.value = true
  try {
    await filesStore.fetchEntries('')
  } catch (err) {
    const code = (err as { code?: string })?.code || 'unknown'
    const message = (err as Error)?.message || String(err)
    if (code === 'invalid_path') {
      errorState.value = {
        code,
        message: t('ide.workspaceOutsideSandbox'),
      }
    } else {
      errorState.value = { code, message }
    }
  } finally {
    syncing.value = false
  }
}

watch(workspaceRootPath, () => {
  void syncWorkspaceRoot()
})

onMounted(() => {
  void syncWorkspaceRoot()
})
</script>

<template>
  <div class="ide-workspace-pane">
    <div v-if="syncing" class="ide-workspace-pane__state">
      {{ t('ide.loading') }}
    </div>
    <div v-else-if="errorState" class="ide-workspace-pane__state ide-workspace-pane__state--error">
      <span>{{ errorState.message }}</span>
      <button type="button" class="ide-workspace-pane__reset" @click="ide.setWorkspace(null)">
        {{ t('ide.workspaceReset') }}
      </button>
    </div>
    <FilesPanel v-else />
  </div>
</template>

<style scoped lang="scss">
.ide-workspace-pane {
  display: flex;
  min-height: 0;

  /* FilesPanel 根类是 files-panel-drawer（上游 FilesPanel.vue），非 files-panel */
  :deep(.files-panel-drawer) {
    flex: 1;
    min-width: 0;
  }
}

.ide-workspace-pane__state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--text-muted, #9aa0aa);
  font-size: 13px;
}

.ide-workspace-pane__state--error {
  color: var(--danger-color, #e06c75);
}

.ide-workspace-pane__reset {
  padding: 6px 14px;
  font: inherit;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  background: transparent;
  border: 1px solid var(--border-color, #26292f);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    border-color: var(--accent-primary, #4cc9f0);
  }
}
</style>
