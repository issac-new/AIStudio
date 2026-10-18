<script setup lang="ts">
// IdeFilesPane — 右侧辅助面板「查看文件」页签（09-20 裁定自左侧栏右移）：
// 基于任务会话与项目的视图——根目录响应式跟随当前会话 workspace（回退
// ide.workspace），不与任务列表平行独立存在；保留「查看文件 | Git」双
// 子页签（上游 FileTree + IdeGitPane）。
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useFilesStore } from '@/stores/hermes/files'
import FileTree from '@/components/hermes/files/FileTree.vue'
import type { FileEntry } from '@/api/studio/files'
import IdeGitPane from './IdeGitPane.vue'
import { useIdeStore } from '../store/ide'
import { workspaceLabel } from '../utils/time'

const { t } = useI18n()
const ide = useIdeStore()
const chat = useChatStore()
const filesStore = useFilesStore()

const tab = ref<'tree' | 'git'>('tree')

const root = computed(() => chat.activeSession?.workspace ?? ide.workspace)

// FileTree 的 workspaceKey 只用于根标签；真正决定列目录的根是 filesStore.
// workspaceRoot（上游 FileTree 直接读该 ref）。此前 IDE 只传了标签，页面
// 显示 ide-qa-repo 却列 ~/.hermes（2026-10-18 回归实测），此处补接线。
watch(root, (value) => {
  filesStore.workspaceRoot = value ?? undefined
}, { immediate: true })
onUnmounted(() => {
  filesStore.workspaceRoot = undefined
})

// 文件节点点击 → 走 toolPanel 预览 overlay（IdeChatPane 的 FilePreview 宿主），
// IDE 没有独立编辑器面板，openEditor 无落点。
async function openEntry(entry: FileEntry): Promise<void> {
  if (entry.isDir) return
  filesStore.closePreview()
  await filesStore.openPreview(entry, { profile: null })
}
</script>

<template>
  <div class="ide-files">
    <div class="ide-files__tabs" role="tablist">
      <button type="button" role="tab" class="ide-files__tab" :class="{ 'is-active': tab === 'tree' }" :aria-selected="tab === 'tree'" data-testid="ide-files-tab-tree" @click="tab = 'tree'">{{ t('ide.task.view_files') }}</button>
      <button type="button" role="tab" class="ide-files__tab" :class="{ 'is-active': tab === 'git' }" :aria-selected="tab === 'git'" data-testid="ide-files-tab-git" @click="tab = 'git'">Git</button>
    </div>
    <p class="ide-files__scope" :title="root ?? ''" data-testid="ide-files-scope">{{ root ? workspaceLabel(t, root) : t('ide.task.defaultGroup') }}</p>
    <FileTree
      v-show="tab === 'tree'"
      class="ide-files__tree"
      :profile="null"
      :workspace-key="root"
      show-files
      @open-entry="openEntry"
    />
    <IdeGitPane v-if="tab === 'git'" class="ide-files__git" />
  </div>
</template>

<style scoped lang="scss">
.ide-files {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ide-files__tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px 0;
}

.ide-files__tab {
  flex: 1;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover { color: var(--text-primary); }
  &.is-active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}

.ide-files__scope {
  margin: 0;
  padding: 3px 12px;
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-files__tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px;
}

.ide-files__git { flex: 1; min-height: 0; }
</style>
