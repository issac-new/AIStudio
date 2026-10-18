<script setup lang="ts">
// IdeFilesPane — 右侧辅助面板「查看文件」页签（09-20 裁定自左侧栏右移）：
// 基于任务会话与项目的视图——根目录响应式跟随当前会话 workspace（回退
// ide.workspace），不与任务列表平行独立存在；保留「查看文件 | Git」双
// 子页签（上游 FileTree + IdeGitPane）。
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '@/stores/hermes/files'
import FileTree from '@/components/hermes/files/FileTree.vue'
import type { FileEntry } from '@/api/studio/files'
import IdeGitPane from './IdeGitPane.vue'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { workspaceLabel } from '../utils/time'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const { t, locale } = useI18n()
const invalidTx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].filesInvalid)
const filesStore = useFilesStore()
const { root, validation, validate, invalidate } = useIdeWorkspace()

const tab = ref<'tree' | 'git'>('tree')

// FileTree 的 workspaceKey 只用于根标签；真正决定列目录的根是 filesStore.
// workspaceRoot（上游 FileTree 直接读该 ref）。根先校验再接线：非法根只打
// 一次探测请求并显示可解释状态，不让 FileTree 反复 400。
watch(root, async (value) => {
  filesStore.workspaceRoot = undefined
  if (!value) {
    await validate()
    return
  }
  const ok = await validate()
  if (ok && root.value === value) filesStore.workspaceRoot = value
}, { immediate: true })
onUnmounted(() => {
  filesStore.workspaceRoot = undefined
})

async function retryRoot(): Promise<void> {
  invalidate()
  const ok = await validate()
  if (ok) filesStore.workspaceRoot = root.value ?? undefined
}


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
    <p v-if="tab === 'tree' && validation.status === 'checking'" class="ide-files__hint" data-testid="ide-files-checking">{{ t('ide.loading') }}</p>
    <div v-else-if="tab === 'tree' && validation.status === 'invalid'" class="ide-files__invalid" data-testid="ide-files-invalid">
      <p>{{ invalidTx.title(validation.message || invalidTx.fallback) }}</p>
      <button type="button" class="ide-files__retry" @click="retryRoot">{{ invalidTx.retry }}</button>
    </div>
    <FileTree
      v-else-if="tab === 'tree'"
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

.ide-files__hint {
  margin: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.ide-files__invalid {
  margin: 8px 12px;
  padding: 8px 10px;
  border: 1px solid var(--error-color);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-primary);

  p { margin: 0 0 6px; word-break: break-all; }
}

.ide-files__retry {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  border-radius: 4px;
  height: 22px;
  padding: 0 10px;
  font-size: 11px;
  cursor: pointer;
}

.ide-files__tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px;
}

.ide-files__git { flex: 1; min-height: 0; }
</style>
